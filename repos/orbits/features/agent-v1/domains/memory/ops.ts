/**
 * agent-design AG14 (设计稿 §6, 附录 B 个人记忆, 附录 E): the three memory items a conversation card can carry —
 * memory.create, memory.update, memory.delete. Everything a user reads on such an item is written here in the card's
 * language, frozen into the payload and covered by the card hash; no model writes any of it. The entry's words and its
 * values come from the same frozen payload.
 *
 * - create: the new entry — its words, where it is used, which group it is in. Its id is the item's own, so applying
 *   the same confirmed card twice makes one entry.
 * - update: the same entry before and after; written only if the entry is still at the revision the card showed.
 * - delete: the entry's present words and where it is used; after the click the words are dropped and a mark stays.
 */
import type { AgentCardOperationDisplayContract } from "../../../../shared/contract/agent-v1";
import type { AgentMemoryCategory, AgentMemoryStructured, AgentMemoryTask } from "../../../agent/memory/contract";
import type { AgentActionOperationPayload } from "../../../agent/runtime/contract";
import { dayText, type CardLocale } from "../../../agent/runtime/todo-operations";
import { AGENT_MEMORY_COLLECTION } from "../../../agent/memory/service";
import { appliesLabel, kindLabel } from "./words";

export const MEMORY_CREATE = "memory.create";
export const MEMORY_UPDATE = "memory.update";
export const MEMORY_DELETE = "memory.delete";
export const MEMORY_CARD_CAPABILITIES = [MEMORY_CREATE, MEMORY_UPDATE, MEMORY_DELETE] as const;
export type MemoryCardCapability = (typeof MEMORY_CARD_CAPABILITIES)[number];
export const isMemoryCardCapability = (value: unknown): value is MemoryCardCapability => (MEMORY_CARD_CAPABILITIES as readonly unknown[]).includes(value);

export const MEMORY_OPERATION_TYPES: Record<MemoryCardCapability, string> = {
  "memory.create": "create_memory",
  "memory.delete": "delete_memory",
  "memory.update": "update_memory",
};

/** What an entry holds, as a card shows it and an executor writes it. */
export interface MemoryValues {
  category: AgentMemoryCategory;
  content: string;
  appliesTo: AgentMemoryTask[];
  structured: AgentMemoryStructured | null;
  /** AG14 UI (D2): the last day the entry is used (YYYY-MM-DD), only when the user's words carried one. */
  validUntil?: string | null;
}

export type MemoryCardIntent =
  | { capability: typeof MEMORY_CREATE; set: MemoryValues; sourceMessageRef: string | null }
  | { capability: typeof MEMORY_UPDATE; targetId: string; expectedRevision: number; set: Partial<MemoryValues>; shown: MemoryValues }
  | { capability: typeof MEMORY_DELETE; targetId: string; expectedRevision: number; shown: MemoryValues };

/**
 * AG14 UI (approved draft boards 1–3, board 8): the item reads 记忆「推荐活动时优先周末上午」 with 用在 and 归到 under it
 * (到期 only when the user's words carried one, D2); a change reads 记忆 with 原来 and 改成 side by side (D1); a deletion
 * names the entry and says what follows.
 */
type Words = { named: (text: string) => string; record: string; content: string; usedIn: string; kind: string; until: string; create: (text: string, where: string) => string; update: (before: string, after: string, where: string) => string; remove: (text: string, where: string) => string; deleteNote: string };

const WORDS: Record<CardLocale, Words> = {
  en: {
    content: "What", create: (text, where) => `New personal memory: "${text}" (used for: ${where})`, deleteNote: "Once deleted, it is no longer used in new conversations or earlier ones.", kind: "Group", named: (text) => `Memory "${text}"`, record: "Memory",
    remove: (text, where) => `Delete personal memory: "${text}" (used for: ${where})`, until: "Until", update: (before, after, where) => `Change personal memory: "${before}" → "${after}" (used for: ${where})`, usedIn: "Used for",
  },
  ja: {
    content: "内容", create: (text, where) => `個人メモリーを追加：「${text}」（使う場面：${where}）`, deleteNote: "削除すると、新しい会話でもこれまでの会話でも使いません。", kind: "分類", named: (text) => `メモリー「${text}」`, record: "メモリー",
    remove: (text, where) => `個人メモリーを削除：「${text}」（使う場面：${where}）`, until: "期限", update: (before, after, where) => `個人メモリーを変更：「${before}」→「${after}」（使う場面：${where}）`, usedIn: "使う場面",
  },
  zh: {
    content: "内容", create: (text, where) => `新增个人记忆：「${text}」（用在：${where}）`, deleteNote: "删掉以后，新对话和以前的对话都不再用它。", kind: "归到", named: (text) => `记忆「${text}」`, record: "记忆",
    remove: (text, where) => `删除个人记忆：「${text}」（用在：${where}）`, until: "到期", update: (before, after, where) => `修改个人记忆：「${before}」→「${after}」（用在：${where}）`, usedIn: "用在",
  },
};

function base(input: { actionId: string; revision: number; index: number; partId?: string }) {
  return {
    compensation: { supported: false },
    dependsOn: [] as string[],
    effects: [] as string[],
    idempotencyKey: `${input.actionId}:r${input.revision}:op${input.index + 1}`,
    operationId: `${input.actionId}:op${input.index + 1}`,
    partId: input.partId ?? "p1",
    payloadVersion: 1,
    riskLevel: "write" as const,
  };
}

const valuesOf = (values: MemoryValues): MemoryValues => ({ appliesTo: [...values.appliesTo], category: values.category, content: values.content, structured: values.structured ? { ...values.structured } : null, ...(values.validUntil ? { validUntil: values.validUntil } : {}) });

/** The id of the entry a create item makes: the item's own, the same for every revision of the card. */
export function memoryIdOfItem(actionId: string, index: number): string {
  return `memory:${actionId}:op${index + 1}`.slice(0, 180);
}

/** One memory item of a card revision, frozen from its intent. */
export function prepareMemoryOperation(input: { intent: MemoryCardIntent & { partId?: string }; actionId: string; revision: number; index: number; locale: CardLocale }): AgentActionOperationPayload {
  const { intent, locale } = input;
  const w = WORDS[locale];
  const common = { ...base({ ...input, partId: intent.partId }), capability: intent.capability, executorKey: intent.capability, operationType: MEMORY_OPERATION_TYPES[intent.capability] as AgentActionOperationPayload["operationType"] };
  if (intent.capability === MEMORY_CREATE) {
    const after = valuesOf(intent.set);
    const where = appliesLabel(after.appliesTo, locale);
    const display: AgentCardOperationDisplayContract = { change: "create", record: w.named(after.content), rows: [
      { after: where, field: "appliesTo", label: w.usedIn },
      { after: kindLabel(after.category, locale), field: "category", label: w.kind },
      ...(after.validUntil ? [{ after: dayText(after.validUntil, locale), field: "validUntil", label: w.until }] : []),
    ] };
    return { ...common, after: { ...after }, display, payload: { ...after, memoryId: memoryIdOfItem(input.actionId, input.index), sourceMessageRef: intent.sourceMessageRef }, preconditions: { targetExists: false }, preview: w.create(after.content, where), shown: {} };
  }
  const shown = valuesOf(intent.shown);
  const where = appliesLabel(shown.appliesTo, locale);
  const targetRef = { collection: AGENT_MEMORY_COLLECTION, id: intent.targetId };
  if (intent.capability === MEMORY_UPDATE) {
    const set = intent.set;
    const next: MemoryValues = { appliesTo: set.appliesTo ? [...set.appliesTo] : shown.appliesTo, category: set.category ?? shown.category, content: set.content ?? shown.content, structured: set.structured === undefined ? shown.structured : set.structured ? { ...set.structured } : null };
    // Only what changes is on the item (before → after); the executor writes exactly these.
    const after: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    for (const field of ["content", "structured", "appliesTo", "category"] as const) {
      if (set[field] === undefined || JSON.stringify(next[field]) === JSON.stringify(shown[field])) continue;
      after[field] = next[field];
      before[field] = shown[field];
    }
    const nextWhere = appliesLabel(next.appliesTo, locale);
    // D1: the entry's words before and after side by side; 用在 and 归到 join the two columns only when they change.
    const rows: AgentCardOperationDisplayContract["rows"][number][] = [{ after: next.content, before: shown.content, field: "content", label: w.content, sideBySide: true }];
    rows.push("appliesTo" in after ? { after: nextWhere, before: where, field: "appliesTo", label: w.usedIn, sideBySide: true } : { after: where, field: "appliesTo", label: w.usedIn });
    if ("category" in after) rows.push({ after: kindLabel(next.category, locale), before: kindLabel(shown.category, locale), field: "category", label: w.kind, sideBySide: true });
    return { ...common, after, before, display: { change: "update", record: w.record, rows }, payload: { expectedRevision: intent.expectedRevision, memoryId: intent.targetId, patch: { ...after } }, preconditions: { targetExists: true, versionToken: String(intent.expectedRevision) }, preview: w.update(shown.content, next.content, nextWhere), shown: { ...shown }, targetRef };
  }
  const display: AgentCardOperationDisplayContract = { change: "delete", note: w.deleteNote, record: w.named(shown.content), rows: [
    { after: where, field: "appliesTo", label: w.usedIn },
  ] };
  return { ...common, after: { status: "deleted" }, before: { status: "active" }, display, payload: { expectedRevision: intent.expectedRevision, memoryId: intent.targetId }, preconditions: { targetExists: true, versionToken: String(intent.expectedRevision) }, preview: w.remove(shown.content, where), shown: { ...shown }, targetRef };
}

/** The intent a memory item was frozen from (a regenerated card keeps it). */
export function memoryIntentOf(op: AgentActionOperationPayload): MemoryCardIntent | null {
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const shown = (op.shown ?? {}) as Partial<MemoryValues>;
  const values = (from: Partial<MemoryValues>): MemoryValues => ({ appliesTo: [...(from.appliesTo ?? [])], category: (from.category ?? "preference") as AgentMemoryCategory, content: String(from.content ?? ""), structured: from.structured ? { ...from.structured } : null, ...(typeof from.validUntil === "string" ? { validUntil: from.validUntil } : {}) });
  if (op.capability === MEMORY_CREATE) return { capability: MEMORY_CREATE, set: values((op.after ?? {}) as Partial<MemoryValues>), sourceMessageRef: typeof payload.sourceMessageRef === "string" ? payload.sourceMessageRef : null };
  if (!op.targetRef || typeof payload.expectedRevision !== "number") return null;
  if (op.capability === MEMORY_UPDATE) return { capability: MEMORY_UPDATE, expectedRevision: payload.expectedRevision, set: { ...((op.after ?? {}) as Partial<MemoryValues>) }, shown: values(shown), targetId: op.targetRef.id };
  if (op.capability === MEMORY_DELETE) return { capability: MEMORY_DELETE, expectedRevision: payload.expectedRevision, shown: values(shown), targetId: op.targetRef.id };
  return null;
}
