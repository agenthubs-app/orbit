/**
 * agent-design AG07: the App side of the protocol-3 conversation (设计稿 §7, 附录 D) — ask once which protocol the
 * server speaks, send, read a request's result document by requestId, decide a card with the revision and hash it
 * showed, look at a waiting card again after a sync, re-generate an expired card, click an option under a question.
 * Nothing here formats what the user reads: the card is shown through api/compute/agent-card-view.ts.
 * A decision is never queued offline (设计稿 §7): every call needs the network, and a failed one is not retried.
 */
import { agentActionPreviewSchema, agentReferenceCheckResultSchema, agentReferenceSearchResultSchema, agentResultDocumentSchema, agentSendReceiptSchema } from "./schema/agent-v1";
import type { AgentActionPreviewContract, AgentAnswerLinkContract, AgentAnswerRecordContract, AgentReferenceSearchKind, AgentReferenceSearchResultContract, AgentResultDocument, AgentSendReceiptContract } from "./contract/agent-v1";
import type { AiSessionOriginInputContract, AiSessionReferenceContract } from "./contract/ai-sessions";
import type { OrbitApiClient } from "./client";
import { ORBIT_API_ENDPOINTS } from "./endpoints";

export const AGENT_V1_PROTOCOL_PATH = `${ORBIT_API_ENDPOINTS.conversations}/protocol`;

const cardPath = (actionId: string, action?: string) => `/api/agent/ledger/${encodeURIComponent(actionId)}${action ? `/${action}` : ""}`;
const randomKey = (kind: string) => `${kind}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

let protocol: Promise<2 | 3 | null> | null = null;

/**
 * The protocol the server says it speaks (3 when ORBIT_AGENT_V1_MODE=on, 2 when it says otherwise or has no such
 * route), or null when it could not be asked (offline, a server error). Asked once per process; a null or a 2 is
 * asked again next time. AG07 repair 2: a send waits for this answer, and on null sends nothing — it never falls
 * back to protocol 2 because the check was slow or failed.
 */
export function agentProtocolForSend(client: OrbitApiClient): Promise<2 | 3 | null> {
  protocol ??= client.get<{ protocolVersion?: number }>(AGENT_V1_PROTOCOL_PATH)
    .then((result) => (result.success ? (result.data?.protocolVersion === 3 ? 3 : 2) : result.status === 0 || result.status >= 500 ? null : 2) as 2 | 3 | null)
    .catch(() => null)
    .then((value) => {
      if (value !== 3) protocol = null;
      return value;
    });
  return protocol;
}

/** The protocol for showing turns: 3, or 2 when the server says so or cannot be asked. */
export function agentProtocolVersion(client: OrbitApiClient): Promise<2 | 3> {
  return agentProtocolForSend(client).then((value) => value ?? 2);
}

/** For tests. */
export function resetAgentProtocolForTests(): void {
  protocol = null;
}

/** "assistant:<requestId>" or "assistant:<requestId>:<selection key>": the request a stored assistant message answers. */
export function requestIdOfAssistantMessage(id: string | null | undefined): string | null {
  const match = /^assistant:(agreq_[0-9a-f]+)/u.exec(id ?? "");
  return match?.[1] ?? null;
}

/** AG20a (decision 8, 设计稿 §3.1): the device's time zone, sent with each message; none when the device cannot say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 && zone.length <= 64 ? zone : null;
  } catch {
    return null;
  }
}

export async function sendAgentV1(client: OrbitApiClient, input: { sessionId: string; clientMessageId: string; locale: "zh" | "ja" | "en"; message: string; origin?: AiSessionOriginInputContract; references?: readonly AiSessionReferenceContract[] }): Promise<AgentSendReceiptContract | null> {
  const zone = deviceTimeZone();
  const result = await client.post<{ agentRequest?: unknown }>(ORBIT_API_ENDPOINTS.conversations, {
    // AG11: the records picked with @, each with its marker's place in the (trimmed) message. AG20a: the device's zone.
    body: { clientMessageId: input.clientMessageId, locale: input.locale, message: input.message, protocolVersion: 3, references: input.references ?? [], sessionId: input.sessionId, ...(input.origin ? { origin: input.origin } : {}), ...(zone ? { timeZone: zone } : {}) },
  });
  if (!result.success) return null;
  const parsed = agentSendReceiptSchema.safeParse(result.data?.agentRequest);
  return parsed.success ? parsed.data : null;
}

/* ── AG11: the @ picker (online only; nothing is kept on the device) ───────────────────── */

export const AGENT_REFERENCES_SEARCH_PATH = "/api/agent/references/search";
export const AGENT_REFERENCES_CHECK_PATH = "/api/agent/references/check";

/**
 * The account's own records of six kinds by name. "offline" when the server could not be reached (the picker then lists
 * the phone's contacts, D8); "error" when it answered with an error or a wrong shape.
 */
export async function searchAgentReferences(client: OrbitApiClient, query: string, kind: AgentReferenceSearchKind | null): Promise<{ kind: "ok"; value: AgentReferenceSearchResultContract } | { kind: "offline" } | { kind: "error" }> {
  const params = new URLSearchParams({ q: query.trim() });
  if (kind) params.set("kind", kind);
  const result = await client.get<unknown>(`${AGENT_REFERENCES_SEARCH_PATH}?${params}`).catch(() => null);
  if (!result) return { kind: "offline" };
  if (!result.success) return result.status === 0 || offlineCode(result.error?.code) ? { kind: "offline" } : { kind: "error" };
  const parsed = agentReferenceSearchResultSchema.safeParse(result.data);
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "error" };
}

/** D7: the picked records that cannot be opened now ("type:id"); empty when the check could not be made. */
export async function checkAgentReferences(client: OrbitApiClient, references: readonly { type: AgentReferenceSearchKind; id: string; eventKind?: "platform" | "private" | undefined }[]): Promise<Set<string>> {
  if (!references.length) return new Set();
  const result = await client.post<unknown>(AGENT_REFERENCES_CHECK_PATH, { body: { references: references.map((reference) => ({ id: reference.id, type: reference.type, ...(reference.eventKind ? { eventKind: reference.eventKind } : {}) })) } }).catch(() => null);
  if (!result?.success) return new Set();
  const parsed = agentReferenceCheckResultSchema.safeParse(result.data);
  return parsed.success ? new Set(parsed.data.references.filter((item) => !item.accessible).map((item) => `${item.type}:${item.id}`)) : new Set();
}

export type AgentV1Read<T> = { kind: "ok"; value: T } | { kind: "offline" } | { kind: "missing" };

/** The client's own "could not reach the server" (status 0). */
const offlineCode = (code: string | undefined) => code === "ORBIT_APP_NETWORK_ERROR";

export async function readAgentV1Document(client: OrbitApiClient, sessionId: string, requestId: string): Promise<AgentV1Read<AgentResultDocument>> {
  const result = await client.get<{ agentRequest?: unknown }>(`${ORBIT_API_ENDPOINTS.conversations}/sessions/${encodeURIComponent(sessionId)}?requestId=${encodeURIComponent(requestId)}`).catch(() => null);
  if (!result) return { kind: "offline" };
  if (!result.success) return offlineCode(result.error.code) || result.status === 0 ? { kind: "offline" } : { kind: "missing" };
  const parsed = agentResultDocumentSchema.safeParse(result.data?.agentRequest);
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "missing" };
}

export async function readAgentCard(client: OrbitApiClient, actionId: string): Promise<AgentV1Read<AgentActionPreviewContract>> {
  const result = await client.get<{ card?: unknown }>(cardPath(actionId)).catch(() => null);
  if (!result) return { kind: "offline" };
  if (!result.success) return offlineCode(result.error.code) || result.status === 0 ? { kind: "offline" } : { kind: "missing" };
  const parsed = agentActionPreviewSchema.safeParse(result.data?.card);
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "missing" };
}

/** A card call; the card shown next is the one the server returns, else the one read again (a refused click). */
async function cardCall(client: OrbitApiClient, actionId: string, action: string, body: unknown): Promise<{ ok: boolean; card: AgentActionPreviewContract | null }> {
  const result = await client.post<{ card?: unknown }>(cardPath(actionId, action), { body }).catch(() => null);
  if (result?.success) {
    const parsed = agentActionPreviewSchema.safeParse(result.data?.card);
    if (parsed.success) return { card: parsed.data, ok: true };
  }
  const again = await readAgentCard(client, actionId);
  return { card: again.kind === "ok" ? again.value : null, ok: Boolean(result) && again.kind === "ok" };
}

export function decideAgentCard(client: OrbitApiClient, card: AgentActionPreviewContract, transition: "confirm" | "reject" | "retry" | "mark_done" | "abandon", operationId?: string) {
  return cardCall(client, card.actionId, "transition", { clientDecisionId: randomKey("decision"), payloadHash: card.payloadHash, revision: card.revision, transition, ...(operationId ? { operationId } : {}) });
}

export function recheckAgentCard(client: OrbitApiClient, card: AgentActionPreviewContract) {
  return cardCall(client, card.actionId, "recheck", {});
}

export function regenerateAgentCard(client: OrbitApiClient, card: AgentActionPreviewContract) {
  return cardCall(client, card.actionId, "regenerate", {});
}

export async function selectAgentOption(client: OrbitApiClient, input: { sessionId: string; requestId: string; clarificationId: string; optionId: string }): Promise<boolean> {
  const result = await client.post(ORBIT_API_ENDPOINTS.conversations, { body: { clientSelectionId: randomKey("selection"), protocolVersion: 3, selection: { clarificationId: input.clarificationId, optionId: input.optionId, requestId: input.requestId }, sessionId: input.sessionId } }).catch(() => null);
  return Boolean(result?.success);
}

/**
 * AG19: where a record card of the answer opens in the App — every one of the six kinds has a page. 待办 opens that one
 * to-do (D3); 日程 opens that schedule item; 我去过 opens the event it is about (a private one in the events page's sheet,
 * as AG13 shows it: read only).
 */
export function agentRecordHref(record: Pick<AgentAnswerRecordContract, "kind" | "id" | "eventKind" | "eventId">): string | null {
  const id = encodeURIComponent(record.id);
  const privateEvent = (eventId: string) => `/events?${new URLSearchParams({ privateEvent: eventId, tab: "going" })}`;
  switch (record.kind) {
    case "memo":
      return `/notes/${id}`;
    case "contact":
      return `/contacts/${id}`;
    case "todo":
      return `/tasks/${id}`;
    case "schedule":
      return `/schedule/personal/${id}`;
    case "event":
      return record.eventKind === "private" || record.id.startsWith("private_event:") ? privateEvent(record.id) : `/events/${id}`;
    case "attendance":
      if (!record.eventId) return "/events?tab=going";
      return record.eventKind === "private" ? privateEvent(record.eventId) : `/events/${encodeURIComponent(record.eventId)}`;
    default:
      return null;
  }
}

/** Where a record link of the answer's basis line opens in the App (the same table as the cards). */
export function agentLinkHref(link: AgentAnswerLinkContract): string | null {
  return agentRecordHref({ id: link.id, kind: link.type });
}

/** AG14 (approved draft D5): 「我的 › iOrbit 使用的信息」, with that entry's sheet open when one is named. */
export function memorySettingsHref(memoryId?: string | null): string {
  return `/settings/iorbit${memoryId ? `?${new URLSearchParams({ memory: memoryId })}` : ""}`;
}
