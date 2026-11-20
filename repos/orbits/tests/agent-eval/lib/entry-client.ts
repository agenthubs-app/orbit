/**
 * The runner's two clients on the protocol-3 entry (agent-design AG01, ENT area).
 *
 * Each client (web, app) keeps a subscription to the session's event channel (SSE with
 * Last-Event-ID), remembers the last seq it received and the latest result document per request,
 * and can drop the channel and reconnect from that seq. A client that comes back reads the results
 * by requestId, as the real clients do. What a client "shows" at the end is that map of documents;
 * client_view_matches_result compares it with what the server stored.
 *
 * Waiting between steps reads the eval database directly (never through a client), so it adds
 * nothing to what the clients saw.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

import type { AgentResultDocument, AgentSessionEventContract } from "../../../shared/contract/agent-v1";
import { CaseLog, safeHeaders } from "./trace-log";

export interface EntryAck {
  client: string;
  step: number;
  resend: boolean;
  message: string;
  httpId: string;
  httpStatus: number;
  requestId: string | null;
  status: string | null;
  replayed: boolean | null;
  error: string | null;
}

export interface EntryRequestRow {
  requestId: string;
  sessionId: string;
  message: string;
  status: string;
  receivedSeq: number;
  receivedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  attempts: number;
  arrivedWhileRunning: boolean;
  queueAheadAtArrival: number;
  document: AgentResultDocument;
}

export interface ClientChannel {
  name: string;
  online: boolean;
  lastSeq: number;
  received: number[];
  duplicates: number[];
  docs: Map<string, AgentResultDocument>;
  known: Set<string>;
  /** The last status the channel showed per request (what the client displays while it runs). */
  statuses: Map<string, string>;
  /** Requests this client has received at least one channel event for. */
  eventFor: Set<string>;
  controller: AbortController | null;
  loop: Promise<void> | null;
}

const FINAL = new Set(["completed", "failed", "cancelled"]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A disconnect "while running" means the client has already seen part of that turn on the channel
 * (AE-ENT-006: it then resumes after a seq > 0). Waits for one event of the turn; if the turn ends
 * (or the wait times out) first, the disconnect is late and the reason says why.
 */
/**
 * AG14 UI run (judge finding on AE-MEM-003, 008, AE-FN-002): a request's row reads "completed" a moment before its
 * result document reaches the session's channel. Leaving the conversation in that moment closed the clients' channels
 * of it, so the answer before 「新开对话」 never reached either client view although the server stored and pushed it.
 * Before leaving a conversation the runner now waits, as a person who reads the answer before tapping 新对话, until each
 * online client holds every stored document of that conversation's ended requests.
 */
export function sessionDelivered(rows: readonly Pick<EntryRequestRow, "requestId" | "sessionId" | "status" | "document">[], sessionId: string, channels: readonly Pick<ClientChannel, "online" | "docs">[]): boolean {
  const ended = rows.filter((row) => row.sessionId === sessionId && row.document && (FINAL.has(row.status) || row.status === "waiting_user"));
  return channels.filter((channel) => channel.online).every((channel) => ended.every((row) => JSON.stringify(channel.docs.get(row.requestId) ?? null) === JSON.stringify(row.document)));
}

export async function waitForChannelEvent(input: { hasEvent: () => boolean; isRunning: () => Promise<boolean>; timeoutMs?: number; pollMs?: number }): Promise<{ late: boolean; reason?: string }> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (input.hasEvent()) return { late: false };
    if (!(await input.isRunning())) {
      return input.hasEvent() ? { late: false } : { late: true, reason: "the turn ended before the client received any channel event of it" };
    }
    await sleep(input.pollMs ?? 50);
  }
  return input.hasEvent() ? { late: false } : { late: true, reason: `no channel event within ${timeoutMs} ms` };
}

export class EntryHarness {
  readonly channels = new Map<string, ClientChannel>();
  readonly acks: EntryAck[] = [];
  readonly sessions = new Set<string>();
  private sessionId: string;

  constructor(private readonly options: {
    baseUrl: string;
    log: CaseLog;
    db: pg.Client;
    actorId: () => string;
    cookie: () => Promise<string>;
    sessionId: string;
  }) {
    this.sessionId = options.sessionId;
    this.sessions.add(options.sessionId);
  }

  channel(name: string): ClientChannel {
    let channel = this.channels.get(name);
    if (!channel) {
      channel = { controller: null, docs: new Map(), duplicates: [], known: new Set(), lastSeq: 0, loop: null, name, online: false, received: [], statuses: new Map(), eventFor: new Set() };
      this.channels.set(name, channel);
    }
    return channel;
  }

  /** Both clients start online and subscribed (ENT.yaml header: the end not on stage is online too). */
  async start(names: readonly string[]): Promise<void> {
    for (const name of names) this.connect(name);
    await sleep(150);
  }

  connect(name: string): void {
    const channel = this.channel(name);
    if (channel.online) return;
    channel.online = true;
    channel.loop = this.subscribe(channel);
  }

  disconnect(name: string): void {
    const channel = this.channel(name);
    channel.online = false;
    channel.controller?.abort();
    this.options.log.push({ client: name, lastSeq: channel.lastSeq, reason: "client disconnected", type: "client.channel_closed" });
  }

  /** New conversation or another account: channels follow the new session from its first event. */
  async switchSession(sessionId: string): Promise<void> {
    const online = [...this.channels.values()].filter((channel) => channel.online).map((channel) => channel.name);
    for (const name of online) {
      const channel = this.channel(name);
      channel.online = false;
      channel.controller?.abort();
      await channel.loop?.catch(() => undefined);
      channel.lastSeq = 0;
    }
    this.sessionId = sessionId;
    this.sessions.add(sessionId);
    for (const name of online) this.connect(name);
  }

  get currentSessionId(): string {
    return this.sessionId;
  }

  private async subscribe(channel: ClientChannel): Promise<void> {
    while (channel.online) {
      const controller = new AbortController();
      channel.controller = controller;
      const path = `/api/ai/conversations/sessions/${encodeURIComponent(this.sessionId)}/events`;
      const httpId = randomUUID();
      const headers: Record<string, string> = { accept: "text/event-stream", cookie: await this.options.cookie(), "last-event-id": String(channel.lastSeq) };
      if (channel.name !== "web") headers["user-agent"] = "OrbitApp/agent-eval";
      this.options.log.push({ body: null, client: channel.name, headers: safeHeaders(headers), httpId, method: "GET", path, purpose: channel.lastSeq ? `resubscribe after seq ${channel.lastSeq}` : "subscribe", type: "http.request" });
      try {
        const response = await fetch(`${this.options.baseUrl}${path}`, { headers, signal: controller.signal });
        this.options.log.push({ body: "(event stream)", client: channel.name, headers: safeHeaders(response.headers), httpId, path, status: response.status, type: "http.response" });
        if (!response.ok || !response.body) {
          await sleep(500);
          continue;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut = buffer.indexOf("\n\n");
          while (cut >= 0) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = frame.split("\n").find((line) => line.startsWith("data: "));
            if (data) this.receive(channel, JSON.parse(data.slice(6)) as AgentSessionEventContract);
            cut = buffer.indexOf("\n\n");
          }
        }
        if (channel.online) this.options.log.push({ client: channel.name, lastSeq: channel.lastSeq, reason: "server closed the stream", type: "client.channel_closed" });
      } catch (error) {
        if (channel.online) this.options.log.push({ client: channel.name, error: error instanceof Error ? error.message : String(error), lastSeq: channel.lastSeq, type: "client.channel_error" });
      }
      if (channel.online) await sleep(200);
    }
  }

  private receive(channel: ClientChannel, event: AgentSessionEventContract): void {
    const duplicate = event.seq <= channel.lastSeq;
    this.options.log.push({ channelSeq: event.seq, client: channel.name, duplicate, kind: event.kind, requestId: event.requestId, revision: event.document?.revision ?? null, status: event.status, type: "client.channel_event" });
    if (duplicate) {
      channel.duplicates.push(event.seq);
      return;
    }
    channel.lastSeq = event.seq;
    channel.received.push(event.seq);
    channel.known.add(event.requestId);
    channel.eventFor.add(event.requestId);
    channel.statuses.set(event.requestId, event.status);
    if (event.document) this.keep(channel, event.document);
  }

  private keep(channel: ClientChannel, document: AgentResultDocument): void {
    const known = channel.docs.get(document.requestId);
    if (!known || document.revision >= known.revision) channel.docs.set(document.requestId, document);
  }

  /** Reads each known request back by requestId through this client (GET conversation/request). */
  async readBack(name: string, request: (path: string, purpose: string) => Promise<{ status: number; body: any }>): Promise<number> {
    const channel = this.channel(name);
    let read = 0;
    for (const requestId of channel.known) {
      const result = await request(`/api/ai/conversations/sessions/${encodeURIComponent(this.sessionId)}?requestId=${encodeURIComponent(requestId)}`, "read result by requestId");
      const document = result.body?.data?.agentRequest as AgentResultDocument | undefined;
      if (document) {
        this.keep(channel, document);
        read += 1;
      }
    }
    return read;
  }

  noteSent(name: string, requestId: string | null, status: string | null): void {
    if (!requestId) return;
    const channel = this.channel(name);
    channel.known.add(requestId);
    if (status && !channel.statuses.has(requestId)) channel.statuses.set(requestId, status);
  }

  /** The turn this client shows as running (its channel, else its own acks); what "stop" applies to. */
  runningAsSeenBy(name: string): string | null {
    const channel = this.channel(name);
    const running = [...channel.statuses.entries()].filter(([, status]) => status === "running").map(([requestId]) => requestId);
    return running[running.length - 1] ?? null;
  }

  /** The protocol-3 requests of the case's sessions, from the eval database. */
  async requests(): Promise<EntryRequestRow[]> {
    const result = await this.options.db.query<{ payload: any }>(
      `select payload from orbit_records
        where collection_name = 'orbit_agent_chat_requests' and user_id = $1
          and payload ->> 'protocolVersion' = '3' and payload ->> 'sessionId' = any($2::text[])`,
      [this.options.actorId(), [...this.sessions]],
    );
    return result.rows.map(({ payload }) => ({
      arrivedWhileRunning: Boolean(payload.arrivedWhileRunning),
      attempts: Number(payload.attempts ?? 0),
      document: payload.document,
      endedAt: payload.endedAt ?? null,
      message: String(payload.input?.message ?? ""),
      queueAheadAtArrival: Number(payload.queueAheadAtArrival ?? 0),
      receivedAt: String(payload.receivedAt),
      receivedSeq: Number(payload.receivedSeq),
      requestId: String(payload.requestId),
      sessionId: String(payload.sessionId),
      startedAt: payload.startedAt ?? null,
      status: String(payload.status),
    })).sort((left, right) => left.sessionId === right.sessionId ? left.receivedSeq - right.receivedSeq : left.receivedAt.localeCompare(right.receivedAt));
  }

  /** Until every request of the session has ended (the step without while_running). */
  async waitIdle(timeoutMs = 240_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await this.requests();
      // AG03: a request delivered and waiting for the user (waiting_user) holds up nothing.
      if (rows.every((row) => FINAL.has(row.status) || row.status === "waiting_user")) return true;
      await sleep(400);
    }
    return false;
  }

  /** Until a request of the current session is running (a step with while_running). */
  async waitRunning(timeoutMs = 60_000): Promise<EntryRequestRow | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const running = (await this.requests()).find((row) => row.sessionId === this.sessionId && row.status === "running");
      if (running) return running;
      await sleep(100);
    }
    return null;
  }

  /** Before a while_running disconnect: until this client has an event of the running turn (or it ended). */
  async waitForEventOfRunningTurn(name: string, timeoutMs = 30_000): Promise<{ requestId: string | null; late: boolean; reason?: string }> {
    const running = (await this.requests()).find((row) => row.sessionId === this.sessionId && row.status === "running");
    if (!running) return { late: true, reason: "no turn of the session was running when the disconnect step came", requestId: null };
    const channel = this.channel(name);
    const outcome = await waitForChannelEvent({
      hasEvent: () => channel.eventFor.has(running.requestId),
      isRunning: async () => (await this.requests()).some((row) => row.requestId === running.requestId && row.status === "running"),
      timeoutMs,
    });
    return { ...outcome, requestId: running.requestId };
  }

  /** Until each online client's documents equal the stored ones (it has caught up on the channel). */
  async settleViews(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const stored = await this.requests();
      const caughtUp = [...this.channels.values()].filter((channel) => channel.online).every((channel) =>
        stored.every((row) => JSON.stringify(channel.docs.get(row.requestId) ?? null) === JSON.stringify(row.document)));
      if (caughtUp) return;
      await sleep(300);
    }
  }

  /** Before leaving the current conversation: until each online client holds its ended requests' documents (sessionDelivered). */
  async settleSession(timeoutMs = 15_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (sessionDelivered(await this.requests(), this.sessionId, [...this.channels.values()])) return true;
      await sleep(200);
    }
    return false;
  }

  /** The highest event seq of the current session (for a reconnecting client to catch up to). */
  async serverLastSeq(): Promise<number> {
    const result = await this.options.db.query<{ seq: string | null }>(
      `select max((payload ->> 'seq')::bigint) as seq from orbit_records
        where collection_name = 'agent_v1_session_events' and user_id = $1 and target_id = $2`,
      [this.options.actorId(), this.sessionId],
    );
    return Number(result.rows[0]?.seq ?? 0);
  }

  async waitCaughtUp(name: string, timeoutMs = 8_000): Promise<void> {
    const target = await this.serverLastSeq();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && this.channel(name).lastSeq < target) await sleep(100);
  }

  async close(): Promise<void> {
    for (const channel of this.channels.values()) {
      channel.online = false;
      channel.controller?.abort();
    }
    await Promise.all([...this.channels.values()].map((channel) => channel.loop?.catch(() => undefined)));
  }
}
