import assert from "node:assert/strict";
import test from "node:test";

import { profileLine, verifyProfileUpdates } from "../../features/agent-v1/answer/profile-check";
import type { Material } from "../../features/agent-v1/answer/schema";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { contact, memo, smallWorld } from "./read-kit";

/**
 * agent-design AG05 run-03 repair round 1 (coordinator, after judging d35b14641):
 * 1. AE-SCL-004 R2: when a contact profile and a newer dated record disagree on a profile field, the answer
 *    says the profile is out of date every time — the model fills a structured `profile` entry, code checks
 *    it against the materials and writes the sentence (zh/ja/en).
 * 2. AE-CTX-007: a part with a person bound (or found) never says the person was not found, also when a
 *    further contact clue (a company name) matches nobody.
 * 3. AE-UND-010: "waits on" names the prerequisite that is not done, from dependsOn.
 */

const ACTOR = "actor:a";

const contactMaterial: Material = {
  handle: "s1", header: "contact profile, last updated 2026-10-01 (Thu)", kind: "contact", partId: "p1",
  profile: { organization: "拾野选物店", role: "店长", updatedAt: "2026-10-01T00:00:00.000Z" },
  ref: "contact:contact:c50", sentences: [{ id: 1, text: "Name: 吴晓彤" }, { id: 2, text: "Organization: 拾野选物店" }, { id: 3, text: "Role: 店长" }], version: "1",
};
const newer: Material = {
  at: "2026-11-06T03:00:00.000Z", handle: "s2", header: "memo, written 2026-11-06 (Fri) 12:00", kind: "memo", partId: "p1",
  ref: "memo:note:m50", sentences: [{ id: 1, text: "吴晓彤从拾野选物店离职，自己开了彤云茶室。" }, { id: 2, text: "11月22日试营业。" }], version: "1",
};
const older: Material = { ...newer, at: "2026-09-01T03:00:00.000Z", handle: "s3", ref: "memo:note:m49", sentences: [{ id: 1, text: "她在彤云茶室帮忙。" }] };

test("profile entries are checked against the materials: profile value, newer record, value copied from it", () => {
  const materials = [contactMaterial, newer, older];
  const good = verifyProfileUpdates([{ contact: "s1", field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source: "s2" }, { contact: "s1", field: "role", newValue: "自己开了彤云茶室", profileValue: "店长", source: "s2" }], materials);
  assert.equal(good.problems.length, 0);
  assert.deepEqual(good.updates.map((item) => [item.field, item.profileValue, item.source.ref]), [["organization", "拾野选物店", "memo:note:m50"], ["role", "店长", "memo:note:m50"]]);

  const bad = verifyProfileUpdates([
    { contact: "s1", field: "organization", newValue: "彤云茶室", profileValue: "北辰软件", source: "s2" },
    { contact: "s1", field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source: "s3" },
    { contact: "s1", field: "organization", newValue: "青木科技", profileValue: "拾野选物店", source: "s2" },
    { contact: "s2", field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source: "s2" },
    { contact: "s1", field: "email", newValue: "彤云茶室", profileValue: "拾野选物店", source: "s2" },
  ], materials);
  assert.equal(bad.updates.length, 0, "a wrong profile value, an older source, words not in the source, a non-profile handle, an unknown field are all dropped");
  assert.equal(bad.problems.length, 5);
});

test("the profile sentence is code's, in zh / ja / en", () => {
  const { updates } = verifyProfileUpdates([{ contact: "s1", field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source: "s2" }, { contact: "s1", field: "role", newValue: "彤云茶室", profileValue: "店长", source: "s2" }], [contactMaterial, newer]);
  assert.equal(profileLine("zh", updates, "Asia/Tokyo"), "（联系人资料里写的还是「拾野选物店店长」，和11月6日的记录不一致，这份资料已经过时了。）");
  assert.equal(profileLine("ja", updates, "Asia/Tokyo"), "（連絡先にはまだ「拾野选物店の店长」とあり、11月6日の記録と食い違っています。連絡先の情報が古くなっています。）");
  assert.equal(profileLine("en", updates, "Asia/Tokyo"), '(The contact profile still says "店长 at 拾野选物店", which differs from the record of Nov 6; the profile is out of date.)');
  assert.equal(profileLine("zh", [], "Asia/Tokyo"), null);
});

function shopWorld() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(
    contact(ACTOR, "contact:c50", "吴晓彤", { organization: "拾野选物店", role: "店长", updatedAt: "2026-10-01T00:00:00.000Z" }),
    memo(ACTOR, "note:m50", "吴晓彤从拾野选物店离职，自己开了彤云茶室。11月22日试营业。", "2026-11-06T03:00:00.000Z", ["contact:c50"]),
  );
  return base;
}

const shopPart = part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "吴晓彤" }], readFilter: { current: true }, requiredCapabilities: ["contact.read", "view.context"], sourceQuote: "吴晓彤现在在哪家店、做什么" });

test("AE-SCL-004 shape: the answer text leaves the profile out; code still says the profile is out of date", async () => {
  let asked = "";
  const model = deepseekStub([
    json({ parts: [shopPart], plainChat: false }),
    (call) => {
      asked = call.user;
      const contactHandle = /(s\d+) — contact profile/u.exec(call.user)![1];
      const memoHandle = /(s\d+) — memo/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: memoHandle }], partId: "p1", profile: [{ contact: contactHandle, field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source: memoHandle }, { contact: contactHandle, field: "role", newValue: "自己开了彤云茶室", profileValue: "店长", source: memoHandle }], text: "她已经离职，自己开了彤云茶室，11月22日试营业。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(shopWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input("吴晓彤现在在哪家店、做什么？"));
  assert.match(asked, /Profile check/u, "the answer step is asked the structured question");
  assert.match(result.text, /彤云茶室/u);
  assert.match(result.text, /联系人资料里写的还是「拾野选物店店长」，和11月6日的记录不一致，这份资料已经过时了。/u);
  assert.deepEqual(result.sourceRefs, ["memo:note:m50"]);
  // AG20a (decision 2): the next turn's 「那把她的资料也更新了」 has these fields and values to go on.
  const state = await kit.sessionState.get("actor:a", "session:a");
  assert.deepEqual(state?.staleProfiles?.map((item) => [item.field, item.value, item.sourceId]), [["organization", "彤云茶室", "note:m50"], ["role", "自己开了彤云茶室", "note:m50"]]);
});

test("the profile entry is required for such a part: left out, the one repair asks for it", async () => {
  const model = deepseekStub([
    json({ parts: [shopPart], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "她自己开了彤云茶室。" }] }),
    (call) => {
      assert.match(call.user, /p1: give "profile"/u);
      const contactHandle = /(s\d+) — contact profile/u.exec(call.user)![1];
      const memoHandle = /(s\d+) — memo/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: memoHandle }], partId: "p1", profile: [{ contact: contactHandle, field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source: memoHandle }], text: "她自己开了彤云茶室。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(shopWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input("吴晓彤现在在哪家店、做什么？"));
  assert.equal(model.calls.length, 3);
  assert.match(result.text, /联系人资料里写的还是「拾野选物店店长」/u, "AG12 run-03 (AE-SCL-004 R2): with the title held there");
});

test("'profile': [] (the profile still holds) adds nothing", async () => {
  const model = deepseekStub([
    json({ parts: [shopPart], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", profile: [], text: "她自己开了彤云茶室。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(shopWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input("吴晓彤现在在哪家店、做什么？"));
  assert.equal(model.calls.length, 2);
  assert.doesNotMatch(result.text, /联系人资料/u);
});

test("AE-CTX-007 shape: @ binds the person; a company clue that matches no contact never makes it 'not found'", async () => {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(contact(ACTOR, "contact:c41", "山本直子", { organization: "山手出版", role: "編集者" }));
  const message = "@山本直子 さんって、山手出版の編集の方だったよね？";
  const model = deepseekStub([
    (call) => json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", referenceId: /(r\d) contact 山本直子/u.exec(call.user)![1], text: "@山本直子" }, { entity: "contact", text: "山手出版" }], readFilter: { text: "山手出版" }, requiredCapabilities: ["contact.read", "profile.read"], sourceQuote: message })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [2, 3], sourceRef: /(s\d+) — contact profile/u.exec(call.user)![1] }], partId: "p1", profile: [], text: "はい、山手出版の編集者です。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base), references: [{ id: "contact:c41", name: "山本直子", type: "contact" }] });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja", references: [{ id: "contact:c41", type: "contact" }] }));
  assert.doesNotMatch(result.text, /見つかりませんでした/u);
  assert.match(result.text, /山手出版の編集者/u);
  assert.deepEqual(result.sourceRefs, ["contact:contact:c41"]);
});

test("a named person nobody matches, with no one else in the part, is still 'not found'", async () => {
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "王五" }], requiredCapabilities: ["memo.read"], sourceQuote: "王五上次说了什么" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(shopWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input("王五上次说了什么？"));
  assert.match(result.text, /我不确定你说的是哪一位联系人/u, "AG06 repair 1 (AE-XL-010): which person is not known; never that they do not exist");
});

test("AE-UND-010 shape: the waiting part names the prerequisite that is not done (the web read), not the answered one", async () => {
  const message = "列出我记过的竞品，再读一下 Cirrus Works 的官网价格页 https://cirrus-works.example.test/pricing ，把它现在的标价和我笔记里的差异存成一条笔记。";
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(memo(ACTOR, "note:m60", "竞品：Cirrus Works 不公开报价。", "2026-11-01T03:00:00.000Z", [], { title: "竞品笔记" }));
  const model = deepseekStub([
    json({ parts: [
      part({ dataSources: ["orbit_records"], deliverable: "list", localId: "p1", readFilter: { text: "竞品" }, requiredCapabilities: ["memo.read"], sourceQuote: "列出我记过的竞品，" }),
      part({ dataSources: ["public_web"], localId: "p2", requiredCapabilities: ["web.fetch"], sourceQuote: "再读一下 Cirrus Works 的官网价格页 https://cirrus-works.example.test/pricing ，" }),
      part({ deliverable: "change", dependsOn: ["p1", "p2"], localId: "p3", requiredCapabilities: ["memo.create"], sourceQuote: "把它现在的标价和我笔记里的差异存成一条笔记。" }),
    ], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "Cirrus Works。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base) });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.match(result.text, /「把它现在的标价和我笔记里的差异存成一条笔记。」要等「再读一下 Cirrus Works 的官网价格页/u);
  assert.doesNotMatch(result.text, /要等「列出我记过的竞品/u);
});
