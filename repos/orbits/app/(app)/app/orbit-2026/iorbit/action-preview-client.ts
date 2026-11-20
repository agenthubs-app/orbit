"use client";

/**
 * agent-design AG07: the web side of the protocol-3 conversation (设计稿 §7, 附录 D) — send, read a request's result
 * document by requestId, follow the session's channel (EventSource, resumable by Last-Event-ID), decide a card with
 * the revision and hash it showed, re-generate an expired card, click an option under a question.
 *
 * Nothing here formats or assembles what the user reads: the card comes from the server's preview and is shown
 * through shared/compute/agent-card-view.ts; the answer, its basis line and links are the document's.
 * No polling timers and no router.refresh (web no-flash rules): a document is read when the page needs it (a
 * restored conversation, the tab becoming visible again, the browser coming back online) and otherwise arrives on
 * the channel.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { agentActionPreviewSchema, agentReferenceCheckResultSchema, agentResultDocumentSchema, agentSendReceiptSchema, agentSessionEventSchema } from "../../../../../shared/api-schema/agent-v1";
import { answerRecordCheckInput, answerRecordKey, answerRecordsIn } from "../../../../../shared/compute/agent-answer-blocks";
import type { AgentActionPreviewContract, AgentAnswerLinkContract, AgentAnswerRecordContract, AgentResultDocument, AgentRunStage, AgentSendReceiptContract } from "../../../../../shared/contract/agent-v1";
import type { AiSessionOriginInputContract, AiSessionReferenceContract, AiPageContextContract } from "../../../../../shared/contract/ai-sessions";

const json = { "content-type": "application/json" };

/** AG20a (decision 8, 设计稿 §3.1): the device's time zone, sent with each message; none when the browser cannot say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 && zone.length <= 64 ? zone : null;
  } catch {
    return null;
  }
}

/** "assistant:<requestId>" or "assistant:<requestId>:<selection key>": the request a stored assistant message answers. */
export function requestIdOfAssistantMessage(id: string | null | undefined): string | null {
  const match = /^assistant:(agreq_[0-9a-f]+)/u.exec(id ?? "");
  return match ? match[1] : null;
}

export interface AgentV1SendInput {
  sessionId: string;
  clientMessageId: string;
  locale: "zh" | "ja" | "en";
  message: string;
  origin?: AiSessionOriginInputContract;
  pageContext?: AiPageContextContract;
  /** AG11: the records picked with @, each with its marker's place in the (trimmed) message. */
  references?: readonly AiSessionReferenceContract[];
}

export async function sendAgentV1(input: AgentV1SendInput, signal?: AbortSignal): Promise<AgentSendReceiptContract | null> {
  const zone = deviceTimeZone();
  const response = await fetch("/api/ai/conversations", {
    body: JSON.stringify({ clientMessageId: input.clientMessageId, locale: input.locale, message: input.message, protocolVersion: 3, references: input.references ?? [], sessionId: input.sessionId, ...(input.origin ? { origin: input.origin } : {}), ...(input.pageContext ? { pageContext: input.pageContext } : {}), ...(zone ? { timeZone: zone } : {}) }),
    credentials: "same-origin",
    headers: json,
    method: "POST",
    signal,
  });
  const body = (await response.json().catch(() => null)) as { data?: { agentRequest?: unknown } } | null;
  const parsed = agentSendReceiptSchema.safeParse(body?.data?.agentRequest);
  return parsed.success ? parsed.data : null;
}

export async function readAgentV1Document(sessionId: string, requestId: string, signal?: AbortSignal): Promise<AgentResultDocument | null> {
  const response = await fetch(`/api/ai/conversations/sessions/${encodeURIComponent(sessionId)}?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { data?: { agentRequest?: unknown } } | null;
  const parsed = agentResultDocumentSchema.safeParse(body?.data?.agentRequest);
  return parsed.success ? parsed.data : null;
}

export type CardActionResult = { ok: true; card: AgentActionPreviewContract | null } | { ok: false; card: AgentActionPreviewContract | null };

async function cardCall(path: string, body: unknown): Promise<CardActionResult> {
  try {
    const response = await fetch(path, { body: JSON.stringify(body), credentials: "same-origin", headers: json, method: "POST" });
    const payload = (await response.json().catch(() => null)) as { data?: { card?: unknown } } | null;
    const parsed = agentActionPreviewSchema.safeParse(payload?.data?.card);
    const card = parsed.success ? parsed.data : null;
    // A refused click (expired, closed, changed) still carries the latest card: it is shown, never an error code.
    return { card, ok: response.ok || Boolean(card) };
  } catch {
    return { card: null, ok: false };
  }
}

const randomKey = (kind: string) => `${kind}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

/** A button decision with the revision and hash this page shows (设计稿 §5.1). */
export function decideAgentCard(card: AgentActionPreviewContract, transition: "confirm" | "reject" | "retry" | "mark_done" | "abandon", operationId?: string): Promise<CardActionResult> {
  return cardCall(`/api/agent/ledger/${encodeURIComponent(card.actionId)}/transition`, { clientDecisionId: randomKey("decision"), payloadHash: card.payloadHash, revision: card.revision, transition, ...(operationId ? { operationId } : {}) });
}

export function regenerateAgentCard(card: AgentActionPreviewContract): Promise<CardActionResult> {
  return cardCall(`/api/agent/ledger/${encodeURIComponent(card.actionId)}/regenerate`, {});
}

export function removeAgentCardItem(card: AgentActionPreviewContract, operationId: string): Promise<CardActionResult> {
  return cardCall(`/api/agent/ledger/${encodeURIComponent(card.actionId)}/edit`, { payloadHash: card.payloadHash, removeOperationId: operationId, revision: card.revision });
}

export async function selectAgentOption(input: { sessionId: string; requestId: string; clarificationId: string; optionId: string }): Promise<boolean> {
  try {
    const response = await fetch("/api/ai/conversations", {
      body: JSON.stringify({ clientSelectionId: randomKey("selection"), protocolVersion: 3, selection: { clarificationId: input.clarificationId, optionId: input.optionId, requestId: input.requestId }, sessionId: input.sessionId }),
      credentials: "same-origin",
      headers: json,
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Stop the request that is running (or queued); its late result is not delivered (AG01). */
export async function cancelAgentV1(requestId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/ai/runs/${encodeURIComponent(requestId)}/transition`, { body: JSON.stringify({ action: "cancel" }), credentials: "same-origin", headers: json, method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * AG19: where a record card of the answer opens on the web — every one of the six kinds has a page.
 * 待办 opens that one to-do (D3); 笔记 opens on its person's page, or in the notes tab when it has no person (D5); 日程 opens
 * the calendar on its day; 我去过 opens the event it is about (a private one in the events page's panel, AG13).
 */
export function agentRecordHref(record: Pick<AgentAnswerRecordContract, "kind" | "id" | "contactId" | "eventKind" | "eventId" | "day">): string | null {
  const id = encodeURIComponent(record.id);
  const privateEvent = (eventId: string) => `/app/events?${new URLSearchParams({ privateEvent: eventId, tab: "going" })}`;
  switch (record.kind) {
    case "contact":
      return `/app/contacts/${id}`;
    case "memo":
      return record.contactId ? `/app/contacts/${encodeURIComponent(record.contactId)}` : `/app/tasks?${new URLSearchParams({ memo: record.id, tab: "memo" })}`;
    case "todo":
      return `/app/tasks/${id}`;
    case "schedule":
      return `/app/tasks?${new URLSearchParams({ tab: "calendar", ...(record.day ? { date: record.day } : {}) })}`;
    case "event":
      return record.eventKind === "private" || record.id.startsWith("private_event:") ? privateEvent(record.id) : `/app/events/${id}`;
    case "attendance":
      if (!record.eventId) return "/app/events?tab=going";
      return record.eventKind === "private" ? privateEvent(record.eventId) : `/app/events/${encodeURIComponent(record.eventId)}`;
    default:
      return null;
  }
}

/** Where a record link of the answer's basis line opens on the web (the same table as the cards). */
export function agentLinkHref(link: AgentAnswerLinkContract): string | null {
  return agentRecordHref({ id: link.id, kind: link.type, ...(link.contactId ? { contactId: link.contactId } : {}) });
}

/**
 * AG14 (approved draft D5): the memory part of the settings page; with an entry, that entry opens ready to edit
 * (「修改 ›」 of a memory chip, 「去设置 ›」 of a memory note).
 */
export function memorySettingsHref(memoryId?: string | null): string {
  return `/app/settings/iorbit${memoryId ? `?${new URLSearchParams({ memory: memoryId })}` : ""}#memory`;
}

/** A document older than this was not verified a moment ago: its cards are checked once (still there, still yours). */
const GONE_CHECK_AFTER_MS = 120_000;

/**
 * AG19-5: the records on the cards of older answers that are gone or cannot be seen any more ("kind:id"). One request per
 * batch of records not checked yet (the @ picker's check, POST /api/agent/references/check); an answer delivered just now
 * was verified by the server and is not asked about. A check that fails leaves the cards as they are.
 */
export function useAnswerRecordsGone(documents: ReadonlyMap<string, AgentResultDocument>, enabled: boolean): ReadonlySet<string> {
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const pending = answerRecordsIn([...documents.values()].filter((document) => now - Date.parse(document.updatedAt) > GONE_CHECK_AFTER_MS).flatMap((document) => document.answer?.blocks ?? [])).filter((record) => !asked.current.has(answerRecordKey(record)));
    if (!pending.length) return;
    const batch = answerRecordCheckInput(pending);
    for (const record of batch) asked.current.add(`${record.type}:${record.id}`);
    if (!batch.length) return;
    let cancelled = false;
    void fetch("/api/agent/references/check", { body: JSON.stringify({ references: batch }), credentials: "same-origin", headers: json, method: "POST" })
      .then(async (response) => (response.ok ? agentReferenceCheckResultSchema.safeParse(((await response.json()) as { data?: unknown }).data) : null))
      .then((parsed) => {
        if (cancelled || !parsed?.success) return;
        const closed = parsed.data.references.filter((item) => !item.accessible).map((item) => `${item.type}:${item.id}`);
        if (closed.length) setGone((previous) => new Set([...previous, ...closed]));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [documents, enabled]);
  return gone;
}

export interface AgentV1SessionState {
  documents: ReadonlyMap<string, AgentResultDocument>;
  /** Progress of a running request, from the channel (设计稿: code says the step). */
  stages: ReadonlyMap<string, AgentRunStage>;
  online: boolean;
  /** A card this page decided or re-generated: shown at once, before the document follows. */
  noteCard(card: AgentActionPreviewContract | null): void;
  cards: ReadonlyMap<string, AgentActionPreviewContract>;
  /** Read these requests' documents now (a restored conversation). */
  load(requestIds: readonly string[]): void;
  track(requestId: string): void;
}

/**
 * The documents of one session's protocol-3 requests: the channel while the page is open and online, a read by
 * requestId when a request is first seen (restored), when the tab becomes visible again and after going online.
 */
export function useAgentV1Session(sessionId: string | null, enabled: boolean): AgentV1SessionState {
  const [documents, setDocuments] = useState<Map<string, AgentResultDocument>>(() => new Map());
  const [stages, setStages] = useState<Map<string, AgentRunStage>>(() => new Map());
  const [cards, setCards] = useState<Map<string, AgentActionPreviewContract>>(() => new Map());
  const [online, setOnline] = useState(true);
  const known = useRef(new Set<string>());
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const keep = useCallback((document: AgentResultDocument) => {
    setDocuments((current) => {
      const before = current.get(document.requestId);
      if (before && before.revision > document.revision) return current;
      const next = new Map(current);
      next.set(document.requestId, document);
      return next;
    });
    if (document.status !== "running") setStages((current) => (current.has(document.requestId) ? new Map([...current].filter(([id]) => id !== document.requestId)) : current));
  }, []);

  const readAll = useCallback((ids: readonly string[]) => {
    const session = sessionRef.current;
    if (!session) return;
    for (const id of ids) void readAgentV1Document(session, id).then((document) => { if (document && sessionRef.current === session) keep(document); }).catch(() => undefined);
  }, [keep]);

  useEffect(() => {
    known.current = new Set();
    setDocuments(new Map());
    setStages(new Map());
    setCards(new Map());
  }, [sessionId]);

  useEffect(() => {
    if (typeof navigator !== "undefined") setOnline(navigator.onLine !== false);
    const up = () => { setOnline(true); readAll([...known.current]); };
    const down = () => setOnline(false);
    const visible = () => { if (document.visibilityState === "visible") readAll([...known.current]); };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [readAll]);

  useEffect(() => {
    if (!enabled || !sessionId || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/ai/conversations/sessions/${encodeURIComponent(sessionId)}/events`, { withCredentials: true });
    const onEvent = (raw: MessageEvent) => {
      let parsed: ReturnType<typeof agentSessionEventSchema.safeParse>;
      try {
        parsed = agentSessionEventSchema.safeParse(JSON.parse(String(raw.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const event = parsed.data;
      known.current.add(event.requestId);
      if (event.document) keep(event.document);
      else if (event.stage && event.status === "running") setStages((current) => new Map(current).set(event.requestId, event.stage!));
      else setDocuments((current) => {
        const before = current.get(event.requestId);
        if (!before || before.status === event.status) return current;
        return new Map(current).set(event.requestId, { ...before, status: event.status });
      });
    };
    for (const kind of ["accepted", "status", "document"]) source.addEventListener(kind, onEvent as EventListener);
    return () => source.close();
  }, [enabled, sessionId, keep]);

  const noteCard = useCallback((card: AgentActionPreviewContract | null) => {
    if (!card) return;
    setCards((current) => new Map(current).set(card.actionId, card));
  }, []);
  const load = useCallback((ids: readonly string[]) => {
    const fresh = ids.filter((id) => !known.current.has(id));
    for (const id of fresh) known.current.add(id);
    if (fresh.length) readAll(fresh);
  }, [readAll]);
  const track = useCallback((id: string) => { known.current.add(id); }, []);
  return { cards, documents, load, noteCard, online, stages, track };
}

/** The newer of the document's card and one this page holds from its own click. */
export function latestCard(fromDocument: AgentActionPreviewContract | undefined, fromClick: AgentActionPreviewContract | undefined): AgentActionPreviewContract | null {
  if (!fromDocument) return fromClick ?? null;
  if (!fromClick) return fromDocument;
  if (fromClick.revision !== fromDocument.revision) return fromClick.revision > fromDocument.revision ? fromClick : fromDocument;
  return fromClick.updatedAt > fromDocument.updatedAt ? fromClick : fromDocument;
}
