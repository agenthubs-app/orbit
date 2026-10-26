import type {
  AiSessionEntryPointId,
  AiSessionOriginInputContract,
  AiSessionReferenceContract,
} from "../api/contract/ai-sessions";
import { aiSessionOriginInputSchema } from "../api/schema/ai-sessions";
import { currentTranslator, type OrbitTranslator } from "../i18n/messages";

export interface AiTemplatePrefill {
  message: string;
  origin: AiSessionOriginInputContract;
  references: readonly AiSessionReferenceContract[];
}

type RegisteredPrefill = AiTemplatePrefill & {
  actorId: string;
  baseUrl: string;
  consumed: boolean;
  id: string;
};

let sequence = 0;
let latest: RegisteredPrefill | null = null;

export function registerAiTemplatePrefill(input: {
  actorId: string;
  baseUrl: string;
  entryPointId: AiSessionEntryPointId;
  message: string;
  references: readonly AiSessionReferenceContract[];
  sourceDataVersion?: string;
  template: { id: string; version: number };
}): string {
  const id = `ai-prefill-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const origin = aiSessionOriginInputSchema.parse({
    entryClient: "app",
    entryPointId: input.entryPointId,
    initialGroupId: null,
    kind: "structured",
    ...(input.sourceDataVersion
      ? { sourceDataVersion: input.sourceDataVersion }
      : {}),
    template: input.template,
  });
  if (!input.actorId.trim() || !input.baseUrl.trim() || !input.message.trim()) {
    throw new Error("AI template prefill requires an identity and message");
  }
  latest = {
    actorId: input.actorId,
    baseUrl: input.baseUrl,
    consumed: false,
    id,
    message: input.message,
    origin,
    references: input.references.map((reference) => ({ ...reference })),
  };
  return id;
}

export function consumeAiTemplatePrefill(identity: {
  actorId: string;
  baseUrl: string;
  id: string;
}): AiTemplatePrefill | null {
  if (!latest || latest.id !== identity.id || latest.consumed) return null;
  const registered = latest;
  registered.consumed = true;
  if (registered.actorId !== identity.actorId || registered.baseUrl !== identity.baseUrl) return null;
  return {
    message: registered.message,
    origin: registered.origin,
    references: registered.references.map((reference) => ({ ...reference })),
  };
}

export function contactMessageTemplate(contact: { id: string; name: string; organization: string }) {
  return {
    entryPointId: "contact.message_draft" as const,
    message: `请为 @${contact.name} 起草一封联系邮件。背景公司：${contact.organization || "未填写"}。只生成可编辑草稿，不要发送。`,
    references: [{ id: contact.id, type: "contact" as const }],
    template: { id: "contact.message_draft", version: 1 },
  };
}

// QA-C: the prompt is sent as the user's first message, so it follows the UI language (it was always Chinese).
export function contactFollowupTemplate(input: {
  channel: "chat" | "email";
  contactId: string;
  contactName: string;
  organization: string;
  rationale: string;
  recommendedAction: string;
}, t: OrbitTranslator = currentTranslator()) {
  const channel = t(input.channel === "email" ? "ai.prefill.channelEmail" : "ai.prefill.channelChat");
  const part = (value: string) => value.trim().replace(/[。.\s]+$/u, "");
  // An empty part would read "原因：。"; its whole sentence is dropped instead.
  const sentences = [
    t("ai.prefill.followupAsk", { name: input.contactName, channel }),
    part(input.organization) ? t("ai.prefill.followupCompany", { value: part(input.organization) }) : "",
    part(input.recommendedAction) ? t("ai.prefill.followupNext", { value: part(input.recommendedAction) }) : "",
    part(input.rationale) ? t("ai.prefill.followupReason", { value: part(input.rationale) }) : "",
    t("ai.prefill.draftOnly"),
  ].filter(Boolean);
  const message = sentences.map((text) => t("ai.prefill.sentence", { text })).join("").trim();
  return {
    entryPointId: "contact.followup_draft" as const,
    message,
    references: [{ id: input.contactId, type: "contact" as const }],
    template: { id: input.channel === "email" ? "contact.followup_email_draft" : "contact.followup_chat_draft", version: 1 },
  };
}

export function inboxPolishTemplate(input: { contactId: string; contactName: string; draft: string }, t: OrbitTranslator = currentTranslator()) {
  return {
    entryPointId: "inbox.polish_draft" as const,
    message: t("ai.prefill.polish", { name: input.contactName, draft: input.draft }),
    references: [{ id: input.contactId, type: "contact" as const }],
    template: { id: "inbox.polish_draft", version: 1 },
  };
}

export function followupCandidateTemplate(kind: "task" | "reminder", t: OrbitTranslator = currentTranslator()) {
  return {
    entryPointId: "followup.task_candidate" as const,
    message: t(kind === "task" ? "ai.prefill.taskCandidates" : "ai.prefill.reminderCandidates"),
    references: [],
    template: { id: kind === "task" ? "followup.task_candidate" : "followup.reminder_candidate", version: 1 },
  };
}

export function contactsAnalysisTemplate(sourceDataVersion: string) {
  return {
    entryPointId: "contacts.analysis" as const,
    message: "请根据当前已保存的人脉资料生成一份人脉分析。请说明关系结构、目标覆盖和下一步建议，并标明判断依据。",
    references: [],
    sourceDataVersion,
    template: { id: "contacts.analysis", version: 1 as const },
  };
}
