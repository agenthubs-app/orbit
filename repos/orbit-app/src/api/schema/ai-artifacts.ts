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

/**
 * Sprint 0095: which record an item names, and what has to be true before it links.
 *
 * Contacts already had this rule; tasks, notes, schedules and events reach the
 * same detail routes and need the same guard, so the rule became a table rather
 * than five copies. `requiredAction` is per kind because it is not a universal
 * truth: a contact recommendation always carries a review action to bind against,
 * while a data-query item carries no actions at all. Where there is nothing to
 * bind to, the id itself is the only claim, and an action that contradicts it
 * still voids the link.
 */
interface EntityKindRule { readonly prefix: RegExp; readonly path: string; readonly requiredAction?: (recordId: string) => string }
const ENTITY_KIND_RULES: readonly EntityKindRule[] = [
  { prefix: /^contact-recommendation:/u, path: "/contacts/", requiredAction: recordId => `contact:review:${recordId}` },
  { prefix: /^contact:/u, path: "/contacts/" },
  { prefix: /^event(?:-recommendation)?:/u, path: "/events/" },
  { prefix: /^task:/u, path: "/tasks/" },
  { prefix: /^(?:personal|schedule(?:-item)?):/u, path: "/schedule/" },
  { prefix: /^note:/u, path: "/notes/" },
];

/** The record an item id names, with the wrapper prefix removed. */
export function entityArtifactRecordPath(id: string): { path: string; recordId: string; rule: EntityKindRule } | null {
  const rule = ENTITY_KIND_RULES.find(candidate => candidate.prefix.test(id));
  if (!rule) return null;
  const recordId = id.replace(rule.prefix, "");
  if (!recordId.trim() || recordId !== recordId.trim()) return null;
  return { path: rule.path, recordId, rule };
}

// Navigation is not execution. Only an evidenced, identity-matched record is eligible.
export function contactArtifactDetailHref(value: { id: string; evidenceIds: readonly string[]; contactId?: string | undefined; actions: readonly z.infer<typeof action>[] }): string | null {
  const target = entityArtifactRecordPath(value.id);
  if (!target || value.evidenceIds.length === 0) return null;
  const { path, recordId, rule } = target;
  if (value.contactId !== undefined && rule.path === "/contacts/" && value.contactId !== recordId) return null;
  if (rule.requiredAction && !value.actions.some(entry => entry.actionId === rule.requiredAction!(recordId))) return null;
  // Any href the item carries must resolve to this same record. An external or
  // off-record one is a contradiction, not extra detail, and voids the link —
  // the same rule the client applies when it derives a card's href.
  for (const entry of value.actions) {
    if (entry.href === undefined) continue;
    // `/app` is the Web shell's prefix for the same route.
    const match = new RegExp(`^(?:/app)?${path}([^/?#]+)$`, "u").exec(entry.href);
    let decoded: string | null = null;
    try { decoded = match ? decodeURIComponent(match[1]!) : null; } catch { decoded = null; }
    if (decoded !== recordId) return null;
  }
  return `${path}${encodeURIComponent(recordId)}`;
}

/**
 * Sprint 0095: the labels a recovered card is allowed to show.
 *
 * The first group identifies a contact and predates this sprint. The second is
 * what the other four kinds put on their one identifying line — a task without
 * its due date and a schedule without its start time recover as a bare title.
 * Everything outside the list is still dropped: recovery keeps what the card
 * renders, not the producer's whole working set.
 */
const businessMetadata = new Set([
  "Contact", "联系人", "連絡先", "Organization", "组织", "組織", "Last touch", "最近联系", "最終連絡", "Source", "来源", "出典", "Score", "分数", "匹配分", "スコア",
  "dueAt", "category", "startsAt", "endsAt", "updatedAt", "venue", "location", "开始", "时间", "場所", "地点",
  // A schedule entry's own kind, which decides whether its card links to the
  // personal, meeting or event detail route. Without it a restored entry has
  // no reachable detail page.
  "kind",
]);

function projectSuccessfulArtifactDisplay(generatedView: z.infer<typeof view> | null): Pick<AiContactArtifactContract, "summary" | "status" | "sections"> {
  const sections = (generatedView?.sections ?? []).map(section => ({
    title: section.title, ...(section.body === undefined ? {} : { body: section.body }),
    items: section.items.map(source => {
      const { actions: _actions, contactId: _contactId, ...item } = source;
      return { ...item, metadata: item.metadata.filter(entry => businessMetadata.has(entry.label)), contactHref: contactArtifactDetailHref(source) };
    })
  }));
  return {
    summary: generatedView?.summary ?? "",
    status: generatedView === null ? "unavailable" : sections.some(section => section.items.length > 0) ? "ready" : "empty",
    sections,
  };
}

export function contactArtifactToDisplay(value: unknown): AiContactArtifactContract {
  const parsed = contactArtifactSchema.safeParse(value);
  if (!parsed.success) {
    const task = typeof value === "object" && value !== null && "task" in value ? value.task : null;
    const unsupported = typeof task === "object" && task !== null && "kind" in task && typeof task.kind === "string" && task.kind !== "contact_recommendations";
    return { artifactId: "unavailable", taskId: "unavailable", kind: "contact_recommendations", status: unsupported ? "unsupported" : "unavailable", title: "", summary: "", sections: [] };
  }
  const { task, result } = parsed.data;
  const display = result.status === "ready" ? projectSuccessfulArtifactDisplay(result.generatedView) : { summary: "", status: result.status, sections: [] };
  return { artifactId: task.artifactId, taskId: task.taskId, kind: "contact_recommendations", title: result.presentation.title, ...display };
}

/**
 * Sprint 0095: session recovery for every entity kind, not just contacts.
 *
 * A reply about tasks, notes, schedules or events used to come back from history
 * with no cards at all, because recovery dropped any artifact that was not a
 * contact recommendation and then relabelled what survived. The payload shape is
 * the same for all of them, so what differed was only what recovery agreed to keep.
 */
const ENTITY_ARTIFACT_KINDS = ["contact_recommendations", "event_recommendations", "data_query"] as const;
const entityKind = z.enum(ENTITY_ARTIFACT_KINDS);
export const entityArtifactSchema = z.object({
  task: z.object({ artifactId: id, taskId: id, conversationId: id.nullable(), kind: entityKind, status, artifactProducer: id, presentation, query: text, createdAt: text, updatedAt: text }),
  result: z.object({ artifactId: id, taskId: id, kind: entityKind, status, presentation, generatedView: view.nullable(), nextAction: text })
}).refine(value => value.task.artifactId === value.result.artifactId && value.task.taskId === value.result.taskId
  && value.task.status === value.result.status && value.task.kind === value.result.kind);

export function entityArtifactToDisplay(value: unknown): AiContactArtifactContract {
  const parsed = entityArtifactSchema.safeParse(value);
  if (!parsed.success) return { artifactId: "unavailable", taskId: "unavailable", kind: "contact_recommendations", status: "unavailable", title: "", summary: "", sections: [] };
  const { task, result } = parsed.data;
  const display = result.status === "ready" ? projectSuccessfulArtifactDisplay(result.generatedView) : { summary: "", status: result.status, sections: [] };
  return { artifactId: task.artifactId, taskId: task.taskId, kind: task.kind, title: result.presentation.title, ...display };
}

const displayItem = z.object({ id, title: text, subtitle: text.optional(), body: text.optional(), reason: text.optional(), evidenceIds: z.array(id).max(200), metadata: z.array(metadata).max(32), contactHref: text.nullable() }).refine(value => {
  // The stored link must still be the one the id derives, for every kind.
  if (value.contactHref === null) return true;
  const target = entityArtifactRecordPath(value.id);
  return target !== null && value.evidenceIds.length > 0 && value.contactHref === `${target.path}${encodeURIComponent(target.recordId)}`;
});
export const contactArtifactDisplaySchema = z.object({ artifactId: id, taskId: id, kind: z.literal("contact_recommendations"), status: z.enum(["ready", "empty", "pending", "failed", "unsupported", "unavailable"]), title: text, summary: text, sections: z.array(z.object({ title: text, body: text.optional(), items: z.array(displayItem).max(200) })).max(16) }).refine(value => {
  const items = value.sections.flatMap(section => section.items);
  return items.length <= 200 && new Set(items.map(item => item.id)).size === items.length && (value.status === "ready" ? items.length > 0 : items.length === 0);
}).transform(value => ({ ...value, sections: value.sections.map(section => ({ ...section, items: section.items.map(item => ({ ...item, metadata: item.metadata.filter(entry => businessMetadata.has(entry.label)) })) })) }));
export const aiSessionArtifactTurnSchema = z.object({ sessionId: id, requestId: id, userMessageId: id, assistantMessageId: id, status: z.enum(["ready", "unavailable", "oversized"]), artifacts: z.array(z.unknown()).max(16) });
export const aiSessionArtifactRecoverySchema = z.object({ turns: z.array(aiSessionArtifactTurnSchema).max(100), truncated: z.boolean(), unavailable: z.boolean().optional(), oversized: z.boolean().optional() });
