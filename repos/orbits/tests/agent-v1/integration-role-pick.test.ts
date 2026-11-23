import assert from "node:assert/strict";
import { test } from "node:test";

import { roleGroupClue } from "../../features/agent-v1/understand/role-words";
import { graded } from "./judgment-kit";
import { ACTOR, contact, fnWorld, runFn, type TestMemory } from "./functions-kit";

/**
 * Integration (coordinator, 2026-11-21): a pick among people of a profession — 「帮我挑两位最值得联系的摄影师」 — came back
 * 「我不确定你说的是哪一位联系人」 when the first layer gave 「摄影师」 as a contact clue, and no saved entry for picking contacts
 * was recalled. The profession with a pick is a ranking over the contacts whose own words say it; never a person clue, and
 * never the standard — saved entries for picking contacts apply.
 */

const MET_RECENTLY: TestMemory = { appliesTo: ["contact.recommend"], category: "preference", content: "推荐联系人时优先半年内见过面的", id: "MM8" };
const NO_CONTACT = /我不确定你说的是哪一位联系人|どの連絡先の方のことか|couldn't tell which of your Orbit contacts/u;
const listed = (events: Record<string, unknown>[]) => ((events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[]);
const recalled = (events: Record<string, unknown>[]) => [...new Set(events.filter((event) => event.type === "memory.recall" && event.scope !== "every_task").flatMap((event) => (event.memories ?? []) as string[]))];

function world() {
  const base = fnWorld();
  base.records.push(contact(ACTOR, "contact:c50", "森田光", { organization: "光影工作室", role: "摄影师" }), contact(ACTOR, "contact:c51", "Nora Hill", { organization: "Hill Studio", role: "Photographer" }));
  return base;
}

test("the words: a role, with descriptions, counts or a plural, is a role group; a name is not", () => {
  for (const text of ["摄影师", "两位最值得联系的摄影师", "摄影师们", "カメラマン", "写真家2人", "photographers", "the two photographers"]) assert.equal(roleGroupClue(text), true, text);
  for (const text of ["李薇", "Emily Carter", "小林", "摄影展"]) assert.equal(roleGroupClue(text), false, text);
});

for (const [language, message, clue] of [
  ["zh", "帮我挑两位最值得联系的摄影师。", "摄影师"],
  ["ja", "連絡する価値が一番あるカメラマンを2人選んで。", "カメラマン"],
  ["en", "Pick the two photographers most worth contacting.", "photographers"],
] as const) {
  test(`${language} 「${message}」 with the clue 「${clue}」: the photographers are ranked, the saved entry for picking contacts is used`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [{ entity: "contact", text: clue }], rank: { count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { judge: () => graded(0.05, 0.15, 0.8), language, memories: [MET_RECENTLY], world: world() });
    assert.doesNotMatch(run.result.text, NO_CONTACT, run.result.text);
    assert.ok(run.events.some((event) => event.type === "understand.role_clue"));
    assert.deepEqual([...listed(run.events)].sort(), ["contact:contact:c31", "contact:contact:c50", "contact:contact:c51"].filter((ref) => listed(run.events).includes(ref)).sort(), "only photographers");
    assert.equal(listed(run.events).length, 2, run.result.text);
    assert.ok(listed(run.events).every((ref) => ["contact:contact:c31", "contact:contact:c50", "contact:contact:c51"].includes(ref)), listed(run.events).join(", "));
    assert.deepEqual(recalled(run.events), ["MM8"], "the saved entry for picking contacts");
  });
}

test("without a clue from the first layer the same: the role is the set, not the standard", async () => {
  const message = "帮我挑两位最值得联系的摄影师。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "最值得联系的摄影师", count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { judge: () => graded(0.05, 0.15, 0.8), memories: [MET_RECENTLY], world: world() });
  assert.ok(listed(run.events).every((ref) => ["contact:contact:c31", "contact:contact:c50", "contact:contact:c51"].includes(ref)), listed(run.events).join(", "));
  assert.deepEqual(recalled(run.events), ["MM8"]);
});
