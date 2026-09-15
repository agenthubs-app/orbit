import type {
  AiSessionEntryPointId,
  AiSessionOriginInputContract,
  AiSessionReferenceContract,
} from "../api/contract/ai-sessions";
import { aiSessionOriginInputSchema } from "../api/schema/ai-sessions";

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

export function contactFollowupTemplate(input: {
  channel: "chat" | "email";
  contactId: string;
  contactName: string;
  organization: string;
  rationale: string;
  recommendedAction: string;
}) {
  const channel = input.channel === "email" ? "邮件" : "联系消息";
  return {
    entryPointId: "contact.followup_draft" as const,
    message: `请为 @${input.contactName} 起草一段${channel}。公司：${input.organization || "未填写"}。建议下一步：${input.recommendedAction}。原因：${input.rationale}。只生成可编辑草稿，不要发送。`,
    references: [{ id: input.contactId, type: "contact" as const }],
    template: { id: input.channel === "email" ? "contact.followup_email_draft" : "contact.followup_chat_draft", version: 1 },
  };
}

export function inboxPolishTemplate(input: { contactId: string; contactName: string; draft: string }) {
  return {
    entryPointId: "inbox.polish_draft" as const,
    message: `请润色这段准备发给 @${input.contactName} 的草稿，保留事实和原意，只返回可编辑草稿，不要发送：\n${input.draft}`,
    references: [{ id: input.contactId, type: "contact" as const }],
    template: { id: "inbox.polish_draft", version: 1 },
  };
}

export function followupCandidateTemplate(kind: "task" | "reminder") {
  return {
    entryPointId: "followup.task_candidate" as const,
    message: kind === "task"
      ? "请根据我当前已保存的到期跟进，整理待复核的联系任务候选。不要自动创建事项或发送消息。"
      : "请根据我当前已保存的到期跟进，整理待复核的提醒候选。不要自动创建提醒、发送推送或消息。",
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
