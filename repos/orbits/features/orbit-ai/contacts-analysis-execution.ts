import type { ContactsAnalysisSource } from "../mobile/contacts-analysis-report-provider";
import type { OrbitAgentConversationResult } from "./conversation-contract";
import type { GeminiOrbitAgentSynthesisInput } from "./gemini-provider";

export const CONTACTS_ANALYSIS_GENERATION_METHOD = "model-provider-live-agent-reply";
export const CONTACTS_ANALYSIS_GENERATION_LABEL_PREFIX = "Orbit contacts.analysis@1 via ";

// Created only after the authenticated route reads and verifies its actor's
// dashboard. No HTTP body parser accepts this context.
export interface ContactsAnalysisExecutionContext {
  source: ContactsAnalysisSource;
  sourceDataVersion: string;
  liveDatabaseReadExecuted?: boolean;
}

const reportLabels = [
  "关系结构|Relationship structure",
  "目标覆盖|Goal coverage",
  "下一步建议|Next steps",
  "判断依据|Evidence",
];

export function isContactsAnalysisReportBody(body: string): boolean {
  const labels = reportLabels.map((label) => new RegExp(`(?:^|\\n)\\s*\\*\\*(?:${label})\\*\\*\\s*[:：]?\\s*([^\\n]+)`, "i").exec(body));
  return labels.every((match) => Boolean(match?.[1]?.trim())) &&
    !/(?:我|Orbit)\s*(?:已|已经|已經)(?:保存|修改|删除|添加|发送|创建)|\bI (?:have )?(?:saved|updated|deleted|sent|created)\b/i.test(body);
}

function evidenceAnchors(source: ContactsAnalysisSource): string[] {
  const anchors = new Set<string>();
  const visit = (value: unknown, contactData = false) => {
    if (Array.isArray(value)) { value.forEach((item) => visit(item, contactData)); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === "contactId" || (contactData && key === "id")) && typeof child === "string" && child.trim()) anchors.add(child);
      if (key === "evidenceIds" && Array.isArray(child)) child.forEach((id) => { if (typeof id === "string" && id.trim()) anchors.add(id); });
      visit(child, contactData);
    }
  };
  visit(source); visit(source.contacts, true);
  return [...anchors];
}

export function contactsAnalysisSynthesisInput(input: {
  context: ContactsAnalysisExecutionContext;
  history: GeminiOrbitAgentSynthesisInput["history"];
  locale: string | null | undefined;
  message: string;
}): GeminiOrbitAgentSynthesisInput {
  return {
    artifacts: [{
      kind: "contacts_analysis", preferredSurface: "conversation", title: "人脉分析",
      summary: JSON.stringify({ analysisVersion: "contacts.analysis@1", sourceDataVersion: input.context.sourceDataVersion, evidenceAnchors: evidenceAnchors(input.context.source), untrustedContactsAnalysisData: input.context.source }),
    }],
    assistantMessage: "Produce the complete registered contacts.analysis@1 report from the verified actor data, not a candidate list.",
    history: input.history, intent: "general_chat", locale: input.locale, message: input.message, toolRequests: [],
    trustedContactsAnalysis: { analysisVersion: "contacts.analysis@1", sourceDataVersion: input.context.sourceDataVersion },
  };
}

export function contactsAnalysisReplyMatchesSource(body: string, context: ContactsAnalysisExecutionContext): boolean {
  const anchors = evidenceAnchors(context.source);
  return isContactsAnalysisReportBody(body) && anchors.length > 0 && anchors.some((anchor) => body.includes(anchor));
}

export function isSuccessfulContactsAnalysisExecution(result: OrbitAgentConversationResult, context: ContactsAnalysisExecutionContext, message: string): boolean {
  return result.success && result.data.state === "success" &&
    result.data.provenance.generationMethod === CONTACTS_ANALYSIS_GENERATION_METHOD &&
    result.data.provenance.sourceLabel.startsWith(CONTACTS_ANALYSIS_GENERATION_LABEL_PREFIX) &&
    result.data.provenance.safety.aiProviderRequested &&
    !result.data.provenance.safety.externalSideEffectsExecuted &&
    result.data.messages.find((turn) => turn.role === "user")?.content === message &&
    contactsAnalysisReplyMatchesSource(result.data.assistantMessage, context);
}
