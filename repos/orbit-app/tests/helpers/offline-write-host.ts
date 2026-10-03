import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { OrbitApiClient } from "../../src/api/client";
import type { DomainChange, DomainPage, OfflineReadEnvelope } from "../../src/api/contract/universal-read";
import { createSyncCoordinator, type SyncCoordinatorSession } from "../../src/data/sync/sync-coordinator";
import type { SyncClient } from "../../src/data/sync/sync-client";
import { createSyncLifecycle } from "../../src/data/sync/sync-lifecycle";
import { uploadAllOutboxes } from "../../src/data/sync/upload-outboxes";

/**
 * Sprint 0136: a scripted Orbit host that speaks the four offline-write routes
 * (notes, personal tasks, personal schedule, relationship messages) and the
 * domain sync protocol, for two or more accounts. Every write is keyed by its
 * idempotency key per account: a replay returns the stored receipt and writes
 * nothing; a different body under a used key is refused. Each committed change
 * is appended to that account's domain log, which the sync pages serve.
 *
 * The device side is the real lifecycle (vault, purge, erase-other-identity),
 * the real coordinator and the App's real upload composition over node:sqlite.
 */
export const BASE_URL = "https://host.example";
export const DOMAINS = ["notes", "tasks", "personal-schedule", "relationship-conversations", "relationship-messages"] as const;
type DomainId = (typeof DOMAINS)[number];

export interface HostRequest { account: string; method: string; path: string; key: string | null; status: number }

interface AccountState {
  workspaceId: string;
  epoch: string;
  logs: Record<DomainId, DomainChange[]>;
  notes: Map<string, Record<string, unknown>>;
  tasks: Map<string, Record<string, unknown>>;
  items: Map<string, Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  receipts: Map<string, { fingerprint: string; status: number; data: unknown }>;
}

export function createHost(accounts: readonly string[]) {
  let clock = Date.parse("2026-10-03T08:00:00.000Z");
  let sequence = 0;
  const tick = () => new Date(clock += 1000).toISOString();
  const state = new Map<string, AccountState>();
  for (const account of accounts) {
    state.set(account, {
      workspaceId: `workspace-${account}`, epoch: "e1",
      logs: Object.fromEntries(DOMAINS.map(domain => [domain, []])) as unknown as Record<DomainId, DomainChange[]>,
      notes: new Map(), tasks: new Map(), items: new Map(), messages: [], receipts: new Map(),
    });
  }
  const host = {
    offline: false,
    /** Every authenticated request answers 401 (the session was revoked on the server). */
    unauthorized: new Set<string>(),
    /** Answers the next N writes with this status before doing anything (server rejection, 5xx). */
    rejectWrites: new Map<string, number>(),
    /** Answers this idempotency key with this status, every time, before doing anything (a permanent refusal). */
    rejectKeys: new Map<string, number>(),
    /** The server applies this key, then the response never arrives (the app is killed mid-request). */
    hangAfterApply: new Set<string>(),
    requests: [] as HostRequest[],
    /** How many times each (account, key) actually changed server data; receipt replays do not count. */
    applied: new Map<string, number>(),
    leaseCalls: 0,
    /** Every call in arrival order: "lease", "write:<key>", "page:<domain>". */
    calls: [] as string[],
    state,
    tick,
    account(id: string): AccountState {
      const value = state.get(id);
      if (!value) throw new Error(`unknown account ${id}`);
      return value;
    },
    publish(account: string, domain: DomainId, id: string, payload: Record<string, unknown> | null) {
      const log = host.account(account).logs[domain];
      log.push(payload ? { id, revision: `r${log.length + 1}`, operation: "upsert", payload } : { id, revision: `r${log.length + 1}`, operation: "delete", payload: null });
    },
    /** Seed or edit a row the way the web page would (an online write by the same account). */
    webTask(account: string, task: Partial<Record<string, unknown>> & { id: string }) {
      const current = host.account(account).tasks.get(task.id);
      const next = { accountId: account, ownerUserId: account, category: "personal", status: "open", priority: "normal", source: "manual", createdAt: tick(), ...current, ...task, updatedAt: tick() };
      host.account(account).tasks.set(task.id, next);
      host.publish(account, "tasks", task.id, next);
      return next;
    },
    webNote(account: string, note: Partial<Record<string, unknown>> & { id: string }) {
      const current = host.account(account).notes.get(note.id);
      const next = { accountId: account, ownerUserId: account, title: "", body: "", manualContactIds: [], mentions: [], contactIds: [], eventIds: [], createdAt: tick(), ...current, ...note,
        version: Number(current?.version ?? 0) + 1, updatedAt: tick() };
      host.account(account).notes.set(note.id, next);
      host.publish(account, "notes", note.id, next);
      return next;
    },
    webSchedule(account: string, item: Partial<Record<string, unknown>> & { id: string }) {
      const current = host.account(account).items.get(item.id);
      const next = { sourceId: item.id, accountId: account, ownerUserId: account, kind: "personal", category: "personal", state: "upcoming", timeZone: "Asia/Tokyo", createdAt: tick(), ...current, ...item, updatedAt: tick() };
      host.account(account).items.set(item.id, next);
      host.publish(account, "personal-schedule", item.id, next);
      return next;
    },
    conversation(account: string, conversationId: string, participants: readonly string[]) {
      host.publish(account, "relationship-conversations", conversationId, {
        conversationId, contactId: `contact:${conversationId}`, participantAccountIds: [...participants],
        participantDisplayNames: Object.fromEntries(participants.map(id => [id, id])), qualificationVersion: "qv_1", status: "active",
        createdAt: tick(), updatedAt: tick(), unreadCount: 0, readSeq: 0, lastMessageSeq: 0, lastMessage: null,
      });
    },
    /** What each account holds on the server, for exactly-once and isolation assertions. */
    snapshot(account: string) {
      const value = host.account(account);
      return JSON.stringify({ notes: [...value.notes], tasks: [...value.tasks], items: [...value.items], messages: value.messages, receipts: [...value.receipts.keys()].sort() });
    },
    lease(account: string): OfflineReadEnvelope {
      const value = host.account(account);
      const now = Date.now();
      return { version: 2, baseUrl: BASE_URL, actorId: account, subject: `user-${account}`, sessionExpiresAt: now + 30 * 86_400_000,
        offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now,
        grants: DOMAINS.map(domainId => ({ workspaceId: value.workspaceId, domainId, authorizationEpoch: value.epoch })), databaseKeyRef: `key-${account}` };
    },
    syncClient(account: string): SyncClient {
      const reachable = () => {
        if (host.offline) throw new TypeError("Network request failed");
        if (host.unauthorized.has(account)) throw Object.assign(new Error("Unauthorized"), { status: 401 });
      };
      return {
        async getLease() { reachable(); host.leaseCalls += 1; host.calls.push("lease"); return host.lease(account); },
        async getManifest() { reachable(); throw new Error("no manifest: pull every domain"); },
        async getDomainPage(input): Promise<DomainPage> {
          reachable();
          host.calls.push(`page:${input.domainId}`);
          const value = host.account(account);
          const log = value.logs[input.domainId as DomainId] ?? [];
          const from = input.cursor ? Number(input.cursor.split(":").pop()) : 0;
          const changes = log.slice(from, from + (input.limit ?? 100));
          const next = from + changes.length;
          return { domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: value.epoch, changes,
            nextCursor: `${input.domainId}:${next}`, highWatermark: String(log.length), hasMore: next < log.length, generation: "g1", serverTime: new Date(clock).toISOString() };
        },
        async getPage() { throw new Error("legacy /api/sync must not be used"); },
      };
    },
    writeClient(account: string): Pick<OrbitApiClient, "post" | "patch" | "delete"> {
      const handle = async (method: string, path: string, options: { body?: unknown; headers?: Record<string, string> }) => {
        if (host.offline) throw new TypeError("Network request failed");
        const body = (options.body ?? {}) as Record<string, unknown>;
        const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : options.headers?.["Idempotency-Key"] ?? null;
        const answer = (status: number, data?: unknown, error?: { code: string; message: string; context?: unknown }) => {
          host.requests.push({ account, method, path, key, status });
          host.calls.push(`write:${key}`);
          return status < 300 ? { success: true as const, status, data, meta: {} } : { success: false as const, status, error: error ?? { code: "ERROR", message: String(status) } };
        };
        if (host.unauthorized.has(account)) return answer(401, undefined, { code: "UNAUTHORIZED", message: "signed out" });
        const rejection = host.rejectWrites.get(account);
        if (rejection !== undefined) {
          host.rejectWrites.delete(account);
          return answer(rejection, undefined, { code: rejection >= 500 ? "INTERNAL" : "VALIDATION_ERROR", message: "rejected by the host" });
        }
        const refusal = key ? host.rejectKeys.get(key) : undefined;
        if (refusal !== undefined) return answer(refusal, undefined, { code: "VALIDATION_ERROR", message: "refused by the host" });
        const value = host.account(account);
        const fingerprint = createHash("sha256").update(`${method} ${path} ${JSON.stringify(body)}`).digest("hex");
        if (key) {
          const receipt = value.receipts.get(key);
          if (receipt) return receipt.fingerprint === fingerprint ? answer(receipt.status, receipt.data) : answer(422, undefined, { code: "REQUEST_REUSED", message: "key reused with a different request" });
        }
        const result = route(account, value, method, path, body);
        if (key && result.status < 300) {
          value.receipts.set(key, { fingerprint, status: result.status, data: result.data });
          host.applied.set(`${account}:${key}`, (host.applied.get(`${account}:${key}`) ?? 0) + 1);
        }
        if (key && host.hangAfterApply.has(key)) {
          host.hangAfterApply.delete(key);
          host.requests.push({ account, method, path, key, status: result.status });
          return new Promise<never>(() => undefined);
        }
        return answer(result.status, result.data, result.error);
      };
      return {
        post: (path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) => handle("POST", path, options),
        patch: (path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) => handle("PATCH", path, options),
        delete: (path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) => handle("DELETE", path, options),
      } as unknown as Pick<OrbitApiClient, "post" | "patch" | "delete">;
    },
  };

  type Result = { status: number; data?: unknown; error?: { code: string; message: string; context?: unknown } };
  const notFound: Result = { status: 404, error: { code: "NOT_FOUND", message: "not found" } };
  const conflict = (context: unknown): Result => ({ status: 409, error: { code: "CONFLICT", message: "changed elsewhere", context } });

  function route(account: string, value: AccountState, method: string, path: string, body: Record<string, unknown>): Result {
    const { idempotencyKey: _key, ...fields } = body;
    const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
    if (segments[1] === "notes") {
      if (method === "POST") {
        const id = `note:${account}:${++sequence}`;
        const note = { id, accountId: account, ownerUserId: account, manualContactIds: [], mentions: [], contactIds: [], eventIds: [], ...fields, version: 1, createdAt: tick(), updatedAt: tick() };
        value.notes.set(id, note); host.publish(account, "notes", id, note);
        return { status: 201, data: { note } };
      }
      const current = value.notes.get(segments[2]!);
      if (!current) return notFound;
      const { expectedVersion, ...patch } = fields;
      if (expectedVersion !== undefined && expectedVersion !== current.version) return conflict(current);
      const note: Record<string, unknown> = { ...current, ...patch, version: Number(current.version) + 1, updatedAt: tick() };
      value.notes.set(note.id as string, note); host.publish(account, "notes", note.id as string, note);
      return { status: 200, data: { note } };
    }
    if (segments[1] === "tasks") {
      if (method === "POST") {
        const id = `task:${account}:${++sequence}`;
        const task = { id, accountId: account, ownerUserId: account, status: "open", priority: "normal", source: "manual", ...fields, createdAt: tick(), updatedAt: tick() };
        value.tasks.set(id, task); host.publish(account, "tasks", id, task);
        return { status: 201, data: { task } };
      }
      const current = value.tasks.get(segments[2]!);
      if (!current) return notFound;
      if (typeof fields.expectedUpdatedAt === "string" && fields.expectedUpdatedAt !== current.updatedAt) return conflict(current);
      if (method === "DELETE") {
        value.tasks.delete(current.id as string); host.publish(account, "tasks", current.id as string, null);
        return { status: 200, data: { task: { ...current, updatedAt: tick() } } };
      }
      const action = fields.action;
      const status = action === "complete" ? "completed" : action === "reopen" ? "open" : action === "cancel" ? "cancelled" : current.status;
      const task: Record<string, unknown> = { ...current, ...(action === "update" ? fields.patch as Record<string, unknown> : {}), status, updatedAt: tick() };
      value.tasks.set(task.id as string, task); host.publish(account, "tasks", task.id as string, task);
      return { status: 200, data: { task } };
    }
    if (segments[1] === "schedule-items") {
      if (JSON.stringify(fields).includes("\"local:")) return { status: 400, error: { code: "VALIDATION_ERROR", message: "temporary ids are not accepted" } };
      if (method === "POST") {
        const id = `personal:${account}:${++sequence}`;
        const item = { id, sourceId: id, accountId: account, ownerUserId: account, kind: "personal", category: "personal", state: "upcoming", ...fields, createdAt: tick(), updatedAt: tick() };
        value.items.set(id, item); host.publish(account, "personal-schedule", id, item);
        return { status: 201, data: { scheduleItem: item } };
      }
      const current = value.items.get(segments[2]!);
      if (!current) return notFound;
      if (fields.expectedUpdatedAt !== current.updatedAt) return conflict(current);
      if (method === "DELETE") {
        value.items.delete(current.id as string); host.publish(account, "personal-schedule", current.id as string, null);
        return { status: 200, data: { scheduleItem: { ...current, state: "cancelled", updatedAt: tick() }, deleted: true } };
      }
      const item: Record<string, unknown> = { ...current, ...fields.patch as Record<string, unknown>, updatedAt: tick() };
      value.items.set(item.id as string, item); host.publish(account, "personal-schedule", item.id as string, item);
      return { status: 200, data: { scheduleItem: item } };
    }
    if (segments[1] === "relationship-communication" && segments[4] === "messages") {
      const conversationId = segments[3]!;
      const conversation = [...value.logs["relationship-conversations"]].reverse().find(change => change.id === conversationId);
      if (!conversation) return { status: 404, error: { code: "NOT_FOUND", message: "no conversation" } };
      // A member writing into a revoked conversation: the real route answers 409 (0135), never stores the message.
      if (conversation.operation === "delete") return { status: 409, error: { code: "CONFLICT", message: "Message eligibility has been revoked." } };
      const seq = value.messages.filter(item => item.conversationId === conversationId).length + 1;
      const messageId = `m:${conversationId}:${account}:${String(fields.requestId)}`;
      const message = { conversationId, seq, messageId, senderAccountId: account, senderDisplayName: account, body: fields.body, sentAt: tick() };
      value.messages.push(message);
      host.publish(account, "relationship-messages", `${conversationId}/${seq}`, message);
      return { status: 201, data: { conversationId, deliveryState: "delivered", qualificationVersion: fields.qualificationVersion,
        message: { ...message, deliveryState: "delivered" } } };
    }
    return notFound;
  }
  return host;
}

export type Host = ReturnType<typeof createHost>;

/** SecureStore, SQLCipher and the file list of one simulated iPhone; files persist across process restarts. */
export function createDevice() {
  const keys = new Map<string, string>();
  const files = new Map<string, DatabaseSync>();
  const native = {
    crypto: {
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digestStringAsync: async (_: string, value: string) => createHash("sha256").update(value).digest("hex"),
      getRandomBytesAsync: async (size: number) => randomBytes(size),
    },
    secureStore: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 7,
      async getItemAsync(key: string) { return keys.get(key) ?? null; },
      async setItemAsync(key: string, value: string) { keys.set(key, value); },
      async deleteItemAsync(key: string) { keys.delete(key); },
    },
    sqlite: {
      async listDatabaseNames() { return [...files.keys()]; },
      async deleteDatabaseAsync(name: string) { files.get(name)?.close(); files.delete(name); },
      async openDatabaseAsync(name: string) {
        const database = files.get(name) ?? new DatabaseSync(":memory:");
        files.set(name, database);
        return {
          async execAsync(sql: string) { if (!sql.startsWith("PRAGMA key")) database.exec(sql); },
          async getFirstAsync(sql: string, params: never[] = []) {
            if (sql === "PRAGMA cipher_version") return { cipher_version: "4.0" };
            return database.prepare(sql).get(...params) ?? null;
          },
          async getAllAsync(sql: string, params: never[] = []) { return database.prepare(sql).all(...params); },
          async runAsync(sql: string, params: never[] = []) { return database.prepare(sql).run(...params); },
          async closeAsync() {},
        };
      },
    },
  };
  return {
    keys, files, native,
    /** Uninstall: iOS removes the app container (every database file); the Keychain stays. */
    uninstall() { for (const database of files.values()) database.close(); files.clear(); },
    close() { for (const database of files.values()) { try { database.close(); } catch { /* closed */ } } },
  };
}

export type Device = ReturnType<typeof createDevice>;

/** One app process on the device: its own lifecycle and coordinator, signed in as `account`. */
export function launchApp(device: Device, host: Host, account: string) {
  const lifecycle = createSyncLifecycle({ platform: "ios", loadNative: async () => device.native as never, report: () => undefined });
  return { lifecycle, open: () => openSession(lifecycle, host, account) };
}

export function openSession(lifecycle: ReturnType<typeof createSyncLifecycle>, host: Host, account: string, options: { offlineMode?: boolean } = {}) {
  const changes: string[] = [];
  const coordinator = createSyncCoordinator({
    lifecycle,
    hashPayload: async value => createHash("sha256").update(value).digest("hex"),
    uploadOutbox: uploadAllOutboxes,
  });
  const session: SyncCoordinatorSession = coordinator.openScope({
    actorId: account, baseUrl: BASE_URL, client: host.syncClient(account), writeClient: host.writeClient(account),
    scopeKey: `${account}-${Math.random()}`, ...(options.offlineMode ? { offlineMode: true } : {}),
  });
  session.subscribe?.(change => changes.push(change.type));
  let rounds = 0;
  return {
    session, changes,
    get rounds() { return rounds; },
    async sync(reason: "explicit" | "mount" = "explicit") {
      rounds += 1;
      const request = session.synchronize("note", { reason });
      await request.started;
      return request.promise;
    },
    async queue() {
      const out: Array<{ mutationId: string; domainId: string; state: string; recordId: string; errorCode: string | null }> = [];
      for (const kind of ["note", "task", "personal_schedule", "relationship_message"] as const) {
        const overlay = await session.readOutboxOverlay(kind);
        for (const row of overlay?.queuedMutations ?? []) out.push({ mutationId: row.mutationId, domainId: row.domainId, state: row.state, recordId: row.id, errorCode: row.lastErrorCode });
      }
      return out;
    },
    async records(kind: "note" | "task" | "personal_schedule" | "relationship_message") {
      return (await session.readCollection(kind))?.records ?? [];
    },
    close() { session.deactivate(); },
  };
}

export const settle = () => new Promise<void>(resolve => setImmediate(resolve));
