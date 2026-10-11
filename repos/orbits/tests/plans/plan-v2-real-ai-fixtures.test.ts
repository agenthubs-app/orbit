/**
 * 真实 AI 跑通（2026-10-11）的回归 fixture：本机真实 deepseek-v4-flash 被校验器拒绝的原文（`tests/fixtures/plan-v2-real-ai/`）。
 * 断言：按旧流程（不解包、不规整）确实不合格；按现在的「宽进严出」（解包回显、不许改字段还原、配点规整、文字退回原文）后，
 * 同一套校验器判定合格，而且结果满足不许改 / 已得分 / 跳过 / 合计 100 的规则。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkReviewFix } from "../../features/plans/v2/ai/schemas";
import type { DraftOutput, ReviewFixInput } from "../../features/plans/v2/ai/types";
import { disallowedChangeIssues } from "../../features/plans/v2/validate-content";

interface Case {
  id: string;
  input: Pick<ReviewFixInput, "current" | "earned" | "skippedSlots" | "slots" | "landscape" | "contacts" | "goalKind">;
  outputs: Array<{ attempt: number; issues: string[]; content: Record<string, unknown> }>;
}

const fixture = JSON.parse(readFileSync(new URL("../fixtures/plan-v2-real-ai/c9-run1-rejected.json", import.meta.url), "utf8")) as { cases: Case[] };

for (const item of fixture.cases) {
  test(`real C9 ${item.id}: every rejected answer now passes the same checks after lenient parsing and normalisation`, () => {
    const { input } = item;
    const checkInput = { aliases: new Set(input.contacts.map((contact) => contact.alias)), enforceTemplate: false, goalKind: input.goalKind, landscape: input.landscape, slots: input.slots };
    for (const output of item.outputs) {
      assert.ok(output.issues.length > 0, "it was rejected for real");
      const result = checkReviewFix(output.content, checkInput, input.current as DraftOutput, { earned: input.earned, skippedSlots: input.skippedSlots });
      assert.equal(result.ok, true, `${output.attempt}: ${(result as { issues?: string[] }).issues?.join(" | ")}`);
      const revised = (result as { value: { revised: DraftOutput } }).value.revised;
      assert.deepEqual(disallowedChangeIssues(input.current as DraftOutput, revised), [], "frozen fields stay as they were");
      assert.equal(revised.personTypes.reduce((sum, type) => sum + type.allocation, revised.event.allocation), 100);
      for (const type of revised.personTypes) assert.ok(type.allocation >= (input.earned[type.slot] ?? 0), "never below earned");
      const before = new Map((input.current as DraftOutput).personTypes.map((type) => [type.slot, type.allocation]));
      for (const slot of input.skippedSlots) assert.equal(revised.personTypes.find((type) => type.slot === slot)?.allocation, before.get(slot));
    }
  });
}
