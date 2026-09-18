import { z } from "zod";
import type { AiContactArtifactContract } from "../contract/ai-artifacts";

const text = z.string().max(12000);
const id = text.trim().min(1);
const status = z.enum(["ready", "pending", "failed"]);
const presentation = z.object({ preferredSurface: z.enum(["inline_card", "side_panel", "full_page"]), title: text, subtitle: text.optional(), widthHint: z.enum(["half", "wide"]).optional() });
const action = z.object({ actionId: id, label: text, requiresConfirmation: z.boolean(), href: text.optional() });
const metadata = z.object({ label: text, value: text });
const item = z.object({ id, title: text, subtitle: text.optional(), body: text.optional(), reason: text.optional(), evidenceIds: z.array(id).max(200), metadata: z.array(metadata).max(32), actions: z.array(action).max(32), contactId: id.optional() });
const section = z.object({ title: text, body: text.optional(), items: z.array(item).max(200) });
const view = z.object({ summary: text, emptyState: text.optional(), sections: z.array(section).max(16) }).refine(value => {
  const items = value.sections.flatMap(section => section.items);
  return items.length <= 200 && new Set(items.map(item => item.id)).size === items.length;
});
export const contactArtifactSchema = z.object({
  task: z.object({ artifactId: id, taskId: id, conversationId: id.nullable(), kind: z.literal("contact_recommendations"), status, artifactProducer: z.literal("contact_recommendation_producer"), presentation, query: text, createdAt: text, updatedAt: text }),
  result: z.object({ artifactId: id, taskId: id, kind: z.literal("contact_recommendations"), status, presentation, generatedView: view.nullable(), nextAction: text })
}).refine(value => value.task.artifactId === value.result.artifactId && value.task.taskId === value.result.taskId && value.task.status === value.result.status);

// Navigation is not execution. Only an evidenced, identity-matched contact review is eligible.
export function contactArtifactDetailHref(value: { id: string; evidenceIds: readonly string[]; contactId?: string | undefined; actions: readonly z.infer<typeof action>[] }): string | null {
  const prefix = "contact-recommendation:";
  if (!value.id.startsWith(prefix) || value.evidenceIds.length === 0) return null;
  const contactId = value.id.slice(prefix.length);
  if (!contactId.trim() || contactId !== contactId.trim() || (value.contactId !== undefined && value.contactId !== contactId)) return null;
  const href = `/contacts/${encodeURIComponent(contactId)}`;
  const review = value.actions.find(action => action.actionId === `contact:review:${contactId}`);
  if (!review) return null;
  if (review.href !== undefined) {
    const match = /^(?:\/app)?\/contacts\/([^/?#]+)$/u.exec(review.href);
    try { if (!match || decodeURIComponent(match[1]!) !== contactId) return null; } catch { return null; }
  }
  return href;
}

const businessMetadata = new Set(["Contact", "联系人", "連絡先", "Organization", "组织", "組織", "Last touch", "最近联系", "最終連絡", "Source", "来源", "出典", "Score", "分数", "匹配分", "スコア"]);
export function contactArtifactToDisplay(value: unknown): AiContactArtifactContract {
  const parsed = contactArtifactSchema.safeParse(value);
  if (!parsed.success) {
    const task = typeof value === "object" && value !== null && "task" in value ? value.task : null;
    const unsupported = typeof task === "object" && task !== null && "kind" in task && typeof task.kind === "string" && task.kind !== "contact_recommendations";
    return { artifactId: "unavailable", taskId: "unavailable", kind: "contact_recommendations", status: unsupported ? "unsupported" : "unavailable", title: "", summary: "", sections: [] };
  }
  const { task, result } = parsed.data;
  const sections = result.status === "ready" ? (result.generatedView?.sections ?? []).map(section => ({
    title: section.title, ...(section.body === undefined ? {} : { body: section.body }),
    items: section.items.map(source => {
      const { actions: _actions, contactId: _contactId, ...item } = source;
      return { ...item, metadata: item.metadata.filter(entry => businessMetadata.has(entry.label)), contactHref: contactArtifactDetailHref(source) };
    })
  })) : [];
  return { artifactId: task.artifactId, taskId: task.taskId, kind: "contact_recommendations", title: result.presentation.title, summary: result.status === "ready" ? result.generatedView?.summary ?? "" : "", status: result.status === "ready" ? result.generatedView === null ? "unavailable" : sections.some(section => section.items.length > 0) ? "ready" : "empty" : result.status, sections };
}

const displayItem = z.object({ id, title: text, subtitle: text.optional(), body: text.optional(), reason: text.optional(), evidenceIds: z.array(id).max(200), metadata: z.array(metadata).max(32), contactHref: text.nullable() }).refine(value => value.contactHref === null || (value.evidenceIds.length > 0 && value.id.startsWith("contact-recommendation:") && value.contactHref === `/contacts/${encodeURIComponent(value.id.slice("contact-recommendation:".length))}`));
export const contactArtifactDisplaySchema = z.object({ artifactId: id, taskId: id, kind: z.literal("contact_recommendations"), status: z.enum(["ready", "empty", "pending", "failed", "unsupported", "unavailable"]), title: text, summary: text, sections: z.array(z.object({ title: text, body: text.optional(), items: z.array(displayItem).max(200) })).max(16) }).refine(value => {
  const items = value.sections.flatMap(section => section.items);
  return items.length <= 200 && new Set(items.map(item => item.id)).size === items.length && (value.status === "ready" ? items.length > 0 : items.length === 0);
}).transform(value => ({ ...value, sections: value.sections.map(section => ({ ...section, items: section.items.map(item => ({ ...item, metadata: item.metadata.filter(entry => businessMetadata.has(entry.label)) })) })) }));
export const aiSessionArtifactTurnSchema = z.object({ sessionId: id, requestId: id, userMessageId: id, assistantMessageId: id, status: z.enum(["ready", "unavailable", "oversized"]), artifacts: z.array(z.unknown()).max(16) });
export const aiSessionArtifactRecoverySchema = z.object({ turns: z.array(aiSessionArtifactTurnSchema).max(100), truncated: z.boolean(), unavailable: z.boolean().optional(), oversized: z.boolean().optional() });
