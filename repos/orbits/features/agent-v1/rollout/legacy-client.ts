/**
 * agent-design AG18-1 — old clients on the new flow (设计稿 §7「未知版本的旧客户端只展示可读内容并引导到兼容的确认端」,
 * §8「入口与传输」「写入口与卡片」).
 *
 * With ORBIT_AGENT_V1_MODE=on a message from an old client — protocol 2 (reliable send) or no protocol at all — is
 * no longer answered by the old pipeline, whose to-do path wrote directly and whose draft card could be confirmed by
 * typing "确认". It is handed to the new entry (acceptMessage: the same queue, the same confirmation boundary, the same
 * card ledger) and the server waits for the result document on the client's behalf, then answers in the old shape in
 * the same call:
 *
 * - the answer text is the document's; a card the old client cannot show becomes a readable description of the change
 *   and one sentence sending the user to the new App or the web to confirm it (typing "确认" here writes nothing);
 * - only the fields the old client knows (repos/orbit-app/src/api/ai-history-contract.ts aiConversationListSchema,
 *   reliableSend receipt) are sent; no actionPreview, no card id;
 * - not finished in time: 202 with the protocol-2 receipt, as before; the same request (same requestId) asked again
 *   reads the same request of the new entry, never a second one.
 *
 * The contacts-analysis entry (origin contacts.analysis) keeps the old pipeline: the new entry refuses it on protocol 3
 * as well. The route then runs it with the old write paths closed (legacyWritesClosed).
 */
import type { AccountTier } from "../../ai-quota/tiers";
import { createHash, randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";

import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { reliableAiSendInputSchema } from "../../../shared/api-schema/ai-sessions";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import type { AgentActionPreviewContract, AgentResultDocument, AgentSendInputContract } from "../../../shared/contract/agent-v1";
import type { ReliableAiSendReceiptContract } from "../../../shared/contract/ai-sessions";
import { AppError } from "../../../shared/errors/app-error";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import { configuredAgentEntryDependencies } from "../entry/http";
import { acceptMessage, getRequestRecord, type AgentEntryDependencies } from "../entry/service";
import { AgentEntryError, FINAL_STATUSES } from "../entry/store";
import { emitTrace } from "../observability/trace";

type Language = "zh" | "ja" | "en";
const languageOf = (locale: unknown): Language => (locale === "ja" || locale === "en" ? locale : "zh");

/** How long the server waits for the result on an old client's behalf before answering 202 (the client asks again). */
export const LEGACY_WAIT_MS = 45_000;
const POLL_MS = 250;

const LEGACY_WORDS: Record<Language, { lead: string; guide: string; failed: string; stopped: string; pending: string; reply: string }> = {
  en: {
    failed: "I couldn't finish answering this time. Please try again in a moment.",
    guide: "To make this change, open the new Orbit app or the web and confirm it on the card there. Replying \"confirm\" here does not change anything.",
    lead: "Prepared, not done yet:",
    pending: "This message is still being worked on. Open the conversation in the new Orbit app or on the web to see the answer.",
    reply: "You can reply with one of these:",
    stopped: "This turn was stopped.",
  },
  ja: {
    failed: "今回は最後まで回答できませんでした。少し待ってからもう一度お試しください。",
    guide: "この変更は、新しい Orbit アプリまたはウェブでカードを開いて確定してください。ここで「確定」と返信しても何も変わりません。",
    lead: "用意した変更（まだ実行していません）：",
    pending: "このメッセージはまだ処理中です。新しい Orbit アプリかウェブで会話を開くと回答が見られます。",
    reply: "次のどれかで返信できます：",
    stopped: "このやり取りは停止しました。",
  },
  zh: {
    failed: "这次没能回答完，请稍后再试一次。",
    guide: "这项修改要到新版 App 或网页上打开卡片点确认才会执行；在这里回复“确认”不会改任何内容。",
    lead: "准备好的修改（还没有执行）：",
    pending: "这条消息还在处理中。到新版 App 或网页上打开这段对话就能看到回答。",
    reply: "可以直接回复其中一个：",
    stopped: "这一轮已经停止。",
  },
};

const WAITING_CARD = new Set(["awaiting_confirmation", "deferred"]);

/** The card as words an old client can show: each item's own line, and where to confirm it. */
export function legacyCardText(preview: AgentActionPreviewContract, locale: unknown): string {
  const words = LEGACY_WORDS[languageOf(locale ?? preview.locale)];
  const items = preview.operations.map((op, index) => (preview.operations.length > 1 ? `${index + 1}. ${op.text}` : op.text));
  return [words.lead, ...items, words.guide].join("\n");
}

/** The answer an old client shows for a result document (only words; nothing it cannot render). */
export function legacyAnswerText(document: AgentResultDocument, locale: unknown): string {
  const words = LEGACY_WORDS[languageOf(locale)];
  if (document.status === "failed") return document.answer?.text?.trim() || words.failed;
  if (document.status === "cancelled") return words.stopped;
  if (!FINAL_STATUSES.has(document.status) && document.status !== "waiting_user") return words.pending;
  let text = document.answer?.text?.trim() ?? "";
  const card = document.actionPreview;
  if (card && WAITING_CARD.has(card.status)) {
    const block = legacyCardText(card, locale);
    const cardLine = document.answer?.cardLine?.trim();
    text = cardLine && text.includes(cardLine) ? text.replace(cardLine, block) : [text, block].filter(Boolean).join("\n\n");
  }
  const open = (document.clarifications ?? []).filter((set) => set.state === "open" && set.kind !== "entry" && set.options.length);
  for (const set of open) text = [text, `${words.reply}${set.options.map((option) => `「${option.label}」`).join(languageOf(locale) === "en" ? ", " : "、")}`].filter(Boolean).join("\n\n");
  return text || words.failed;
}

/** "memo:note:abc" → "note:abc": the record ids the old evidence lists carried. */
const evidenceIdOf = (ref: string) => (ref.split(":").length >= 3 ? ref.slice(ref.indexOf(":") + 1) : ref);

/**
 * The old reply payload (aiConversationListSchema): state, the conversation, the two messages of this turn, the answer.
 * The old client accepts it only when the last user message is its question and an assistant message follows it.
 */
export function legacyConversationPayload(input: { document: AgentResultDocument; message: string; sessionId: string; requestId: string; locale: unknown; receivedAt: string }): Record<string, unknown> {
  const text = legacyAnswerText(input.document, input.locale);
  const updatedAt = input.document.updatedAt || input.receivedAt;
  const evidenceIds = [...new Set((input.document.answer?.sourceRefs ?? []).map(evidenceIdOf))];
  return {
    activeConversationId: input.sessionId,
    artifacts: [],
    assistantMessage: text,
    conversations: [{ conversationId: input.sessionId, evidenceIds: [], lastMessagePreview: text.slice(0, 120), title: input.message.slice(0, 120), updatedAt }],
    messages: [
      { content: input.message, conversationId: input.sessionId, createdAt: input.receivedAt, evidenceIds: [], messageId: `user:${input.requestId}`, role: "user" },
      { content: text, conversationId: input.sessionId, createdAt: updatedAt, evidenceIds, messageId: `assistant:${input.requestId}`, role: "assistant" },
    ],
    nextAction: "",
    proposedToolIntents: [],
    provenance: { collectedAt: updatedAt, evidenceIds, generationMethod: "model-provider-live-agent-reply", source: "agent-v1", sourceLabel: "Orbit Agent" },
    state: "success",
  };
}

const ORIGIN_KEEPS_OLD_PATH = new Set(["contacts.analysis"]);

/** True when this old-client message stays on the old pipeline (with its write paths closed). */
export function legacyStaysOnOldPath(body: Record<string, unknown>): boolean {
  const origin = body.origin as { entryPointId?: unknown } | undefined;
  return typeof origin?.entryPointId === "string" && ORIGIN_KEEPS_OLD_PATH.has(origin.entryPointId);
}

function legacySessionIdFor(actorId: string, body: Record<string, unknown>): string {
  const given = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (given && given.length <= 160 && !given.startsWith("live-orbit-agent")) return given;
  return `session_legacy_${createHash("sha256").update(actorId).digest("hex").slice(0, 24)}`;
}

export interface LegacyClientSendResult {
  status: number;
  body: Record<string, unknown>;
}

type LegacyInput =
  | { protocol: 2; send: AgentSendInputContract; requestId: string }
  | { protocol: null; send: AgentSendInputContract; requestId: null };

/** The old body as a protocol-3 send. Null: not a message this path takes (invalid → the caller answers 400). */
export function legacySendOf(actorId: string, body: Record<string, unknown>): LegacyInput | null {
  if (body.protocolVersion === 2) {
    const parsed = reliableAiSendInputSchema.safeParse(body);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      protocol: 2,
      requestId: data.requestId,
      send: {
        // The old request key decides the new one: the same old request asked again is the same new request.
        clientMessageId: `legacy:${data.requestId}`,
        locale: data.locale,
        message: data.message,
        ...(data.origin ? { origin: data.origin } : {}),
        ...(data.pageContext ? { pageContext: data.pageContext } : {}),
        protocolVersion: 3,
        references: data.references.map((reference) => ({ id: reference.id, type: reference.type })),
        sessionId: data.sessionId,
      } as AgentSendInputContract,
    };
  }
  const message = typeof body.message === "string" ? body.message.trim() : typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!message || message.length > 12000) return null;
  const locale = body.locale === "en" || body.locale === "ja" ? body.locale : "zh";
  return {
    protocol: null,
    requestId: null,
    send: { clientMessageId: `legacy:${randomUUID()}`, locale, message, protocolVersion: 3, references: [], sessionId: legacySessionIdFor(actorId, body) } as AgentSendInputContract,
  };
}

/** Processing starts now (the server waits for it in this call) and is kept alive past the response when it runs long. */
function startNow(task: () => Promise<void>): void {
  const running = task();
  try {
    after(() => running);
  } catch {
    // outside a request scope (tests): the promise runs on its own
  }
}

export interface LegacyClientDeps {
  entry: AgentEntryDependencies;
  /** The session's current message revision (the old receipt carries it). */
  messageRevision?: (sessionId: string) => Promise<number | undefined>;
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

function configuredLegacyDeps(mode: FeatureMode, actorId: string, tier?: AccountTier): LegacyClientDeps | null {
  const entry = configuredAgentEntryDependencies(mode, actorId, tier);
  if (!entry) return null;
  const sessions = createOrbitAgentChatSessionProvider(mode, actorId);
  return {
    entry: { ...entry, schedule: startNow },
    messageRevision: async (sessionId) => (await sessions?.getSessionHeader(sessionId).catch(() => null))?.messageRevision,
  };
}

/**
 * An old client's message on the new flow. Answers the old shape: 200 with the reply (and, for protocol 2, the receipt),
 * 202 with the receipt when it is not done yet, 400 for a body the old path would also refuse.
 */
export async function handleLegacyClientSend(input: { actorId: string; body: Record<string, unknown>; deps?: LegacyClientDeps | null; mode: FeatureMode; tier?: AccountTier }): Promise<LegacyClientSendResult> {
  const legacy = legacySendOf(input.actorId, input.body);
  if (!legacy) {
    return { body: failure(new AppError("VALIDATION_ERROR", input.body.protocolVersion === 2 ? "A valid reliable conversation request is required." : "A message is required.")) as unknown as Record<string, unknown>, status: 400 };
  }
  const send = legacy.send;
  const deps = input.deps === undefined ? configuredLegacyDeps(input.mode, input.actorId, input.tier) : input.deps;
  if (!deps) return { body: failure(new AppError("SERVICE_UNAVAILABLE", "Agent request storage is not configured.")) as unknown as Record<string, unknown>, status: 503 };
  let accepted: Awaited<ReturnType<typeof acceptMessage>>;
  try {
    accepted = await acceptMessage(deps.entry, { actorId: input.actorId, body: legacy.send });
  } catch (error) {
    if (error instanceof AgentEntryError) return { body: failure(new AppError("CONFLICT", "This request ID was already used with different content.")) as unknown as Record<string, unknown>, status: 409 };
    return { body: failure(new AppError("SERVICE_UNAVAILABLE", "Agent request storage is unavailable.", { cause: error })) as unknown as Record<string, unknown>, status: 503 };
  }
  const { receipt } = accepted;
  emitTrace({ clientProtocol: legacy.protocol ?? "none", legacyRequestId: legacy.requestId, replayed: accepted.replayed, requestId: receipt.requestId, sessionId: receipt.sessionId, type: "rollout.legacy_client" });
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + (deps.waitMs ?? LEGACY_WAIT_MS);
  let record = await getRequestRecord(deps.entry, { actorId: input.actorId, requestId: receipt.requestId });
  // waiting_user is an answer too (a question, or a card waiting for a click): the old client gets it now.
  while (record && !FINAL_STATUSES.has(record.status) && record.status !== "waiting_user" && Date.now() < deadline) {
    await sleep(deps.pollMs ?? POLL_MS);
    record = await getRequestRecord(deps.entry, { actorId: input.actorId, requestId: receipt.requestId });
  }
  const done = Boolean(record && (FINAL_STATUSES.has(record.status) || record.status === "waiting_user"));
  const oldReceipt = (state: ReliableAiSendReceiptContract["state"], messageRevision?: number): ReliableAiSendReceiptContract => ({
    ...(messageRevision === undefined ? {} : { messageRevision }),
    protocolVersion: 2,
    replayed: accepted.replayed,
    requestId: legacy.requestId ?? receipt.requestId,
    sessionId: receipt.sessionId,
    state,
  });
  if (!done || !record) {
    emitTrace({ requestId: receipt.requestId, type: "rollout.legacy_pending" });
    if (legacy.protocol === 2) return { body: success({ reliableSend: oldReceipt("pending") }) as unknown as Record<string, unknown>, status: 202 };
    // An unversioned client never understood 202: it gets a reply that says where the answer will be.
    return { body: success(legacyConversationPayload({ document: { ...(record?.document ?? { answer: null, partResults: [], requestId: receipt.requestId, revision: 0, schemaVersion: 1, sessionId: receipt.sessionId, status: "running", updatedAt: receipt.acceptedAt }), status: "running" }, locale: send.locale, message: send.message, receivedAt: receipt.acceptedAt, requestId: receipt.requestId, sessionId: receipt.sessionId })) as unknown as Record<string, unknown>, status: 200 };
  }
  const payload = legacyConversationPayload({ document: record.document, locale: send.locale, message: send.message, receivedAt: record.receivedAt, requestId: receipt.requestId, sessionId: receipt.sessionId });
  emitTrace({ card: record.document.actionPreview ? record.document.actionPreview.actionId : null, cardAsText: Boolean(record.document.actionPreview && WAITING_CARD.has(record.document.actionPreview.status)), requestId: receipt.requestId, status: record.status, type: "rollout.legacy_answered" });
  if (legacy.protocol === 2) {
    const revision = await deps.messageRevision?.(receipt.sessionId).catch(() => undefined);
    return { body: success({ ...payload, reliableSend: oldReceipt("completed", revision) }) as unknown as Record<string, unknown>, status: 200 };
  }
  return { body: success(payload) as unknown as Record<string, unknown>, status: 200 };
}

const CLOSED_WORDS: Record<Language, string> = {
  en: "Nothing was changed. To change records, ask in the new Orbit app or on the web and confirm the card there.",
  ja: "何も変更していません。記録を変えるには、新しい Orbit アプリかウェブで頼んで、カードで確定してください。",
  zh: "没有修改任何内容。要改记录，请到新版 App 或网页上说，并在卡片上确认。",
};

/**
 * The old pipeline's reply with its write paths closed (an old-path message while the new entry is on): what it proposed
 * to write (a to-do, a draft card, action requests) is dropped, never written, and the reply says where to ask instead.
 */
export function closeLegacyWrites<T extends { success: boolean; data?: unknown }>(result: T, locale: unknown): T {
  if (!result.success || !result.data || typeof result.data !== "object") return result;
  const { proposedActionRequests, proposedEntityDraft, taskInteraction, entityDraft, ...rest } = result.data as Record<string, unknown>;
  const proposed = (Array.isArray(proposedActionRequests) && proposedActionRequests.length > 0) || Boolean(proposedEntityDraft) || Boolean(taskInteraction) || Boolean(entityDraft);
  if (!proposed) return { ...result, data: rest };
  emitTrace({ type: "rollout.legacy_writes_closed" });
  const answer = typeof rest.assistantMessage === "string" ? rest.assistantMessage : "";
  return { ...result, data: { ...rest, assistantMessage: [answer, CLOSED_WORDS[languageOf(locale)]].filter(Boolean).join("\n\n") } };
}

export function legacyClientResponse(mode: FeatureMode, result: LegacyClientSendResult): Response {
  return NextResponse.json(result.body, { headers: runtimeBoundaryHeaders(mode), status: result.status });
}
