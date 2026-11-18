import assert from "node:assert/strict";
import test from "node:test";

import { withoutOnlineDenials } from "../../features/agent-v1/answer/claims";
import { withoutUnsourcedCounts } from "../../features/agent-v1/answer/counts";
import { profileLine } from "../../features/agent-v1/answer/profile-check";
import { subjectInsideRecord } from "../../features/agent-v1/understand/described-clue";
import { ACTOR, contactWorld, json, runContact } from "./contact-kit";
import { memo } from "./read-kit";
import { runFn } from "./functions-kit";

/**
 * agent-design AG12 run-03 (coordinator review of run-02), all in code:
 * 1. AE-WEB-004: an unnamed demonstrative or pronoun clue ("那家公司", "その会社", "that company", "he") beside a clue that
 *    names a record is the subject inside that record, not a contact to look up.
 * 2. AE-WEB-004: a denial clause at the start of a sentence goes with its dangling lead-in; the sourced content stays.
 * 3. AE-FN-008: an unsourced count that introduces a list ("有三件事：") is neutralized, not the whole sentence; no strip rule
 *    leaves a cited answer with nothing sourced.
 * 4. AE-SCL-004 R2: an outdated organization is said with the title the profile holds there ("拾野选物店店长").
 * 5. AE-FN-003 R4: a ranking with its basis line has the clickable entries to rank by something else beside the answer.
 */

test("1 the unnamed clue next to a named record is the subject inside the record (zh, ja, en); alone, or with no record named, it stays", () => {
  const named = { entity: "memo", text: "竞品笔记 C" };
  assert.equal(subjectInsideRecord({ entity: "contact", text: "那家公司" }, [named]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "这个人" }, [named]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "那位" }, [named]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "その会社" }, [{ entity: "memo", text: "競合メモC" }]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "あの人" }, [{ entity: "memo", text: "競合メモC" }]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "that company" }, [{ entity: "memo", text: "competitor note C" }]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "he" }, [{ entity: "memo", text: "the Nov 10 note" }]), true);
  assert.equal(subjectInsideRecord({ entity: "contact", text: "那家公司" }, []), false, "no record named: AG04 rules as before");
  assert.equal(subjectInsideRecord({ entity: "contact", text: "那家公司" }, [{ entity: "memo", text: "这篇笔记" }]), false, "the record clue names nothing either");
  assert.equal(subjectInsideRecord({ entity: "contact", text: "小林" }, [named]), false, "a name is looked up");
});

test("1 graph: 'my competitor note C, that company's price' reads the note; no contact question", async () => {
  const world = contactWorld((records) => records.push(memo(ACTOR, "note:mc", "C 公司（Cirrus Works）不公开报价，朋友说去年签的是每席 900 日元。", "2026-11-01T01:00:00.000Z", [], { title: "竞品笔记 C" })));
  const message = "我竞品笔记 C 里那家公司的报价是多少？";
  const run = await runContact(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", text: "竞品笔记 C" }, { entity: "contact", text: "那家公司" }], requiredCapabilities: ["memo.read"], sourceQuote: message }], [], {
    answer: (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo "竞品笔记 C"/u.exec(call.user)?.[1] ?? "s1" }], partId: "p1", text: "笔记里写的是：C 公司不公开报价，朋友说去年签的是每席 900 日元。" }] }),
    world,
  });
  assert.doesNotMatch(run.result.text, /哪一位联系人/u, run.result.text);
  assert.match(run.result.text, /900 日元/u);
  assert.ok(run.events.some((event) => event.type === "understand.subject_in_record"));
});

test("2 a denial at the start: the dangling lead-in goes with it, the sourced content after it stays (zh, ja, en)", () => {
  const zh = withoutOnlineDenials("我没法上网查官网，只能据笔记 C 说明：它指的是 C 公司（Cirrus Works），笔记里写着这家公司不公开报价，朋友说去年签的是每席 900 日元。所以官网上应该查不到公开报价。");
  assert.equal(zh.text, "它指的是 C 公司（Cirrus Works），笔记里写着这家公司不公开报价，朋友说去年签的是每席 900 日元。官网上应该查不到公开报价。");
  const ja = withoutOnlineDenials("インターネットにアクセスできないため、メモによると、C社は価格を公開しておらず、昨年は1席900円でした。");
  assert.equal(ja.text, "C社は価格を公開しておらず、昨年は1席900円でした。");
  const en = withoutOnlineDenials("I can't browse the web, but going by note C, Cirrus Works does not publish prices and a friend paid JPY 900 per seat.");
  assert.equal(en.text, "Cirrus Works does not publish prices and a friend paid JPY 900 per seat.");
});

test("3 a count that introduces a list is neutralized; a bare unsourced count still goes", () => {
  assert.equal(withoutUnsourcedCounts("11月10日这篇笔记有三件事：小林给你打来电话，说小陈在审核；你答应11月13日给小林发报价。", [3]), "11月10日这篇笔记写了：小林给你打来电话，说小陈在审核；你答应11月13日给小林发报价。");
  assert.equal(withoutUnsourcedCounts("このメモには3件あります：小林さんからの電話、見積の約束。", [3]), "このメモには次のことが書かれています：小林さんからの電話、見積の約束。");
  assert.equal(withoutUnsourcedCounts("There are three items in this note: Kobayashi called, and you promised a quote.", [3]), "This note says: Kobayashi called, and you promised a quote.");
  assert.equal(withoutUnsourcedCounts("你有 3 条待办。其他没有。", [3]), "其他没有。");
});

test("3 no strip rule leaves a cited answer with nothing sourced: the cited sentences are given instead", async () => {
  const message = "@11 月 10 日笔记 帮我整理一下。";
  for (const text of ["这篇笔记有三件事。", "我没法上网查。", "确认卡上点确认就行。"]) {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: message }], {
      answer: (call) => json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text }] }),
      references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
    });
    assert.match(run.result.text, /小林给我打电话/u, `${text} → ${run.result.text}`);
  }
});

test("4 an outdated organization is said with the title the profile holds there (zh, ja, en)", () => {
  const contact = { at: null, handle: "s1", header: "contact profile", kind: "contact", partId: "p1", profile: { organization: "拾野选物店", role: "店长", updatedAt: "2026-09-01T00:00:00.000Z" }, ref: "contact:contact:c9", sentences: [], version: "1" } as never;
  const source = { at: "2026-11-05T01:00:00.000Z", handle: "s2", header: "memo", kind: "memo", partId: "p1", ref: "memo:note:n9", sentences: [], version: "1" } as never;
  const updates = [{ contact, field: "organization", newValue: "山风商店", profileValue: "拾野选物店", source }] as never;
  assert.match(profileLine("zh", updates, "Asia/Tokyo")!, /联系人资料里写的还是「拾野选物店店长」/u);
  assert.match(profileLine("ja", updates, "Asia/Tokyo")!, /「拾野选物店の店长」/u);
  assert.match(profileLine("en", updates, "Asia/Tokyo")!, /"店长 at 拾野选物店"/u);
  // A role flagged on its own: as before.
  const roleOnly = [{ contact, field: "role", newValue: "顾问", profileValue: "店长", source }] as never;
  assert.match(profileLine("zh", roleOnly, "Asia/Tokyo")!, /写的还是「店长」/u);
});

test("5 AE-FN-003 R4: the ranking with its basis line has the entries to rank another way beside the answer (no question)", async () => {
  const message = "这周该跟进谁？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "这周该跟进" }, readFilter: { from: "2026-11-15", to: "2026-11-21" }, requiredCapabilities: ["contact.read", "view.recentInteraction", "fn.rank"], sourceQuote: message }]);
  assert.match(run.result.text, /想换个依据重新排/u);
  const entries = run.result.clarifications.filter((set) => set.kind === "entry");
  assert.equal(entries.length, 1);
  assert.ok(entries[0].options.length >= 1 && entries[0].options.every((option) => option.capability === "fn.rank"));
  // run-03 repair 2: the ordering already applied (overdue follow-ups, from the history signals) is not offered again.
  assert.ok(entries[0].options.every((option) => (option as { ref?: { id: string } }).ref?.id !== "overdue"), JSON.stringify(entries[0].options));
  assert.equal(run.result.clarifications.filter((set) => set.kind === "question").length, 0);
  assert.equal(run.result.status, "completed");
});

test("5 a click on such an entry ranks again by it (no question, no write)", async () => {
  const message = "这周该跟进谁？";
  const run = await runContact(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "这周该跟进" }, readFilter: { from: "2026-11-15", to: "2026-11-21" }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], []);
  const entry = run.result.clarifications.find((set) => set.kind === "entry");
  assert.ok(entry, run.result.text);
  const other = entry!.options.find((option) => option.label.includes("最久没联系"))!;
  const again = await run.resume(other.optionId);
  assert.match(again.text, /最近一次往来|最久没联系|往来/u, again.text);
  assert.ok(!again.actionPreview);
});
