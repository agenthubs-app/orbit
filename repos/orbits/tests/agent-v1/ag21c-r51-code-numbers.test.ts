/**
 * AG21c R51: numbers in the answer text disagreed with the cards and with what code counted ("six days late" next to a
 * card saying 5; a card reason listing a to-do not yet due that the lead does not count). Code's numbers are given to the
 * answer step as fixed values, a stated lateness is replaced by the card's, and a listed person's reason names only the
 * signals the lead counts. Invented records (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { withCodeLateness } from "../../features/agent-v1/answer/list-or-text";
import { materialOf } from "../../features/agent-v1/answer/materials";
import { ACTOR, contact, runFn, todo } from "./functions-kit";

const NOW = "2026-11-15T01:00:00.000Z";

test("the material says how many days late, as code counted it", () => {
  const view = { fields: { dueAt: "2026-11-10T00:00:00.000Z", status: "open", title: "寄回签好的合同" }, id: "t1", kind: "todo" as const, ref: "todo:t1", updatedAt: NOW, version: "1" };
  const due = materialOf(view, "p1", "s1", { names: new Map(), now: NOW, timeZone: "Asia/Tokyo" }).sentences.find((sentence) => sentence.text.startsWith("Due:"))!;
  assert.match(due.text, /overdue by 5 days \(code's count; use this number\)/u);
});

test("lateness in other words is the card's figure (zh, ja, en)", () => {
  const zh = [{ id: "t1", kind: "todo" as const, sub: "已过期5天", subTone: "late" as const, title: "寄回签好的合同" }];
  assert.equal(withCodeLateness("寄回签好的合同已经晚了6天。", zh).text, "寄回签好的合同已经晚了5天。");
  const ja = [{ id: "t1", kind: "todo" as const, sub: "5日超過", subTone: "late" as const, title: "契約書の返送" }];
  assert.equal(withCodeLateness("契約書の返送は期限を6日過ぎています。", ja).text, "契約書の返送は期限を5日過ぎています。");
  const en = [{ id: "t1", kind: "todo" as const, sub: "5 days overdue", subTone: "late" as const, title: "Return the signed contract" }];
  assert.equal(withCodeLateness("Return the signed contract is six days past the deadline.", en).text, "Return the signed contract is 5 days past the deadline.");
});

test("a listed person's reason names only the signals the lead counts", async () => {
  const world = {
    events: [],
    records: [
      contact(ACTOR, "contact:k1", "蔺", { organization: "北岸茶社" }),
      todo(ACTOR, "task:k-late", "给蔺回报价", { dueAt: "2026-11-12T09:00:00.000Z", relatedContactId: "contact:k1", source: "contact" }),
      todo(ACTOR, "task:k-later", "约蔺看新茶", { dueAt: "2026-11-18T09:00:00.000Z", relatedContactId: "contact:k1", source: "manual" }),
    ],
  };
  const message = "这周该跟进谁？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", readFilter: { from: "2026-11-09", to: "2026-11-15" }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { memories: [], world: world as never });
  const why = JSON.stringify(run.result.blocks ?? []).match(/"why":"([^"]*)"/u)?.[1] ?? "";
  assert.match(why, /给蔺回报价/u, why);
  assert.doesNotMatch(why, /约蔺看新茶/u, `the to-do not yet due is not a counted reason: ${why}`);
});
