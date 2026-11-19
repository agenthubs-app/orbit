/**
 * AG01 hands processing to the existing runtime, read-only (agent-design AG01 易错边界 4).
 *
 * What the protocol-2 route checks before sending (references, page context) is checked here,
 * at processing time (设计稿 §3.7). This entry never calls applyTaskInteraction, applyEntityDraft
 * or persistNaturalLanguageActionProposals, so it writes no business data. From AG02 the model's
 * explicit new to-do (its followups.createTask request or task draft) becomes one card in the
 * action ledger (confirm-boundary.ts); other write proposals are not carded and are said so.
 */
import type { FeatureMode } from "../../../shared/config/feature-mode";
import type { AiSessionReferenceContract } from "../../../shared/contract/ai-sessions";
import type { AgentEntryInput } from "./store";
import { createAgentFeedbackService } from "../../agent/feedback/service-factory";
import { createAgentMemoryService } from "../../agent/memory/service-factory";
import { createContactCardService } from "../../contacts/card-service";
import { createContactDetailTagStatusService } from "../../contacts/service-factory";
import { AiSessionReferenceAuthorizationError, authorizeAiSessionContactReferences } from "../../orbit-ai/ai-session-reference-authorization";
import type { OrbitAgentArtifactPayload } from "../../orbit-ai/artifact-contract";
import type { OrbitAgentSendMessageInput } from "../../orbit-ai/conversation-contract";
import { AiPageContextError, authorizeAiPageContext } from "../../orbit-ai/page-context";
import { createOrbitAgentConversationServiceForActor } from "../../orbit-ai/service-factory";
import { ORBIT_AGENT_CHAT_HISTORY_WINDOW, type OrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { AgentEntryExecutionError, type AgentEntryExecutor, type AgentEntrySessionWriter } from "./service";
import { createOrbitAgentRuntimeService } from "../../agent/runtime/service-factory";
import { runWithConfirmBoundary, type LegacyTurn } from "./confirm-boundary";

export function createLegacyRuntimeExecutor(mode: FeatureMode): AgentEntryExecutor {
  const turn = createLegacyRuntimeTurn(mode);
  // AG02: the confirmation boundary. Explicit new to-dos become one ledger card per request; typed
  // confirmations never decide a card; nothing here writes business data.
  return async (execution) => {
    const runtime = createOrbitAgentRuntimeService(mode, { actorId: execution.actorId });
    return runWithConfirmBoundary({ runtime }, {
      locale: execution.input.locale,
      message: execution.input.message,
      requestId: execution.requestId,
      run: () => turn(execution),
      sessionId: execution.sessionId,
    });
  };
}

/** AG05: the protocol-3 references the old path and the chat session store know (contact, event, note; a memo is a note). */
export function sessionReferencesOf(references: AgentEntryInput["references"]): AiSessionReferenceContract[] {
  return references.flatMap((reference): AiSessionReferenceContract[] => {
    const type = reference.type === "memo" ? "note" : reference.type;
    return type === "contact" || type === "event" || type === "note" ? [{ id: reference.id, type }] : [];
  });
}

function createLegacyRuntimeTurn(mode: FeatureMode): (execution: Parameters<AgentEntryExecutor>[0]) => Promise<LegacyTurn> {
  return async ({ actorId, fetchImplementation, history, input }) => {
    try {
      await authorizeAiSessionContactReferences({ actorId, references: sessionReferencesOf(input.references), service: createContactDetailTagStatusService() });
    } catch (error) {
      if (error instanceof AiSessionReferenceAuthorizationError) throw new AgentEntryExecutionError(error.code === "REFERENCE_NOT_ACCESSIBLE" ? "REFERENCE_NOT_ACCESSIBLE" : "REFERENCE_UNVERIFIED");
      throw error;
    }
    let pageContext: OrbitAgentSendMessageInput["pageContext"];
    if (input.pageContext) {
      try {
        pageContext = await authorizeAiPageContext({
          actorId,
          countContacts: async (id, filters) => (await createContactCardService({ id }).summary({ industryFilters: filters.industry }, id)).total,
          proposed: input.pageContext,
        });
      } catch (error) {
        if (error instanceof AiPageContextError) throw new AgentEntryExecutionError(error.code);
        throw new AgentEntryExecutionError("PAGE_CONTEXT_UNVERIFIED");
      }
    }
    const memoryService = createAgentMemoryService({ actorId, mode });
    const feedbackService = createAgentFeedbackService({ actorId, mode });
    const pageMemory = pageContext ? [{ category: "page_context", content: JSON.stringify(pageContext) }] : [];
    const service = createOrbitAgentConversationServiceForActor(actorId, undefined, { fetchImplementation });
    const result = await service.sendMessage({
      history: [...history],
      locale: input.locale,
      memory: [...((await memoryService.context()) ?? []), ...pageMemory],
      message: input.message,
      outcomes: await feedbackService.context(),
      ...(pageContext ? { pageContext } : {}),
    });
    if (result.success === false) throw new AgentEntryExecutionError(result.error.code === "ORBIT_AGENT_MESSAGE_REQUIRED" ? "MESSAGE_REQUIRED" : "MODEL_UNAVAILABLE");
    const assistant = [...result.data.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
    const reply = result.data.assistantMessage.trim() || assistant?.content.trim() || "";
    // The runtime's reply assumes its result cards are shown under it (gemini-provider synthesis
    // instruction: "do not list those records again in prose"). The result document has no cards,
    // so the cards' content is written into the delivered text; otherwise the records are lost.
    return {
      actionRequests: result.data.proposedActionRequests ?? [],
      entityDraft: result.data.proposedEntityDraft ?? null,
      extraText: cardsAsText(result.data.artifacts ?? [], input.locale),
      reply,
      sourceRefs: [...new Set(result.data.provenance?.evidenceIds ?? [])].filter((id) => typeof id === "string" && id.trim()),
    };
  };
}

type CardLocale = "en" | "ja" | "zh";
type QueryDomain = "schedule" | "tasks" | "notes" | "followups";

const CARD_WORDS: Record<CardLocale, {
  header: string;
  domains: Record<QueryDomain, string>;
  place: string;
  due: string;
  noDue: string;
  allDay: string;
  status: Record<string, string>;
}> = {
  en: { allDay: "all day", domains: { followups: "Follow-ups", notes: "Notes", schedule: "Schedule", tasks: "To-dos" }, due: "due ", header: "Records found:", noDue: "no due date", place: "at ", status: { cancelled: "cancelled", completed: "done", open: "not done" } },
  ja: { allDay: "終日", domains: { followups: "フォローアップ", notes: "メモ", schedule: "予定", tasks: "タスク" }, due: "期限 ", header: "見つかった記録：", noDue: "期限なし", place: "場所：", status: { cancelled: "取消", completed: "完了", open: "未完了" } },
  zh: { allDay: "全天", domains: { followups: "跟进", notes: "笔记", schedule: "日程", tasks: "待办" }, due: "截止 ", header: "查到的记录：", noDue: "没有截止时间", place: "地点：", status: { cancelled: "已取消", completed: "已完成", open: "未完成" } },
};
const WEEKDAY: Record<"ja" | "zh", Record<string, string>> = {
  ja: { Fri: "金", Mon: "月", Sat: "土", Sun: "日", Thu: "木", Tue: "火", Wed: "水" },
  zh: { Fri: "周五", Mon: "周一", Sat: "周六", Sun: "周日", Thu: "周四", Tue: "周二", Wed: "周三" },
};
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function localParts(iso: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "numeric", timeZone, weekday: "short", year: "numeric" })
    .formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: Number(parts.month), time: `${parts.hour}:${parts.minute}`, weekday: String(parts.weekday), year: Number(parts.year) };
}

function localDate(parts: ReturnType<typeof localParts>, locale: CardLocale): string {
  if (locale === "en") return `${parts.weekday}, ${MONTH_EN[parts.month - 1]} ${parts.day}`;
  return `${parts.month}月${parts.day}日（${WEEKDAY[locale][parts.weekday]}）`;
}

function when(startIso: string, endIso: string | undefined, allDay: boolean, timeZone: string, locale: CardLocale): string {
  const start = localParts(startIso, timeZone);
  if (allDay) return `${localDate(start, locale)}${locale === "en" ? ", " : ""}${CARD_WORDS[locale].allDay}`;
  const startText = `${localDate(start, locale)}${locale === "en" ? ", " : ""}${start.time}`;
  if (!endIso) return startText;
  const end = localParts(endIso, timeZone);
  const sameDay = end.year === start.year && end.month === start.month && end.day === start.day;
  return sameDay ? `${startText}–${end.time}` : `${startText} – ${localDate(end, locale)}${locale === "en" ? ", " : ""}${end.time}`;
}

function validIso(value: string | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * The runtime's result cards as the plain lines a user reads, in the request's locale: local times in
 * the record's own time zone (else `timeZone`), titles, places, due dates and statuses in words.
 * Internal fields (kind, category, missingFields, ids, raw enums) never appear.
 */
export function cardsAsText(artifacts: readonly OrbitAgentArtifactPayload[], locale: string, timeZone = process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo"): string {
  const lang: CardLocale = locale === "ja" || locale === "zh" ? locale : "en";
  const words = CARD_WORDS[lang];
  const blocks: string[] = [];
  for (const artifact of artifacts) {
    for (const section of artifact.result?.generatedView?.sections ?? []) {
      const items = (section.items ?? []).slice(0, 10);
      if (!items.length) continue;
      const domain = /^(schedule|tasks|notes|followups) results$/u.exec(section.title ?? "")?.[1] as QueryDomain | undefined;
      if (!domain) {
        blocks.push(items.map((item) => `- ${item.title}${item.subtitle ? `（${item.subtitle}）` : ""}`).join("\n"));
        continue;
      }
      const lines = [words.domains[domain]];
      for (const item of items) {
        const field = Object.fromEntries((item.metadata ?? []).map((entry) => [entry.label, entry.value]));
        const zone = field.timeZone || timeZone;
        const opening = (item.body ?? "").trim();
        const title = item.title && item.title !== item.id ? item.title : opening.length > 20 ? `${opening.slice(0, 20)}…` : opening || "—";
        const parts = [title];
        if (domain === "schedule" && validIso(field.startsAt)) {
          parts.push(when(field.startsAt, validIso(field.endsAt) ? field.endsAt : undefined, field.allDay === "true", zone, lang));
          if (field.location) parts.push(`${words.place}${field.location}`);
        } else if (domain === "tasks" || domain === "followups") {
          parts.push(validIso(field.dueAt) ? `${words.due}${when(field.dueAt, undefined, false, zone, lang)}` : words.noDue);
          if (field.status) parts.push(words.status[field.status] ?? field.status);
        } else if (domain === "notes" && validIso(field.createdAt)) {
          parts.push(localDate(localParts(field.createdAt, zone), lang));
        }
        lines.push(`- ${parts.join(" · ")}`);
      }
      blocks.push(lines.join("\n"));
    }
  }
  return blocks.length ? `${words.header}\n${blocks.join("\n\n")}` : "";
}

/** Appends the turn to the chat session so its history (and later turns) see it; idempotent by message id. */
export function createSessionWriter(provider: OrbitAgentChatSessionProvider): AgentEntrySessionWriter {
  return {
    async history(sessionId) {
      const session = await provider.getSession(sessionId, { limit: ORBIT_AGENT_CHAT_HISTORY_WINDOW });
      const messages = (session?.messages ?? []).slice(-ORBIT_AGENT_CHAT_HISTORY_WINDOW);
      // A user turn with no reply after it was stopped (or failed) before anything was delivered;
      // the next turn answers its own message, so the stopped one is left out of the model's context.
      return messages
        .filter((message, index) => message.role !== "user" || messages[index + 1]?.role === "assistant")
        .map(({ role, text }) => ({ content: text, role }));
    },
    async appendUser(sessionId, record, createdAt) {
      const origin = record.input.origin;
      await provider.appendMessages(sessionId, {
        create: {
          createdAt,
          origin: origin
            ? { ...origin, firstSentText: record.input.message, firstUserMessageId: record.clientMessageId, recordedAt: createdAt, references: sessionReferencesOf(record.input.references), schemaVersion: 1 }
            : undefined,
          title: record.input.message.slice(0, 120),
        },
        messages: [{ createdAt, id: record.clientMessageId, references: sessionReferencesOf(record.input.references), role: "user", text: record.input.message }],
        updatedAt: createdAt,
      });
    },
    async appendAssistant(sessionId, record, text, createdAt, key, recordRefs) {
      await provider.appendMessages(sessionId, {
        // AG05: the cited records go with the message (as typed refs), so the next turn can point back at them.
        messages: [{ createdAt, id: key ? `assistant:${record.requestId}:${key}` : `assistant:${record.requestId}`, role: "assistant", text, ...(recordRefs?.length ? { recordRefs: [...recordRefs] } : {}) } as never],
        updatedAt: createdAt,
      });
    },
  };
}
