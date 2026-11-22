/**
 * 重复判断 (设计稿 §3.8 用途表, §3.2; agent-design AG08-3): before a new memo that records an interaction is
 * put on a card, code looks for memos that may already be the same occasion — the same contact, the same
 * day, the same way of contact (either way unknown counts as the same) — and only those go to the judgment
 * model (`duplicate.same`). Never merged automatically:
 *
 *   - "different", sure enough   → the card goes ahead;
 *   - "same", sure enough        → no card: the existing memo is pointed at, with a "仍然新增" entry;
 *   - "unsure", below threshold,
 *     unavailable, not enabled   → the user is asked, with "不是同一次，仍然新增" among the choices.
 */
import type { AgentRecordAccess } from "../graph/deps";
import type { DomainScope, RecordView } from "../domains/types";
import { localDay } from "../views/recent-interaction";
import { emitTrace } from "../observability/trace";
import { askJudgment, type JudgmentAccess, type JudgmentBudget } from "./ask";
import type { JudgmentLanguage } from "./questions";

export interface NewInteraction {
  body: string;
  contactIds: readonly string[];
  interaction?: { actualContactIds: readonly string[]; channel: string; occurredOn: string };
}

const sameChannel = (left: string | undefined, right: string | undefined) => !left || !right || left === "other" || right === "other" || left === right;

/** Memos of the same contact on the same day with the same way of contact (code's filter, no model). */
export async function possibleDuplicates(records: AgentRecordAccess, scope: DomainScope, entry: NewInteraction, timeZone: string): Promise<RecordView[]> {
  const interaction = entry.interaction;
  if (!interaction) return [];
  const found = new Map<string, RecordView>();
  for (const contactId of interaction.actualContactIds) {
    for (const status of ["interaction", undefined] as const) {
      const page = await records.reader.read("memo", scope, { contactId, limit: 10, order: "newest", ...(status ? { status } : {}) });
      for (const view of page.items) {
        const fields = view.fields as { interaction?: { occurredOn?: string; channel?: string; actualContactIds?: string[] }; createdAt?: string; contactIds?: string[] };
        const day = fields.interaction?.occurredOn ?? (fields.createdAt ? localDay(fields.createdAt, timeZone) : null);
        if (day !== interaction.occurredOn) continue;
        if (fields.interaction && !sameChannel(fields.interaction.channel, interaction.channel)) continue;
        found.set(view.ref, view);
      }
    }
  }
  return [...found.values()].slice(0, 3);
}

export type DuplicateDecision =
  | { kind: "new" }
  | { kind: "same"; existing: RecordView }
  | { kind: "ask"; existing: RecordView[] };

/** The text duplicate.same is judged on (calibration uses the same). */
export function duplicateJudgmentInput(language: JudgmentLanguage, entry: { body: string; day: string; channel: string }, existing: readonly { key: string; body: string; day: string; channel: string }[]): string[] {
  const labels = language === "zh" ? { existing: "已有记录", fresh: "新记的这一条" } : language === "ja" ? { existing: "既存の記録", fresh: "新しく記録するもの" } : { existing: "Existing record", fresh: "The new entry" };
  return [[`${labels.fresh} (${entry.day}, ${entry.channel}): ${entry.body}`, ...existing.map((item) => `${labels.existing} ${item.key} (${item.day}, ${item.channel}): ${item.body.slice(0, 400)}`)].join("\n")];
}

export async function judgeDuplicate(access: JudgmentAccess | null | undefined, budget: JudgmentBudget, input: { language: JudgmentLanguage; entry: NewInteraction; existing: readonly RecordView[]; requestId?: string }): Promise<DuplicateDecision> {
  if (!input.existing.length) return { kind: "new" };
  const keys = input.existing.map((_view, index) => `d${index + 1}`);
  const input_ = duplicateJudgmentInput(input.language, { body: input.entry.body, channel: input.entry.interaction?.channel ?? "other", day: input.entry.interaction?.occurredOn ?? "" }, input.existing.map((view, index) => {
    const fields = view.fields as { body?: string; interaction?: { occurredOn?: string; channel?: string }; createdAt?: string };
    return { body: String(fields.body ?? ""), channel: fields.interaction?.channel ?? "other", day: fields.interaction?.occurredOn ?? fields.createdAt ?? "", key: keys[index] };
  }));
  const outcome = await askJudgment(access, budget, {
    input: input_,
    items: keys.map((key) => ({ key, question: "duplicate.same" as const, subject: key })),
    language: input.language,
    purpose: "duplicate",
    ...(input.requestId ? { requestId: input.requestId } : {}),
  });
  const verdicts = keys.map((key) => outcome.verdicts.get(key));
  const same = verdicts.findIndex((verdict) => verdict?.answer === "same" && !verdict.fallback);
  const decision: DuplicateDecision = same >= 0
    ? { existing: input.existing[same], kind: "same" }
    : verdicts.every((verdict) => verdict?.answer === "different" && !verdict.fallback) ? { kind: "new" } : { existing: [...input.existing], kind: "ask" };
  emitTrace({ decision: decision.kind, existing: input.existing.map((view) => view.ref), type: "judgment.duplicate" });
  return decision;
}
