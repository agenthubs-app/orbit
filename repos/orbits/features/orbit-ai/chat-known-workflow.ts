import type { AgentRuntimeService } from "../agent/runtime/service";
import { createOrbitAgentRuntimeService } from "../agent/runtime/service-factory";
import type { ContactsListSearchAndFilterService } from "../contacts/service";
import { createContactsListSearchAndFilterService } from "../contacts/service-factory";
import type { EventAttendeeRosterService } from "../events/attendee-roster/contract";
import type { EventCrudAndImportService } from "../events/event-crud-and-import/service";
import {
  createEventAttendeeRosterService,
  createEventCrudAndImportService,
} from "../events/service-factory";
import type {
  OrbitAgentConversationResult,
  OrbitAgentSendMessageInput,
} from "./conversation-contract";
import { createPostEventFollowupWorkflow } from "./workflows/post-event-followup-v1";

const CONTACT_FIELD_LABELS = ["联系人", "contact", "person"] as const;
const EVENT_FIELD_LABELS = ["活动", "event"] as const;
const NOTE_FIELD_LABELS = [
  "会面内容",
  "会面记录",
  "笔记",
  "meeting notes",
  "meeting note",
  "meeting content",
] as const;
const ALL_FIELD_LABELS = [
  ...CONTACT_FIELD_LABELS,
  ...EVENT_FIELD_LABELS,
  ...NOTE_FIELD_LABELS,
] as const;

export interface ChatWorkflowContact {
  displayName: string;
  evidenceIds: readonly string[];
  id: string;
  lastInteractionAt?: string;
  nextAction?: string;
  organization?: string;
  relationshipContext?: string;
}

export interface ChatWorkflowEvent {
  endsAt: string;
  evidenceIds: readonly string[];
  id: string;
  status: string;
  title: string;
}

export interface ChatKnownWorkflowContextReader {
  eventHasContact: (eventId: string, contactId: string) => Promise<boolean>;
  listContacts: () => Promise<readonly ChatWorkflowContact[]>;
  listEvents: () => Promise<readonly ChatWorkflowEvent[]>;
}

export interface ChatKnownWorkflowOrchestratorOptions {
  contextReader?: ChatKnownWorkflowContextReader;
  legacyDeterministicPostEventFollowupEnabled?: boolean;
  now?: () => string;
  processOutboxAfterStart?: boolean;
  runtime?: AgentRuntimeService;
}

export type ChatKnownWorkflowOutcome =
  | "not_applicable"
  | "clarification"
  | "started";

export interface ChatKnownWorkflowResponse {
  outcome: ChatKnownWorkflowOutcome;
  result: OrbitAgentConversationResult;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldPattern(labels: readonly string[]): RegExp {
  return new RegExp(
    `(?:^|[\\n。；;，,])\\s*(?:${labels
      .map(escapeRegExp)
      .join("|")})\\s*[:：]\\s*`,
    "iu",
  );
}

function extractField(
  message: string,
  labels: readonly string[],
  options: { preserveTrailingPunctuation?: boolean } = {},
): string | null {
  const match = fieldPattern(labels).exec(message);
  if (!match) return null;

  const tail = message.slice((match.index ?? 0) + match[0].length);
  const nextField = fieldPattern(ALL_FIELD_LABELS).exec(tail);
  const extracted = (nextField ? tail.slice(0, nextField.index) : tail).trim();
  const value = options.preserveTrailingPunctuation
    ? extracted
    : extracted.replace(/[。；;，,]+$/u, "").trim();

  return value || null;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function containsExactIdentity(message: string, identity: string): boolean {
  const value = normalized(identity);
  if (!value) return false;

  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) {
    return normalized(message).includes(value);
  }

  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(value)}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(normalized(message));
}

function isPostEventFollowupIntent(message: string): boolean {
  return /会后跟进|跟进操作|记录.{0,8}会面|post[- ]?event\s+follow[- ]?up|(?:create|prepare|record).{0,24}follow[- ]?up/iu.test(
    message,
  );
}

// Route 层用这个纯识别函数先分流已知工作流。它不能读取上下文、调用
// planner/provider 或创建 Action；真正的权威数据校验仍由 orchestrator.handle 完成。
export function isChatKnownWorkflowInput(
  input: OrbitAgentSendMessageInput,
): boolean {
  const message = input.message?.trim() ?? "";

  return Boolean(message) && isPostEventFollowupIntent(message);
}

function successfulResultWithMessage(
  result: OrbitAgentConversationResult,
  message: string,
  actionIds: readonly string[] = [],
  runId?: string,
): OrbitAgentConversationResult {
  if (result.success === false) return result;

  return {
    success: true,
    data: {
      ...result.data,
      actionIds,
      assistantMessage: message,
      nextAction: message,
      runId,
    },
  };
}

function localeFor(input: OrbitAgentSendMessageInput): "en" | "zh" {
  if (input.locale === "en") return "en";
  if (input.locale === "zh") return "zh";
  return /[\p{Script=Han}]/u.test(input.message ?? "") ? "zh" : "en";
}

function clarification(
  result: OrbitAgentConversationResult,
  locale: "en" | "zh",
  issue:
    | "active_conversation"
    | "contact_ambiguous"
    | "contact_missing"
    | "contact_not_found"
    | "context_unavailable"
    | "event_ambiguous"
    | "event_missing"
    | "event_not_found"
    | "event_not_finished"
    | "note_missing",
  detail?: string,
): ChatKnownWorkflowResponse {
  const messages: Record<typeof issue, { en: string; zh: string }> = {
    active_conversation: {
      en: "Start or select an active Agent conversation before creating a follow-up.",
      zh: "请先开始或选择一个有效的 Agent 对话，我才能把操作绑定到同一会话。",
    },
    contact_ambiguous: {
      en: "More than one contact matches. Add `Contact: full name` before I create any action.",
      zh: "匹配到多个联系人。请补充“联系人：完整姓名”，确认前我不会创建写操作。",
    },
    contact_missing: {
      en: "Who did you meet? Add `Contact: full name`. I will not create an action until the contact is verified.",
      zh: "这次会面是和谁？请补充“联系人：完整姓名”。联系人确认前不会创建写操作。",
    },
    contact_not_found: {
      en: `I could not verify the contact${detail ? ` “${detail}”` : ""}. Check the saved contact name before continuing.`,
      zh: `没有在已保存联系人中找到${detail ? `“${detail}”` : "这个人"}。请核对姓名后再继续。`,
    },
    context_unavailable: {
      en: "I cannot verify contacts and events right now, so no action was created.",
      zh: "当前无法验证联系人和活动来源，因此没有创建任何操作。请稍后重试。",
    },
    event_ambiguous: {
      en: "More than one event could match. Add `Event: exact title` before I create any action.",
      zh: "有多个活动可能匹配。请补充“活动：准确名称”，确认前不会创建写操作。",
    },
    event_missing: {
      en: "Which event was this from? Add `Event: exact title`; I could not infer one unique event from the verified context.",
      zh: "这是在哪个活动发生的？请补充“活动：准确名称”；当前权威上下文无法唯一确定活动。",
    },
    event_not_found: {
      en: `I could not verify the event${detail ? ` “${detail}”` : ""}. Check the saved event title before continuing.`,
      zh: `没有在已保存活动中找到${detail ? `“${detail}”` : "这个活动"}。请核对名称后再继续。`,
    },
    event_not_finished: {
      en: "That event has not ended, so I did not create a post-event action.",
      zh: "该活动尚未结束，因此没有创建会后写操作。",
    },
    note_missing: {
      en: "What was agreed in the meeting? Add `Meeting notes: ...` with the concrete discussion or commitment.",
      zh: "会面中具体讨论或承诺了什么？请补充“会面内容：……”。缺少确认内容时不会创建写操作。",
    },
  };

  return {
    outcome: "clarification",
    result: successfulResultWithMessage(result, messages[issue][locale]),
  };
}

function createDefaultContextReader(input: {
  attendees: EventAttendeeRosterService;
  contacts: ContactsListSearchAndFilterService;
  events: EventCrudAndImportService;
}): ChatKnownWorkflowContextReader {
  return {
    async listContacts() {
      const result = await input.contacts.listContacts();
      if (result.success === false) throw new Error(result.error.code);
      return result.data.contacts.map((contact) => ({
        displayName: contact.displayName,
        evidenceIds: contact.evidence.map((evidence) => evidence.evidenceId),
        id: contact.id,
        lastInteractionAt: contact.lastInteractionAt,
        nextAction: contact.nextAction,
        organization: contact.organization,
        relationshipContext: contact.relationshipContext,
      }));
    },
    async listEvents() {
      const result = await input.events.listEvents();
      if (result.success === false) throw new Error(result.error.code);
      return result.data.events.map((event) => ({
        endsAt: event.endsAt,
        evidenceIds: event.evidence.map((evidence) => evidence.evidenceId),
        id: event.id,
        status: event.status,
        title: event.title,
      }));
    },
    async eventHasContact(eventId, contactId) {
      const result = await input.attendees.getAttendeeRoster({ eventId });
      return (
        result.success === true &&
        result.data.attendees.some(
          (attendee) => attendee.knownContactMarker.contactId === contactId,
        )
      );
    },
  };
}

function resolveContact(input: {
  contacts: readonly ChatWorkflowContact[];
  explicitContact: string | null;
  message: string;
}):
  | { kind: "resolved"; contact: ChatWorkflowContact }
  | {
      kind: "clarification";
      issue: "contact_ambiguous" | "contact_missing" | "contact_not_found";
      detail?: string;
    } {
  const matches = input.explicitContact
    ? input.contacts.filter(
        (contact) =>
          normalized(contact.id) === normalized(input.explicitContact as string) ||
          normalized(contact.displayName) ===
            normalized(input.explicitContact as string),
      )
    : input.contacts.filter((contact) =>
        containsExactIdentity(input.message, contact.displayName),
      );

  if (matches.length === 1) return { kind: "resolved", contact: matches[0] };
  if (matches.length > 1) {
    return { kind: "clarification", issue: "contact_ambiguous" };
  }
  return {
    kind: "clarification",
    issue: input.explicitContact ? "contact_not_found" : "contact_missing",
    detail: input.explicitContact ?? undefined,
  };
}

function eligiblePostEvent(
  event: ChatWorkflowEvent,
  now: string,
): "eligible" | "not_finished" | "unavailable" {
  const endsAt = Date.parse(event.endsAt);
  const current = Date.parse(now);
  if (!Number.isFinite(endsAt) || !Number.isFinite(current)) {
    return "unavailable";
  }
  if (event.status === "cancelled" || event.status === "draft") {
    return "unavailable";
  }
  return endsAt <= current ? "eligible" : "not_finished";
}

async function resolveEvent(input: {
  contact: ChatWorkflowContact;
  contextReader: ChatKnownWorkflowContextReader;
  events: readonly ChatWorkflowEvent[];
  explicitEvent: string | null;
  now: string;
}): Promise<
  | { kind: "resolved"; event: ChatWorkflowEvent }
  | {
      kind: "clarification";
      issue:
        | "event_ambiguous"
        | "event_missing"
        | "event_not_found"
        | "event_not_finished";
      detail?: string;
    }
> {
  if (input.explicitEvent) {
    const matches = input.events.filter(
      (event) =>
        normalized(event.id) === normalized(input.explicitEvent as string) ||
        normalized(event.title) === normalized(input.explicitEvent as string),
    );
    if (matches.length === 0) {
      return {
        kind: "clarification",
        issue: "event_not_found",
        detail: input.explicitEvent,
      };
    }
    if (matches.length > 1) {
      return { kind: "clarification", issue: "event_ambiguous" };
    }
    if (eligiblePostEvent(matches[0], input.now) !== "eligible") {
      return { kind: "clarification", issue: "event_not_finished" };
    }
    return { kind: "resolved", event: matches[0] };
  }

  const eligibleEvents = input.events.filter(
    (event) => eligiblePostEvent(event, input.now) === "eligible",
  );
  const rosterMatches = (
    await Promise.all(
      eligibleEvents.map(async (event) => ({
        event,
        matches: await input.contextReader
          .eventHasContact(event.id, input.contact.id)
          .catch(() => false),
      })),
    )
  ).filter((candidate) => candidate.matches);

  if (rosterMatches.length === 1) {
    return { kind: "resolved", event: rosterMatches[0].event };
  }
  return {
    kind: "clarification",
    issue: rosterMatches.length > 1 ? "event_ambiguous" : "event_missing",
  };
}

export function createChatKnownWorkflowOrchestrator(
  options: ChatKnownWorkflowOrchestratorOptions = {},
) {
  let runtime = options.runtime;
  let contextReader = options.contextReader;
  const now = options.now ?? (() => new Date().toISOString());

  function getRuntime(): AgentRuntimeService {
    runtime ??= createOrbitAgentRuntimeService();
    return runtime;
  }

  function getContextReader(): ChatKnownWorkflowContextReader {
    contextReader ??= createDefaultContextReader({
      attendees: createEventAttendeeRosterService(),
      contacts: createContactsListSearchAndFilterService(),
      events: createEventCrudAndImportService(),
    });
    return contextReader;
  }

  return {
    async handle(input: {
      conversationInput: OrbitAgentSendMessageInput;
      conversationResult: OrbitAgentConversationResult;
    }): Promise<ChatKnownWorkflowResponse> {
      const message = input.conversationInput.message?.trim() ?? "";
      const legacyWorkflowEnabled =
        options.legacyDeterministicPostEventFollowupEnabled ??
        options.processOutboxAfterStart === true;
      if (
        !message ||
        !isPostEventFollowupIntent(message) ||
        input.conversationResult.success === false ||
        !legacyWorkflowEnabled
      ) {
        return {
          outcome: "not_applicable",
          result: input.conversationResult,
        };
      }

      const locale = localeFor(input.conversationInput);
      const activeConversationId =
        input.conversationResult.data.activeConversationId;
      if (!activeConversationId) {
        return clarification(
          input.conversationResult,
          locale,
          "active_conversation",
        );
      }

      const noteText = extractField(message, NOTE_FIELD_LABELS, {
        preserveTrailingPunctuation: true,
      });
      if (!noteText || noteText.length < 8) {
        return clarification(
          input.conversationResult,
          locale,
          "note_missing",
        );
      }

      let contacts: readonly ChatWorkflowContact[];
      let events: readonly ChatWorkflowEvent[];
      let verifiedContext: ChatKnownWorkflowContextReader;
      try {
        verifiedContext = getContextReader();
        [contacts, events] = await Promise.all([
          verifiedContext.listContacts(),
          verifiedContext.listEvents(),
        ]);
      } catch {
        return clarification(
          input.conversationResult,
          locale,
          "context_unavailable",
        );
      }

      const contactResolution = resolveContact({
        contacts,
        explicitContact: extractField(message, CONTACT_FIELD_LABELS),
        message,
      });
      if (contactResolution.kind === "clarification") {
        return clarification(
          input.conversationResult,
          locale,
          contactResolution.issue,
          contactResolution.detail,
        );
      }

      const eventResolution = await resolveEvent({
        contact: contactResolution.contact,
        contextReader: verifiedContext,
        events,
        explicitEvent: extractField(message, EVENT_FIELD_LABELS),
        now: now(),
      });
      if (eventResolution.kind === "clarification") {
        return clarification(
          input.conversationResult,
          locale,
          eventResolution.issue,
          eventResolution.detail,
        );
      }

      let workflowRuntime: AgentRuntimeService;
      try {
        workflowRuntime = getRuntime();
      } catch {
        return clarification(
          input.conversationResult,
          locale,
          "context_unavailable",
        );
      }
      const workflow = createPostEventFollowupWorkflow(workflowRuntime);
      const evidenceIds = Array.from(
        new Set([
          ...contactResolution.contact.evidenceIds,
          ...eventResolution.event.evidenceIds,
        ]),
      );
      let workflowResult = await workflow.run({
        contactId: contactResolution.contact.id,
        contactName: contactResolution.contact.displayName,
        conversationId: activeConversationId,
        eventId: eventResolution.event.id,
        eventTitle: eventResolution.event.title,
        evidenceIds,
        lastInteractionAt: contactResolution.contact.lastInteractionAt,
        nextAction: contactResolution.contact.nextAction,
        noteSource: "typed",
        noteText,
        organization: contactResolution.contact.organization,
        relationshipContext:
          contactResolution.contact.relationshipContext,
        trigger: "chat",
      });

      if (options.processOutboxAfterStart) {
        await workflowRuntime.processOutbox({
          limit: 20,
          workerId: "chat-known-workflow-request-worker",
        });
        const detail = await workflowRuntime.getRun(workflowResult.run.runId);
        if (detail) {
          workflowResult = {
            ...workflowResult,
            actions: detail.actions,
            run: detail.run,
          };
        }
      }

      const createdMessage =
        locale === "zh"
          ? `已根据 ${eventResolution.event.title} 与 ${contactResolution.contact.displayName} 的确认会面内容创建 ${workflowResult.actions.length} 项会后操作。笔记和消息只在 Orbit 内保存，消息不会自动发送；任务与提醒仍等待你确认。`
          : `I created ${workflowResult.actions.length} post-event actions from the verified meeting notes for ${contactResolution.contact.displayName} at ${eventResolution.event.title}. Notes and drafts stay inside Orbit and messages are never auto-sent; tasks and reminders still require confirmation.`;

      return {
        outcome: "started",
        result: successfulResultWithMessage(
          input.conversationResult,
          createdMessage,
          workflowResult.actions.map((action) => action.actionId),
          workflowResult.run.runId,
        ),
      };
    },
  };
}
