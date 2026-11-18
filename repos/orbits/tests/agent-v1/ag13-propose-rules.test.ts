import assert from "node:assert/strict";
import test from "node:test";

import { proposableOf } from "../../features/agent-v1/graph/nodes/propose";
import { fitsWithoutKana } from "../../features/agent-v1/propose/resolve";
import { CHECKIN, isEventIntent, withoutWhenWords } from "../../features/agent-v1/propose/events-resolve";
import { replyLanguageOf } from "../../features/agent-v1/route/handoff-copy";
import { ACTOR, contactWorld, json, runContact } from "./contact-kit";
import { memo, todo } from "./read-kit";

/**
 * agent-design AG13: the code rules the event, schedule and to-do-link writes rest on (dev runs 1–3 of the AG13 gate):
 * - a write tagged «我去过» that records a call stays a memo (AE-XL-011); a to-do word and no time stays a to-do (AE-CTX-005);
 * - a schedule item named with words of when is looked up without them ("明天的选品周会");
 * - Japanese words that leave out a title's kana fit it (AE-SCL-010);
 * - a name quoted in another language does not decide the reply language (AE-SCL-026);
 * - a contact clue inside a quoted to-do title is not a person; one in plain words is (AE-EVT-010, AE-XL-005);
 * - a check-in asked for is the organizer's record (AE-EVT-004).
 */

test("which operations a sentence may become", () => {
  const part = (capabilities: string[]) => ({ capabilities, refs: [] }) as never;
  assert.ok(!proposableOf(part(["attendance.create"]), "Log that Emily called me today.").includes("attendance.create"), "a call recorded is a memo");
  assert.ok(proposableOf(part(["attendance.create"]), "Log that Emily called me today.").includes("memo.create"));
  assert.ok(proposableOf(part(["attendance.create"]), "昨晚的 SaaS 定价研讨会我去了，帮我记上我参加过。").includes("attendance.create"));
  assert.deepEqual(proposableOf(part(["schedule.create"]), "山本さんとの食事のToDo、11月20日に予定を入れて").sort(), ["todo.create", "todo.update"]);
  assert.ok(proposableOf(part(["privateEvent.create"]), "帮我建成一场私人活动，并记上我参加了").includes("attendance.create"), "the event writes go together");
});

test("words of when are not part of a name; kana left out still fits a Japanese title", () => {
  assert.equal(withoutWhenWords("明天的选品周会"), "选品周会");
  assert.equal(withoutWhenWords("11 月 19 日那场半導体キャリアフォーラム"), "半導体キャリアフォーラム");
  assert.equal(fitsWithoutKana("益子陶器市搬入手配", "益子陶器市の搬入を手配する"), true);
  assert.equal(fitsWithoutKana("益子陶器市搬入手配", "益子陶器市の搬入を手配する（什器）"), true);
  assert.equal(fitsWithoutKana("益子陶器市搬入", "益子陶器市の出店料を払う"), false);
});

test("a name quoted in Japanese does not make a Chinese message Japanese; Japanese prose stays Japanese", () => {
  assert.equal(replyLanguageOf("给「准备曜石终面的候选人材料」这条待办再关联上张蔚然，另外把 11 月 19 日那场「半導体キャリアフォーラム」也关联上。", "ja").language, "zh");
  assert.equal(replyLanguageOf("毎週月曜の定例「团队周会」を、これからはずっと11時から12時に変更して。", "ja").language, "ja");
});

test("a to-do update that links people or events is an event-family intent; a date change is not", () => {
  const base = { localId: "w1", relations: [], selector: [] };
  assert.equal(isEventIntent({ ...base, capability: "todo.update", events: [[0, 2]] }, "把独立出版市集也关联上"), true);
  assert.equal(isEventIntent({ ...base, capability: "todo.update" }, "给小林发修订报价这条待办，再关联上陈一鸣"), true);
  assert.equal(isEventIntent({ ...base, capability: "todo.update", date: [0, 2] }, "把报价待办改到周五"), false);
  assert.ok(CHECKIN.test("我忘了扫码签到，你帮我把签到补上"));
  assert.ok(!CHECKIN.test("帮我记上我参加过"));
});

test("graph: a contact clue inside a quoted to-do title is read as the title; in plain words it is the person", async () => {
  const world = contactWorld((records) => {
    records.push(todo(ACTOR, "task:t48", "联系老周聊独立出版", { relatedContactIds: ["contact:c31"] } as never));
    records.push(memo(ACTOR, "note:m31", "和小林聊了报价初稿。", "2026-11-12T09:30:00.000Z", ["contact:c17"]));
  });
  const quoted = "「联系老周聊独立出版」这条待办现在关联了哪些人？";
  const run = await runContact(quoted, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "todo", text: "「联系老周聊独立出版」这条待办" }, { entity: "contact", text: "老周" }], requiredCapabilities: ["todo.read", "contact.read"], sourceQuote: quoted }], [], { answer: () => json({ segments: [] }), world });
  assert.ok(run.events.some((event) => event.type === "understand.name_inside_title"));
  assert.doesNotMatch(run.result.text, /哪一位联系人/u, run.result.text);
  const plain = "查上次和小林聊了什么";
  const second = await runContact(plain, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }, { entity: "memo", text: "上次和小林聊了什么" }], requiredCapabilities: ["memo.read", "contact.read"], sourceQuote: plain }], [], { answer: () => json({ segments: [] }), world });
  assert.ok(!second.events.some((event) => event.type === "understand.name_inside_title"), "小林 stays a person");
});
