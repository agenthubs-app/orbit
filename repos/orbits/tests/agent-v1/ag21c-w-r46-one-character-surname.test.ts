/**
 * AG21c R46 (W): a person named by a one-character surname ("关老师", "林さん") was not matched to the note's own linked
 * contact, so their real contact was dropped as "not linked", a note with two occasions looked like one and no question was
 * asked. A surname of any length now names the linked contact whose name starts with it when exactly one does; and the
 * answer lists each person once, in the group that decided their row. Names and sentences are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { contactOfClue } from "../../features/agent-v1/functions/extract";
import { fnWorld, runFn } from "./functions-kit";
import { noul } from "./judgment-kit";
import { contact, memo } from "./read-kit";

test("R46 a one-character surname names the one linked contact whose name starts with it (zh, ja); never one of two", () => {
  const linked = [{ id: "contact:gy", name: "关雨" }, { id: "contact:xn", name: "许诺" }];
  assert.equal(contactOfClue("关老师", linked)?.id, "contact:gy");
  assert.equal(contactOfClue("关总", linked)?.id, "contact:gy");
  assert.equal(contactOfClue("林さん", [{ id: "contact:lm", name: "林美咲" }, { id: "contact:ok", name: "大川健" }])?.id, "contact:lm");
  assert.equal(contactOfClue("林さん", [{ id: "contact:lm", name: "林美咲" }, { id: "contact:ld", name: "林大辅" }]), null, "two start with it: no guess");
  assert.equal(contactOfClue("Ms. Ito", [{ id: "contact:ik", name: "Ito Kana" }])?.id, "contact:ik");
  assert.equal(contactOfClue("周老师", linked), null);
});

const NOTE = { id: "note:wk", name: "周三笔记", type: "memo" };
function world(body: string) {
  const base = fnWorld();
  base.records.push(
    contact("actor:a", "contact:gy", "关雨", { organization: "松烟纸坊" }),
    contact("actor:a", "contact:xn", "许诺", { organization: "青石出版" }),
    memo("actor:a", "note:wk", body, "2026-11-12T03:00:00.000Z", ["contact:gy", "contact:xn"], { title: "周三笔记" }),
  );
  return base;
}
const UPDATE = (message: string) => [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@周三笔记" }], requiredCapabilities: ["memo.read", "fn.extractInteractions", "memo.update"], sourceQuote: message }];

test("R46 '周三和许诺见面；晚上给关老师打了电话': both are counted, so the note's two occasions are a question, not one silent card", async () => {
  const message = "用 @周三笔记 更新往来";
  const run = await runFn(message, UPDATE(message), {
    extract: { interactions: [
      { channel: "meeting", contactClue: "许诺", dateText: "11月11日", direction: "mutual", kind: "happened", precision: "day", sentenceIds: [1] },
      { channel: "phone", contactClue: "关老师", dateText: "11月11日", direction: "outgoing", kind: "happened", precision: "day", sentenceIds: [2] },
    ] },
    judge: () => noul(0.95), references: [NOTE], world: world("11月11日和许诺见面。11月11日晚上给关老师打了电话。"),
  });
  assert.equal(run.frozen.length, 0, run.result.text);
  const question = run.result.clarifications.find((set) => set.kind === "question");
  assert.equal(question?.options.length, 2, run.result.text);
  assert.doesNotMatch(run.result.text, /不在这篇笔记关联的联系人里/u);
});

test("R46 a person counted on the card is not listed again under 'not an interaction'", async () => {
  const message = "用 @周三笔记 更新往来";
  const run = await runFn(message, UPDATE(message), {
    extract: { interactions: [
      { channel: "meeting", contactClue: "许诺", dateText: "11月11日", direction: "mutual", kind: "happened", precision: "day", sentenceIds: [1] },
      { channel: "phone", contactClue: "许诺", direction: "mutual", kind: "between_others", precision: "unknown", sentenceIds: [2] },
    ] },
    judge: () => noul(0.95), references: [NOTE], world: world("11月11日和许诺见面。听同事说许诺后来和关雨通过电话。"),
  });
  assert.equal(run.frozen.length, 1, run.result.text);
  assert.doesNotMatch(run.result.text, /许诺：是别人之间的事/u, run.result.text);
});
