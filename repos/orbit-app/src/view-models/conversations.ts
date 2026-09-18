import { aiRunPath } from "../api/endpoints";
import { conversationContactArtifacts, type ConversationContactArtifactView } from "./ai-artifacts";
import { readAiEntityDraft, type AiEntityDraft } from "./ai-entity-draft";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator } from "../i18n/messages";
import type {
  OrbitAiConversationSummaryContract,
  OrbitAiMessageContract,
  OrbitAiProposedToolIntentContract
} from "../api/contract/orbit-ai";

export interface ConversationSummary {
  id: string;
  preview: string;
  title: string;
}

export interface ChatMessageView {
  content: string;
  createdAt: string;
  id: string;
  role: string;
}

export interface ConversationRecordLink {
  external: boolean;
  href: string;
  id: string;
  kind: "活动" | "人脉" | "待办" | "日历活动" | "行动";
}

function validConversationRecordId(id: string): boolean {
  return Boolean(id.trim()) && !/[\s/\\\u0000-\u001f]/u.test(id) &&
    ![".", "..", "task", "contact", "event"].includes(id);
}

export function conversationTaskDetailHref(id: string): string | null {
  // Server-issued task IDs can contain slashes; encode them as one route segment.
  return id.trim() && !/[\u0000-\u001f]/u.test(id) && ![".", "..", "task"].includes(id.trim())
    ? `/tasks/${encodeURIComponent(id)}` : null;
}

export function conversationAcceptedTaskId(data: unknown): string | null {
  const task = isRecord(data) && isRecord(data.task) ? data.task : {};
  return typeof task.id === "string" && conversationTaskDetailHref(task.id) ? task.id : null;
}

// Only existing record routes on this app's configured server are promoted.
// Other URLs remain message text; never turn a module home into a record detail.
export function conversationRecordLinks(content: string, baseUrl: string): ConversationRecordLink[] {
  // Consume whole URI tokens, including unsupported schemes, so a nested
  // https URL inside javascript:/data:/ftp: can never become a record link.
  const candidates = content.matchAll(/(?<![a-z0-9+./-])([a-z][a-z0-9+.-]*:[^\s<>"，。；！？）]+)|(?:^|[\s([<"，。；！？（])((?:\/app)?\/(?:schedule\/events|events|contacts|tasks)\/[^\s<>"，。；！？）]+)/giu);
  const links: ConversationRecordLink[] = [];
  for (const [, absolute, relative] of candidates) {
    const candidate = absolute ?? relative;
    if (!candidate) continue;
    const href = candidate.replace(/[)\],.;]+$/u, "");
    try {
      const url = new URL(href, baseUrl);
      if (!["http:", "https:", "orbit:"].includes(url.protocol)) continue;
      const native = url.protocol === "orbit:";
      if (url.username || url.password || (native && url.port)) continue;
      if (!native && url.origin !== new URL(baseUrl).origin) continue;
      const path = native ? `${url.hostname ? `/${url.hostname}` : ""}${url.pathname}` : url.pathname.replace(/^\/app(?=\/)/u, "");
      let link: ConversationRecordLink;
      if (!native && path === "/contacts/all-actions" && url.searchParams.getAll("entry").length === 1) {
        const id = url.searchParams.get("entry") ?? "";
        if (!validConversationRecordId(id)) continue;
        link = { external: true, href: url.href, id, kind: "行动" };
      } else {
        const match = path.match(/^\/(events|contacts|tasks|schedule\/events)\/([^/]+)$/u);
        if (!match?.[1] || !match[2]) continue;
        const route = match[1];
        const id = decodeURIComponent(match[2]);
        if (!validConversationRecordId(id)) continue;
        if (route === "contacts" && ["all-actions", "new", "intros", "graph", "pipeline", "list", "dashboard"].includes(id)) continue;
        if (route === "events" && ["center", "new"].includes(id)) continue;
        link = {
          external: false,
          href: `/${route}/${encodeURIComponent(id)}`,
          id,
          kind: route === "contacts" ? "人脉" : route === "tasks" ? "待办" : route === "schedule/events" ? "日历活动" : "活动"
        };
      }
      if (!links.some((existing) => existing.href === link.href)) links.push(link);
    } catch {
      // A malformed address is kept as ordinary text, not replaced with a fake ID.
    }
  }
  return links;
}

export type MarkdownInlineKind = "code" | "strong" | "text";
export type MarkdownBlockKind = "listItem" | "paragraph";

export interface MarkdownInlineView {
  kind: MarkdownInlineKind;
  text: string;
}

export interface MarkdownBlockView {
  kind: MarkdownBlockKind;
  marker?: string;
  quote?: boolean;
  segments: MarkdownInlineView[];
}

export interface ProposedToolIntentView {
  id: string;
  label: string;
  reason: string;
  requiresUserConfirmation: boolean;
}

export interface TaskInteractionView {
  category: string;
  dueAt?: string;
  reason: string;
  state: "created" | "suggested" | "needs_date_confirmation" | "failed";
  suggestionId: string;
  taskId: string;
  title: string;
  sourceNoteId?: string;
  sourceNoteVersion?: number;
  relatedContactIds?: readonly string[];
}

export interface ConversationChatView {
  activeConversationId: string | null;
  assistantMessage: string;
  messages: ChatMessageView[];
  proposedToolIntents: ProposedToolIntentView[];
  taskInteraction?: TaskInteractionView | null;
  /** Sprint 0085: the record the reply is offering to create, if any. */
  entityDraft?: AiEntityDraft | null;
}

export interface OrbitAiHomeChatWindow extends ConversationChatView {
  isEmpty: boolean;
}

export interface ConversationThreadView extends ConversationChatView {
  contactArtifacts?: ConversationContactArtifactView[];
  contactArtifactNotice?: boolean;
  nextAction: string;
  title: string;
}

export type ConversationInlinePanelKind =
  | "events"
  | "followups"
  | "people"
  | "profile"
  | "schedule";

export interface ConversationInlinePanelView {
  actionHref:
    | "/contacts/list"
    | "/events"
    | "/followups"
    | "/tasks"
    | "/profile"
    | "/schedule";
  actionLabel: string;
  detail: string;
  kind: ConversationInlinePanelKind;
  title: string;
}

export interface ConversationQuickRouteView {
  detail: string;
  href:
    | "/contacts"
    | "/contacts/list"
    | "/events"
    | "/followups"
    | "/tasks"
    | "/profile"
    | "/schedule";
  title: string;
}

export interface ConversationAiRunReferenceView {
  actionLabel: string;
  detail: string;
  id: string;
  title: string;
}

export interface ConversationContactCandidateView {
  id: string;
  name: string;
  nextAction?: string;
  organization?: string;
  relationship?: string;
  role?: string;
  status?: string;
  valueLabels?: readonly string[];
}

export interface ConversationEventCandidateView {
  actionLabel: string;
  id: string;
  location: string;
  participantCountLabel: string;
  startsAt: string;
  status: string;
  subtitle: string;
  title: string;
  topics: readonly string[];
}

export type AiRunDetailRequestResult =
  | {
      request: {
        path: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export interface AiRunDetailView {
  metrics: string[];
  nextAction: string;
  outputPreview: string;
  safetyText: string;
  summary: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

// 下面两个取值器的字段名受跨端契约约束：服务端改名，这里立刻编译报错，
// 而不是等到运行时静默拿到空字符串。契约之外的兼容字段继续走 stringField。
function conversationField(
  record: Record<string, unknown>,
  fieldName: keyof OrbitAiConversationSummaryContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function messageField(
  record: Record<string, unknown>,
  fieldName: keyof OrbitAiMessageContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function intentField(
  record: Record<string, unknown>,
  fieldName: keyof OrbitAiProposedToolIntentContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function containsImplementationLabel(value: string): boolean {
  return /\b(live|mock|hybrid|fixture|provider|providers|payload|source-backed|command-center|command center|natural-language request)\b/i.test(
    value
  );
}

function normalizeOrbitAiName(value: string): string {
  return value.replace(/\bOrbit Agent\b/g, "Orbit AI");
}

function containsChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function userFacingText(value: string, fallback: string): string {
  const text = normalizeOrbitAiName(value).trim();

  if (!text || containsImplementationLabel(text)) {
    return fallback;
  }

  return text;
}

function conversationTitle(value: string, t = createTranslator("zh")): string {
  const title = normalizeOrbitAiName(value);
  return title && !containsImplementationLabel(title)
    ? title
    : t("conversationVm.defaultTitle");
}

function conversationPreview(value: string, t = createTranslator("zh")): string {
  const preview = normalizeOrbitAiName(value);

  if (!preview || containsImplementationLabel(preview)) {
    return t("conversationVm.defaultPreview");
  }

  return preview;
}

function assistantMessageContent(value: string, t = createTranslator("zh")): string {
  const content = normalizeOrbitAiName(value);

  if (!content) {
    return "";
  }

  if (containsImplementationLabel(content)) {
    return t("conversationVm.assistantFallback");
  }

  return content;
}

function chatMessageContent(role: string, value: string, t = createTranslator("zh")): string {
  if (role === "assistant") {
    return assistantMessageContent(value, t);
  }

  return normalizeOrbitAiName(value);
}

function nextActionCopy(value: string, t = createTranslator("zh")): string {
  const nextAction = normalizeOrbitAiName(value);

  if (!nextAction || containsImplementationLabel(nextAction)) {
    return t("conversationVm.nextActionFallback");
  }

  return nextAction;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

function listField(
  record: Record<string, unknown>,
  fieldName: string
): readonly unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function addRunId(runIds: Set<string>, value: string): void {
  const normalized = value.trim();

  if (normalized) {
    runIds.add(normalized);
  }
}

function addRunIdsFromText(runIds: Set<string>, value: string): void {
  for (const match of value.matchAll(/[A-Za-z0-9:_-]*ai-run[A-Za-z0-9:_-]*/giu)) {
    addRunId(runIds, match[0]);
  }
}

function aiRunRecordId(record: Record<string, unknown>): string {
  return stringField(record, "runId", stringField(record, "id"));
}

export function conversationAiRunReferencesFor(
  data: unknown,
  language: OrbitLanguage = "zh"
): ConversationAiRunReferenceView[] {
  const t = createTranslator(language);
  const payload = isRecord(data) ? data : {};
  const runIds = new Set<string>();

  listFromPayload(payload, "aiRuns")
    .filter(isRecord)
    .forEach((run) => addRunId(runIds, aiRunRecordId(run)));
  listFromPayload(payload, "runs")
    .filter(isRecord)
    .forEach((run) => addRunId(runIds, aiRunRecordId(run)));
  addRunId(runIds, stringField(payload, "runId"));
  addRunId(runIds, stringField(nestedRecord(payload, "provenance"), "runId"));
  listFromPayload(payload, "messages")
    .filter(isRecord)
    .forEach((message) => addRunIdsFromText(runIds, stringField(message, "content")));

  return Array.from(runIds).map((id) => ({
    actionLabel: t("conversationVm.runViewEvidence"),
    detail: t("conversationVm.runReferenceDetail", { id: t.literal(id) }),
    id,
    title: t("conversationVm.runTitle")
  }));
}

export function buildAiRunDetailRequest(
  runId: string,
  language: OrbitLanguage = "zh"
): AiRunDetailRequestResult {
  const t = createTranslator(language);
  const normalizedRunId = runId.trim();

  if (!normalizedRunId) {
    return {
      error: t("conversationVm.runMissing"),
      success: false
    };
  }

  return {
    request: {
      path: aiRunPath(normalizedRunId)
    },
    success: true
  };
}

function aiRunOutputPreview(output: Record<string, unknown>, language: OrbitLanguage): string {
  const text = normalizeOrbitAiName(stringField(output, "text")).trim();

  if (!text || containsImplementationLabel(text)) {
    return createTranslator(language)("conversationVm.runNoOutput");
  }

  return text;
}

export function aiRunDetailToView(data: unknown, language: OrbitLanguage = "zh"): AiRunDetailView {
  const t = createTranslator(language);
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const run = nestedRecord(record, "run");
  const provenance = isRecord(record.provenance)
    ? nestedRecord(record, "provenance")
    : nestedRecord(run, "provenance");
  const output = nestedRecord(run, "output");
  const runId = stringField(run, "runId", stringField(provenance, "runId", t("conversationVm.runUnknown")));
  const promptTemplateId = stringField(run, "promptTemplateId", t("conversationVm.templateUnknown"));
  const evidenceCount =
    listField(run, "evidenceIds").length || listField(provenance, "evidenceIds").length;

  return {
    metrics: [t("conversationVm.runMetric", { id: t.literal(runId) }), t("conversationVm.templateMetric", { id: t.literal(promptTemplateId) }), t("conversationVm.evidenceMetric", { count: evidenceCount })],
    nextAction: userFacingText(
      stringField(record, "nextAction"),
      t("conversationVm.runNext")
    ),
    outputPreview: aiRunOutputPreview(output, language),
    safetyText: t("conversationVm.runSafety"),
    summary: /\b(prompt template|input hash|fallback behavior|run provenance|local rules)\b/iu.test(
      stringField(record, "summary")
    )
      ? t("conversationVm.runSummary")
      : userFacingText(stringField(record, "summary"), t("conversationVm.runSummary")),
    title: t("conversationVm.runTitle")
  };
}

export function conversationsToSummaries(data: unknown, language: OrbitLanguage = "zh"): ConversationSummary[] {
  const t = createTranslator(language);
  return listFromPayload(data, "conversations")
    .filter(isRecord)
    .map((conversation) => ({
      id: conversationField(
        conversation,
        "conversationId",
        stringField(conversation, "id", "conversation")
      ),
      preview:
        conversationPreview(conversationField(conversation, "lastMessagePreview"), t) ||
        conversationPreview(stringField(conversation, "preview"), t),
      title: conversationTitle(
        conversationField(conversation, "title", t("conversationVm.defaultTitle")), t
      )
    }));
}

function booleanField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
}

function actionRequiresConfirmation(action: Record<string, unknown>): boolean {
  return booleanField(
    action,
    "requiresUserConfirmation",
    booleanField(action, "requiresConfirmation", true)
  );
}

export function conversationPayloadToChatView(
  data: unknown,
  language: OrbitLanguage = "zh"
): ConversationChatView {
  const t = createTranslator(language);
  const payload = isRecord(data) ? data : {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const proposedToolIntents = Array.isArray(payload.proposedToolIntents)
    ? payload.proposedToolIntents
    : [];
  const activeConversationId = stringField(payload, "activeConversationId");
  const taskInteraction = isRecord(payload.taskInteraction)
    ? payload.taskInteraction
    : null;
  const taskInteractionState = taskInteraction
    ? stringField(taskInteraction, "state")
    : "";

  return {
    activeConversationId: activeConversationId || null,
    assistantMessage: assistantMessageContent(
      stringField(payload, "assistantMessage"), t
    ),
    messages: messages.filter(isRecord).map((message) => {
      const role = messageField(message, "role", "assistant");

      return {
        content: chatMessageContent(role, messageField(message, "content"), t),
        createdAt: messageField(message, "createdAt"),
        id: stringField(
          message,
          "messageId",
          stringField(message, "id", "message")
        ),
        role
      };
    }),
    proposedToolIntents: proposedToolIntents.filter(isRecord).map((intent) => ({
      id: stringField(intent, "intentId", stringField(intent, "id", "intent")),
      label: intentField(intent, "label", t("conversationVm.suggestedAction")),
      reason: stringField(intent, "reason"),
      requiresUserConfirmation: actionRequiresConfirmation(intent)
    })),
    taskInteraction:
      taskInteraction &&
      ["created", "suggested", "needs_date_confirmation", "failed"].includes(taskInteractionState)
        ? {
            category: stringField(taskInteraction, "category", "other"),
            ...(stringField(taskInteraction, "dueAt")
              ? { dueAt: stringField(taskInteraction, "dueAt") }
              : {}),
            reason: stringField(taskInteraction, "reason"),
            state: taskInteractionState as TaskInteractionView["state"],
            suggestionId: stringField(taskInteraction, "suggestionId"),
            taskId: stringField(taskInteraction, "taskId"),
            ...(stringField(taskInteraction, "sourceNoteId")
              ? { sourceNoteId: stringField(taskInteraction, "sourceNoteId") }
              : {}),
            ...(Number.isSafeInteger(taskInteraction.sourceNoteVersion) && Number(taskInteraction.sourceNoteVersion) >= 1
              ? { sourceNoteVersion: Number(taskInteraction.sourceNoteVersion) }
              : {}),
            ...(Array.isArray(taskInteraction.relatedContactIds) && taskInteraction.relatedContactIds.every((id) => typeof id === "string" && id.trim())
              ? { relatedContactIds: taskInteraction.relatedContactIds as string[] }
              : {}),
            title: stringField(taskInteraction, "title")
          }
        : null,
    // A payload that does not parse yields no card rather than a partial one.
    entityDraft: readAiEntityDraft(payload.entityDraft)
  };
}

export function orbitAiHomeChatWindow(
  data: unknown,
  latestChat: ConversationChatView | null = null,
  language: OrbitLanguage = "zh"
): OrbitAiHomeChatWindow {
  const chat = latestChat ?? conversationPayloadToChatView(data, language);
  // This ID belongs to the server's bootstrap welcome, not a user conversation.
  // Keep the general conversation decoder unchanged for history/detail screens.
  const homeMessages = chat.messages.filter((message) =>
    !(message.id === "orbit-agent-live-ready" && message.role === "assistant"));
  const bootstrapFallback = !latestChat && isRecord(data) &&
    stringField(data, "assistantMessage") === "Orbit Agent is ready for a natural-language request.";
  const messages = chat.messages.length > 0
    ? homeMessages
    : chat.assistantMessage && !bootstrapFallback
      ? [
          {
            content: chat.assistantMessage,
            createdAt: "",
            id: "orbit-ai-home-assistant",
            role: "assistant"
          }
        ]
      : [];

  return {
    ...chat,
    isEmpty: messages.length === 0,
    messages
  };
}

export function pendingConversationThreadView(
  message: string,
  language: OrbitLanguage = "zh"
): ConversationThreadView {
  const t = createTranslator(language);
  return {
    activeConversationId: null,
    assistantMessage: "",
    messages: [
      {
        content: message,
        createdAt: "",
        id: "pending-user-message",
        role: "user"
      },
      {
        content: t("conversationVm.pendingContext"),
        createdAt: "",
        id: "pending-assistant-message",
        role: "assistant"
      }
    ],
    nextAction: t("conversationVm.pendingAction"),
    proposedToolIntents: [],
    taskInteraction: null,
    title: t("conversationVm.pendingTitle")
  };
}

function markdownSegmentsFor(value: string): MarkdownInlineView[] {
  const segments: MarkdownInlineView[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/gu;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      segments.push({
        kind: "text",
        text: value.slice(cursor, index)
      });
    }

    const token = match[0];

    if (token.startsWith("**")) {
      segments.push({
        kind: "strong",
        text: token.slice(2, -2)
      });
    } else if (token.startsWith("`")) {
      segments.push({
        kind: "code",
        text: token.slice(1, -1)
      });
    } else {
      const label = /^\[([^\]]+)\]\([^)]+\)$/u.exec(token)?.[1] ?? token;
      segments.push({
        kind: "text",
        text: label
      });
    }

    cursor = index + token.length;
  }

  if (cursor < value.length) {
    segments.push({
      kind: "text",
      text: value.slice(cursor)
    });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

export function markdownBlocksFor(content: string): MarkdownBlockView[] {
  return content
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const quoteMatch = /^>\s*(.+)$/u.exec(line);
      const quotedLine = quoteMatch?.[1]?.trim();
      const lineBody = quotedLine || line;
      const taskMatch = /^[-*]\s+\[([ xX])\]\s+(.+)$/u.exec(lineBody);
      const orderedListMatch = /^(\d+)[.)]\s+(.+)$/u.exec(lineBody);
      const unorderedListMatch = /^[-*]\s+(.+)$/u.exec(lineBody);

      if (taskMatch) {
        const taskState = taskMatch[1] ?? "";
        const taskBody = taskMatch[2] ?? "";

        return {
          kind: "listItem",
          marker: taskState.toLowerCase() === "x" ? "✓" : "☐",
          ...(quoteMatch ? { quote: true } : {}),
          segments: markdownSegmentsFor(taskBody)
        };
      }

      if (orderedListMatch) {
        const orderIndex = orderedListMatch[1] ?? "";
        const orderBody = orderedListMatch[2] ?? "";

        return {
          kind: "listItem",
          marker: `${orderIndex}.`,
          ...(quoteMatch ? { quote: true } : {}),
          segments: markdownSegmentsFor(orderBody)
        };
      }

      const body = unorderedListMatch?.[1] ?? lineBody.replace(/^#{1,3}\s+/u, "");

      return {
        kind: unorderedListMatch ? "listItem" : "paragraph",
        ...(quoteMatch ? { quote: true } : {}),
        segments: markdownSegmentsFor(body)
      };
    });
}

function threadSearchText(thread: ConversationThreadView): string {
  const latestUserMessage = [...thread.messages]
    .reverse()
    .find((message) => message.role === "user");
  const messages = latestUserMessage
    ? [latestUserMessage.content]
    : thread.messages.map((message) => message.content);

  return messages.join(" ").toLowerCase();
}

function normalizedMatchText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/gu, "");
}

function contactMatchTerms(contact: ConversationContactCandidateView): string[] {
  return [
    contact.name,
    contact.organization,
    contact.role,
    contact.relationship,
    contact.status,
    contact.nextAction,
    ...(contact.valueLabels ?? [])
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizedMatchText)
    .filter((value) => value.length >= 2);
}

export function prioritizeConversationContacts<
  T extends ConversationContactCandidateView
>(thread: ConversationThreadView, contacts: readonly T[]): T[] {
  const threadText = normalizedMatchText(
    thread.messages.map((message) => message.content).join(" ")
  );

  return contacts
    .map((contact, index) => {
      const terms = contactMatchTerms(contact);
      const matchIndexes = terms
        .map((term) => threadText.indexOf(term))
        .filter((matchIndex) => matchIndex >= 0);

      return {
        contact,
        firstMatchIndex: Math.min(...matchIndexes),
        index,
        score: matchIndexes.length
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.score > 0 && right.score > 0) {
        return left.firstMatchIndex - right.firstMatchIndex;
      }

      return left.index - right.index;
    })
    .map((item) => item.contact);
}

const EVENT_TERM_ALIASES: Record<string, string[]> = {
  kansai: ["关西"],
  kyoto: ["京都"],
  osaka: ["大阪", "关西"],
  shanghai: ["上海"],
  taipei: ["台北"],
  tokyo: ["东京", "東京"]
};

function cjkNgramTerms(value: string): string[] {
  const terms = new Set<string>();

  for (const match of value.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const text = match[0];
    const maxSize = Math.min(4, text.length);

    for (let size = 2; size <= maxSize; size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        terms.add(text.slice(index, index + size));
      }
    }
  }

  return Array.from(terms);
}

function eventTermCandidates(value: string): string[] {
  const normalized = normalizedMatchText(value);
  const aliases = EVENT_TERM_ALIASES[normalized] ?? [];

  return [normalized, ...aliases.map(normalizedMatchText), ...cjkNgramTerms(value)];
}

function eventMatchTerms(event: ConversationEventCandidateView): string[] {
  const fields = [
    event.title,
    event.subtitle,
    event.location,
    ...event.topics
  ];
  const terms = fields
    .filter((value): value is string => typeof value === "string")
    .flatMap(eventTermCandidates)
    .filter((value) => value.length >= 2);

  return Array.from(new Set(terms));
}

export function prioritizeConversationEvents<
  T extends ConversationEventCandidateView
>(thread: ConversationThreadView, events: readonly T[]): T[] {
  const threadText = normalizedMatchText(
    thread.messages.map((message) => message.content).join(" ")
  );

  return events
    .map((event, index) => {
      const terms = eventMatchTerms(event);
      const matchIndexes = terms
        .map((term) => threadText.indexOf(term))
        .filter((matchIndex) => matchIndex >= 0);

      return {
        event,
        firstMatchIndex: Math.min(...matchIndexes),
        index,
        score: matchIndexes.length
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.score > 0 && right.score > 0) {
        return left.firstMatchIndex - right.firstMatchIndex;
      }

      return left.index - right.index;
    })
    .map((item) => item.event);
}

export function conversationInlinePanelsForThread(
  thread: ConversationThreadView,
  language: OrbitLanguage = "zh"
): ConversationInlinePanelView[] {
  const t = createTranslator(language);
  const searchText = threadSearchText(thread);
  const panels: ConversationInlinePanelView[] = [];

  if (
    /跟进|回访|follow|followup|follow-up|提醒|优先级|待处理|下一步/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/tasks",
      actionLabel: t("conversationVm.panelTasksAction"),
      detail: t("conversationVm.panelTasksDetail"),
      kind: "followups",
      title: t("conversationVm.panelTasksTitle")
    });
  }

  if (
    /人脉|联系人|介绍|引荐|见谁|认识谁|people|person|contact|contacts|intro|introduce/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/contacts/list",
      actionLabel: t("conversationVm.panelPeopleAction"),
      detail: t("conversationVm.panelPeopleDetail"),
      kind: "people",
      title: t("conversationVm.panelPeopleTitle")
    });
  }

  if (
    /活动|参加|报名|会议|交流会|event|events|meetup|conference|attend/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/events",
      actionLabel: t("conversationVm.panelEventsAction"),
      detail: t("conversationVm.panelEventsDetail"),
      kind: "events",
      title: t("conversationVm.panelEventsTitle")
    });
  }

  if (
    /日程|安排|几点|什么时候|calendar|schedule|appointment/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/schedule",
      actionLabel: t("conversationVm.panelScheduleAction"),
      detail: t("conversationVm.panelScheduleDetail"),
      kind: "schedule",
      title: t("conversationVm.panelScheduleTitle")
    });
  }

  if (
    /档案|个人主页|主页|自我介绍|别人看到|能提供什么|资源标签|profile|bio/iu.test(
      searchText
    )
  ) {
    panels.push({
      actionHref: "/profile",
      actionLabel: t("conversationVm.panelProfileAction"),
      detail: t("conversationVm.panelProfileDetail"),
      kind: "profile",
      title: t("conversationVm.panelProfileTitle")
    });
  }

  return panels;
}

export function conversationQuickRoutes(language: OrbitLanguage = "zh"): ConversationQuickRouteView[] {
  const t = createTranslator(language);
  return [
    {
      detail: t("conversationVm.routeEventsDetail"),
      href: "/events",
      title: t("conversationVm.routeEventsTitle")
    },
    {
      detail: t("conversationVm.routePeopleDetail"),
      href: "/contacts",
      title: t("conversationVm.routePeopleTitle")
    },
    {
      detail: t("conversationVm.routeTasksDetail"),
      href: "/tasks",
      title: t("conversationVm.routeTasksTitle")
    },
    {
      detail: t("conversationVm.routeScheduleDetail"),
      href: "/schedule",
      title: t("conversationVm.routeScheduleTitle")
    },
    {
      detail: t("conversationVm.routeProfileDetail"),
      href: "/profile",
      title: t("conversationVm.routeProfileTitle")
    }
  ];
}

export function shouldSubmitInitialPrompt({
  initialPrompt,
  isDraftConversation,
  submittedPrompt
}: {
  initialPrompt: string;
  isDraftConversation: boolean;
  submittedPrompt: string | null;
}): boolean {
  return Boolean(
    isDraftConversation &&
      initialPrompt.trim() &&
      submittedPrompt !== initialPrompt.trim()
  );
}

export function conversationPayloadToThreadView(
  data: unknown,
  language: OrbitLanguage = "zh"
): ConversationThreadView {
  const t = createTranslator(language);
  const payload = isRecord(data) ? data : {};
  const chat = conversationPayloadToChatView(payload, language);
  const activeConversationId = chat.activeConversationId;
  const conversation = conversationsToSummaries(payload, language).find(
    (summary) => summary.id === activeConversationId
  );

  return {
    ...chat,
    nextAction: nextActionCopy(stringField(payload, "nextAction"), t),
    ...(Array.isArray(payload.artifacts) && payload.artifacts.length ? { contactArtifacts: conversationContactArtifacts(payload) } : {}),
    title: conversation?.title ?? t("conversationVm.defaultTitle")
  };
}

export function proactiveTurnPayloadToChatView(
  data: unknown,
  language: OrbitLanguage = "zh"
): ConversationChatView {
  const t = createTranslator(language);
  const payload = isRecord(data) ? data : {};
  const message = isRecord(payload.message) ? payload.message : {};
  const suggestedActions = Array.isArray(payload.suggestedActions)
    ? payload.suggestedActions
    : [];
  const content = stringField(message, "content");
  const conversationId = stringField(message, "conversationId");

  return {
    activeConversationId: conversationId || null,
    assistantMessage: content,
    messages: content
      ? [
          {
            content,
            createdAt: messageField(message, "createdAt"),
            id: stringField(
              message,
              "messageId",
              stringField(message, "id", "message")
            ),
            role: stringField(message, "role", "assistant")
          }
        ]
      : [],
    proposedToolIntents: suggestedActions.filter(isRecord).map((action) => ({
      id: stringField(action, "actionId", stringField(action, "id", "action")),
      label: stringField(action, "label", t("conversationVm.suggestedAction")),
      reason: stringField(action, "reason", t("conversationVm.suggestedReason")),
      requiresUserConfirmation: actionRequiresConfirmation(action)
    })),
    taskInteraction: null
  };
}
