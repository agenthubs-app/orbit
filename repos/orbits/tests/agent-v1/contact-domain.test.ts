import assert from "node:assert/strict";
import test from "node:test";

import { duplicateCandidates } from "../../features/agent-v1/domains/contact/duplicates";
import { importTableOf, previewImport, rowOverridesIn } from "../../features/agent-v1/domains/contact/import-preview";
import { checkContactTarget, contactIntentOf, prepareContactOperation } from "../../features/agent-v1/domains/contact/prepare";
import { boundContactReader } from "../../features/agent-v1/domains/contact/types";
import { cardCountTitle } from "../../features/agent/runtime/card-operations";
import { agentCardView } from "../../shared/compute/agent-card-view";
import { zh as zhCopy } from "../../shared/copy/zh";
import { ACTOR, contactWorld, json, memoryContactAccess, runContact } from "./contact-kit";
import { reviseImportByWords } from "../../features/agent-v1/entry/import-revision";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const LEDGER_NOW = "2026-11-15T01:00:00.000Z";

/** The real ledger (memory store) with the contact reader over the memory world; no executor runs. */
function ledgerOver(world: ReturnType<typeof contactWorld>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  const runtime = createAgentRuntimeService({ cardReader: { read: async () => null, contacts: boundContactReader(memoryContactAccess(world), ACTOR) }, executors: createAgentExecutorRegistry([]), now: () => LEDGER_NOW, repository });
  return runtime;
}

test("AE-CON-004 shape: the company shown changed elsewhere before the click — nothing executes, revision 2 shows 现在是 the new value → 改成 the asked one", async () => {
  const world = contactWorld();
  const runtime = ledgerOver(world);
  const frozen = await runtime.freezeCard!({ actionId: "card:c45", intents: [{ capability: "contact.update", set: { organization: "青叶设计事务所" }, targetId: "contact:c45" }], locale: "zh", origin: { conversationId: "session:a", kind: "conversation", requestId: "req:1" } });
  const action = frozen.action!;
  assert.deepEqual(action.operations[0].before, { organization: "青叶设计" });
  const sato = world.records.find((record) => record.id === "contact:c45")!;
  sato.payload = { ...sato.payload, organization: "青叶品牌设计", version: 2 };
  const decided = await runtime.decideAction!({ actionId: action.actionId, clientDecisionId: "d1", decision: "confirm", payloadHash: action.payloadHash!, revision: 1 });
  assert.equal(decided?.reason, "CARD_CONTENT_CHANGED");
  assert.equal(decided?.accepted, false);
  const next = await runtime.getAction(action.actionId);
  assert.equal(next?.revision, 2);
  assert.equal(next?.status, "awaiting_confirmation");
  assert.deepEqual(next?.operations[0].before, { organization: "青叶品牌设计" });
  assert.deepEqual(next?.operations[0].after, { organization: "青叶设计事务所" });
  assert.deepEqual((next?.operations[0].payload as { expectedVersion: number }).expectedVersion, 2);
});

test("AE-CON-007 shape: a waiting import card, then '第一行的王强不是同一个人，也新建' — revision 2 by code (no model), 新增3行; the old revision can no longer be confirmed", async () => {
  const world = contactWorld();
  const runtime = ledgerOver(world);
  const text = "姓名,公司,职位\n王强,远帆物流,运营经理\n高桥凉,山手出版,营业\n,青叶设计,实习生\n森田葵,东和商事,采购";
  const frozen = await runtime.freezeCard!({ actionId: "card:imp", intents: [{ capability: "contact.import", overrides: {}, text }], locale: "zh", origin: { conversationId: "session:a", kind: "conversation", requestId: "req:imp" } });
  assert.equal(frozen.action!.title, "导入联系人：新增2行、疑似重复1行、跳过1行");
  assert.equal(frozen.action!.operations[0].display?.record, "导入联系人（共4行）");
  const other = await reviseImportByWords({ actorId: ACTOR, message: "第一行的王强不是同一个人，也新建。", now: () => LEDGER_NOW, runtime, sessionId: "session:other", store: null });
  assert.equal(other, null, "another conversation's card is not touched");
  assert.equal(await reviseImportByWords({ actorId: ACTOR, message: "好的谢谢", now: () => LEDGER_NOW, runtime, sessionId: "session:a", store: null }), null);
  const revised = await reviseImportByWords({ actorId: ACTOR, message: "第一行的王强不是同一个人，也新建。", now: () => LEDGER_NOW, runtime, sessionId: "session:a", store: null });
  assert.ok(revised);
  assert.equal(revised!.actionPreview!.revision, 2);
  assert.equal(revised!.actionPreview!.title, "导入联系人：新增3行、疑似重复0行、跳过1行");
  assert.match(revised!.text, /^好的，第1行改为新建。卡片已从「新增2行、疑似重复1行、跳过1行」更新为「新增3行、疑似重复0行、跳过1行」，点确认之前不会导入。/u);
  const stale = await runtime.decideAction!({ actionId: "card:imp", clientDecisionId: "d-old", decision: "confirm", payloadHash: frozen.action!.payloadHash!, revision: 1 });
  assert.equal(stale?.reason, "CARD_REVISION_CHANGED");
});

/**
 * agent-design AG12: contact writes in the conversation. Every one is a card first; preparing it reads only. A new person
 * who may already be there is a question before the card (AG12-1); a change shows only its field, old value and the
 * version read, and is checked again at the click (AG12-2); a delete lists the linked notes and to-dos as kept and the
 * 30-day restore, a restore brings back the same contact (AG12-3); an import lists every row, and a row changed in
 * words gives a new card (AG12-4).
 */

const CREATE_PART = (quote: string) => ({ deliverable: "change", objectClues: [{ entity: "contact", text: "王强" }], requiredCapabilities: ["contact.create"], sourceQuote: quote });
const METHODS = ["@example.test", "+81-90-0000-0000", "wang@yuanfan.example.test", "tanaka@towa.example.test", "kobayashi@hokushin.example.test", "+81-90-0000-0017"];
const sentNothingOf = (calls: { system: string; user: string }[]) => {
  for (const call of calls) for (const value of METHODS) assert.ok(!`${call.system}\n${call.user}`.includes(value), `a model input held ${value}`);
};

test("AG12-1 duplicates by code: the same name and company first, a near name at the same company, never the same name at another company", () => {
  const world = contactWorld((records) => records.push({ ...records.find((record) => record.id === "contact:c46")!, id: "contact:c47", payload: { ...records.find((record) => record.id === "contact:c46")!.payload, id: "contact:c47", role: "运营" } }));
  const access = memoryContactAccess(world);
  return access.listActive(ACTOR).then((records) => {
    const candidates = duplicateCandidates(records, ACTOR, { displayName: "王强", organization: "远帆物流", role: "仓储主管" });
    assert.deepEqual(candidates.map((item) => item.id).sort(), ["contact:c46", "contact:c47", "contact:c51"].sort());
    assert.ok(!candidates.some((item) => item.id === "contact:c50"), "王强 at 岚图机器人 is another person");
    assert.ok(!candidates.some((item) => item.id === "contact:cb1"), "another account's contact is never a candidate");
    assert.ok(candidates.every((item) => !("email" in item) && !("phone" in item)), "no contact methods");
    assert.deepEqual(duplicateCandidates(records, ACTOR, { displayName: "Hannah Brooks", organization: "Fernway Goods" }), []);
    // AE-SCL-024: 张卫东 at the same company is not "only a character off" 张伟.
    const zhang = [...records, { ...records[0], payload: { displayName: "张卫东", organization: "曜石半导体" }, recordId: "contact:lc05" }, { ...records[0], payload: { displayName: "张玮", organization: "曜石半导体" }, recordId: "contact:lc06" }];
    assert.deepEqual(duplicateCandidates(zhang as never, ACTOR, { displayName: "张伟", organization: "曜石半导体" }).map((item) => item.id), ["contact:lc06"]);
  });
});

test("AE-CON-001 shape: a possible duplicate is one question before the card, with 都不是，另建一位; nothing frozen, nothing sent to the model of the candidates' methods", async () => {
  const message = "新增一位联系人：王强，远帆物流的仓储主管。";
  const run = await runContact(message, [CREATE_PART(message)], [{ dependsOn: [], entity: "contact", fields: [{ name: "name", valueText: "王强" }, { name: "company", valueText: "远帆物流" }, { name: "role", valueText: "仓储主管" }], localId: "w1", partId: "p1", verb: "create" }]);
  assert.equal(run.frozen.length, 0, "no card before the user checks");
  assert.equal(run.result.clarifications.length, 1);
  const options = run.result.clarifications[0].options;
  assert.ok(options.some((option) => option.ref?.id === "contact:c46"));
  assert.ok(options.some((option) => option.optionId === "create_new" && /都不是，另建一位/u.test(option.label)));
  assert.match(run.result.text, /远帆物流 · 运营经理/u);
  assert.doesNotMatch(run.result.text, /岚图机器人/u);
  sentNothingOf(run.modelCalls);
  // 都不是：the card adds the new person, nothing merged.
  const fresh = await run.resume("create_new");
  const op = fresh.actionPreview!.operations[0];
  assert.equal(op.capability, "contact.create");
  assert.deepEqual(op.after, { displayName: "王强", organization: "远帆物流", role: "仓储主管" });
  assert.equal(op.display?.change, "create");
  assert.equal(op.display?.record, "联系人「王强」");
});

test("AE-CON-002 shape: choosing the existing one adds nothing and freezes no card; the reply says no contact was created", async () => {
  const message = "加个联系人：王强，远帆物流，运营经理。";
  const run = await runContact(message, [CREATE_PART(message)], [{ dependsOn: [], entity: "contact", fields: [{ name: "name", valueText: "王强" }, { name: "company", valueText: "远帆物流" }, { name: "role", valueText: "运营经理" }], localId: "w1", partId: "p1", verb: "create" }]);
  const resumed = await run.resume("contact:c46");
  assert.ok(!resumed.actionPreview);
  assert.equal(run.frozen.length, 0);
  assert.match(resumed.text, /没有新建联系人/u);
  assert.doesNotMatch(resumed.text, /如果要把/u, "nothing differs, so no change is offered");
});

test("AG12-2 update: only the field said, its old value, the version read; the click sees a change of the shown value (not of another field)", async () => {
  const world = contactWorld();
  const access = memoryContactAccess(world);
  const reader = boundContactReader(access, ACTOR);
  const op = (await prepareContactOperation({ actionId: "card:x", index: 0, intent: { capability: "contact.update", set: { role: "采购部长" }, targetId: "contact:c30" }, locale: "zh", reader, revision: 1 }))!;
  assert.deepEqual(op.before, { role: "采购主管" });
  assert.deepEqual(op.after, { role: "采购部长" });
  assert.equal((op.payload as { expectedVersion: number }).expectedVersion, 3);
  assert.equal(op.preview, "修改联系人「田中浩」：职位从「采购主管」改为「采购部长」");
  assert.deepEqual(op.display?.rows, [{ after: "采购部长", before: "采购主管", field: "role", label: "职位" }]);
  assert.doesNotMatch(JSON.stringify(op.display), /tanaka@|公司|邮箱/u);
  assert.equal((await checkContactTarget(op, reader)).changed, false);
  // Another field changed meanwhile: no conflict; the shown value changed: the card is frozen again.
  const tanaka = world.records.find((record) => record.id === "contact:c30")!;
  tanaka.payload = { ...tanaka.payload, notes: "别处补的", version: 4 };
  const quiet = await checkContactTarget(op, reader);
  assert.equal(quiet.changed, false);
  assert.equal(quiet.versionToken, "4", "it executes against the version read at the click");
  tanaka.payload = { ...tanaka.payload, role: "采购经理", version: 5 };
  const changed = await checkContactTarget(op, reader);
  assert.equal(changed.changed, true);
  assert.deepEqual(changed.rows, [{ field: "role", now: "采购经理", shownBefore: "采购主管", to: "采购部长" }]);
  // The new revision is frozen from the intent and the data now.
  const again = (await prepareContactOperation({ actionId: "card:x", index: 0, intent: contactIntentOf(op)!, locale: "zh", reader, revision: 2 }))!;
  assert.deepEqual(again.before, { role: "采购经理" });
  assert.equal((again.payload as { expectedVersion: number }).expectedVersion, 5);
});

test("AG12-3 delete: the card lists the linked note and to-do as kept and says 30 days; restore brings back the same id, said as 恢复", async () => {
  const message = "把李薇从联系人里删掉。";
  const run = await runContact(message, [{ deliverable: "change", objectClues: [{ entity: "contact", text: "李薇" }], requiredCapabilities: ["contact.delete"], sourceQuote: message }], [{ dependsOn: [], entity: "contact", localId: "w1", partId: "p1", selector: { clues: ["李薇"] }, verb: "delete" }]);
  const op = run.result.actionPreview!.operations[0];
  assert.equal(op.capability, "contact.delete");
  assert.equal(op.display?.change, "delete");
  assert.deepEqual([...(run.frozen[0].preview.operations[0] as { effects?: string[] }).effects ?? []].sort(), ["note:m40", "task:t45"]);
  assert.match(JSON.stringify(op.display?.rows), /李薇样片沟通[^"]*不会删除/u);
  assert.match(JSON.stringify(op.display?.rows), /「给李薇寄样片」（不会删除）/u);
  assert.equal(op.display?.note, "删除后30天内可以恢复");
  assert.match(op.text, /^删除联系人「李薇」（自由职业 · 摄影师）；关联的笔记「李薇样片沟通」和待办「给李薇寄样片」不会删除；30天内可以恢复$/u);
  assert.equal(cardCountTitle([op], "zh"), "删除1项");

  // Restore: the same contact, deleted three days ago.
  const world = contactWorld();
  const li = world.records.find((record) => record.id === "contact:c31")!;
  li.deleted = true;
  li.payload = { ...li.payload, deletedAt: "2026-11-12T01:00:00.000Z" };
  const restore = await runContact("前几天删掉的李薇，帮我恢复回来。", [{ deliverable: "change", objectClues: [{ entity: "contact", text: "李薇" }], requiredCapabilities: ["contact.restore"], sourceQuote: "前几天删掉的李薇，帮我恢复回来。" }], [{ dependsOn: [], entity: "contact", localId: "w1", partId: "p1", selector: { clues: ["李薇"] }, verb: "restore" }], { world });
  const back = restore.result.actionPreview!.operations[0];
  assert.equal(back.capability, "contact.restore");
  assert.equal(((back as { targetRef?: { id: string } }).targetRef ?? back.target)?.id, "contact:c31", "the original id");
  assert.equal(back.display?.change, "restore");
  assert.match(back.text, /^恢复联系人「李薇」（自由职业 · 摄影师）/u);
  assert.doesNotMatch(back.text, /新增/u);
  assert.equal(cardCountTitle([back], "zh"), "恢复1项");
  // Past 30 days: not prepared.
  li.payload = { ...li.payload, deletedAt: "2026-10-01T00:00:00.000Z" };
  const reader = boundContactReader(memoryContactAccess(world), ACTOR);
  assert.equal(await prepareContactOperation({ actionId: "card:y", index: 0, intent: { capability: "contact.restore", targetId: "contact:c31" }, locale: "zh", now: () => new Date("2026-11-15T01:00:00.000Z"), reader, revision: 1 }), null);
});

test("the card view: a delete reads 删除 and a restore 恢复 (badge and done state), from the server's display only", () => {
  const preview = (change: "delete" | "restore", status: string, op = "pending") => ({ actionId: "a", operations: [{ after: {}, capability: `contact.${change}`, display: { change, record: "联系人「李薇」", rows: [] }, operationId: "a:op1", status: op, text: "" }], payloadHash: "h", revision: 1, status, title: "" }) as never;
  const words = zhCopy.aiCard as never;
  const waiting = agentCardView(preview("delete", "awaiting_confirmation"), { online: true, pendingTargets: [] }, words);
  assert.equal(waiting.kind === "card" && waiting.items[0].badge, "删除");
  const done = agentCardView(preview("restore", "completed", "succeeded"), { online: true, pendingTargets: [] }, words);
  assert.equal(done.kind === "card" && done.items[0].badge, "恢复");
  assert.equal(done.kind === "card" && done.items[0].status?.label, "已恢复");
});

test("AG12-4 import: rows by code — new, possible duplicate (never merged), skipped with its reason; a row changed in words gives the new classification", async () => {
  const message = "把下面这几位导入联系人：\n姓名,公司,职位\n王强,远帆物流,运营经理\n高桥凉,山手出版,营业\n,青叶设计,实习生\n森田葵,东和商事,采购";
  const table = importTableOf(message)!;
  assert.equal(table.split("\n").length, 5);
  const access = memoryContactAccess(contactWorld());
  const existing = await access.listActive(ACTOR);
  const first = previewImport(table, existing, ACTOR);
  assert.deepEqual(first.rows.map((row) => [row.row, row.decision, row.match?.id ?? null, row.reason ?? null]), [[1, "duplicate", "contact:c46", null], [2, "create", null, null], [3, "skip", null, "missing_name"], [4, "create", null, null]]);
  assert.deepEqual(first.counts, { create: 2, duplicate: 1, skip: 1 });
  const reader = boundContactReader(access, ACTOR);
  const op = (await prepareContactOperation({ actionId: "card:i", index: 0, intent: { capability: "contact.import", overrides: {}, text: table }, locale: "zh", reader, revision: 1 }))!;
  assert.equal(cardCountTitle([op], "zh"), "导入联系人：新增2行、疑似重复1行、跳过1行");
  assert.match(JSON.stringify(op.display?.rows), /跳过：没有姓名/u);
  assert.match(JSON.stringify(op.display?.rows), /可能和已有的王强（远帆物流 · 运营经理）重复/u);
  assert.doesNotMatch(JSON.stringify(op), /wang@yuanfan/u, "no contact method on the card's rows either");
  assert.deepEqual((op.payload as { outcomes: Record<string, string> }).outcomes, { 1: "skip", 2: "create", 3: "skip", 4: "create" });
  // "第一行的王强不是同一个人，也新建": an override of row 1, by code.
  const overrides = rowOverridesIn("第一行的王强不是同一个人，也新建。")!;
  assert.deepEqual(overrides, { 1: "create" });
  assert.deepEqual(rowOverridesIn("The Wang Qiang in row 1 is a different person. Create him as a new contact too."), { 1: "create" });
  assert.deepEqual(rowOverridesIn("1行目の王強さんは別人なので、新規で追加してください。"), { 1: "create" });
  assert.equal(rowOverridesIn("好的，谢谢"), null);
  const revised = (await prepareContactOperation({ actionId: "card:i", index: 0, intent: { ...(contactIntentOf(op) as { capability: "contact.import"; text: string; overrides: Record<string, "create" | "skip"> }), overrides }, locale: "zh", reader, revision: 2 }))!;
  assert.equal(cardCountTitle([revised], "zh"), "导入联系人：新增3行、疑似重复0行、跳过1行");
  assert.deepEqual((revised.payload as { outcomes: Record<string, string> }).outcomes, { 1: "create", 2: "create", 3: "skip", 4: "create" });
  // English: the same rows, the reasons in English.
  const en = (await prepareContactOperation({ actionId: "card:e", index: 0, intent: { capability: "contact.import", overrides: {}, text: importTableOf("Please import these into my contacts:\nName,Company,Title\n王强,远帆物流,运营经理\nRyo Takahashi,Yamate Publishing,Sales\n,Aoba Design,Intern\nAoi Morita,Towa Trading,Purchasing")! }, locale: "en", reader, revision: 1 }))!;
  assert.equal(cardCountTitle([en], "en"), "Import contacts: 2 new, 1 possible duplicate, 1 skipped");
  assert.match(JSON.stringify(en.display?.rows), /Skipped: missing name/u);
});

test("AE-CON-010 stability run 3: 'import these' with the table pasted below — 'these' is the table, not a missing object; the card is made", async () => {
  const message = "Please import these into my contacts:\nName,Company,Title\n王强,远帆物流,运营经理\nRyo Takahashi,Yamate Publishing,Sales\n,Aoba Design,Intern\nAoi Morita,Towa Trading,Purchasing";
  const run = await runContact(message, [{ dataSources: ["turn_material"], clarity: "clear", deliverable: "change", intentBasis: "instruction", objectClues: [{ entity: "contact", text: "these" }], requiredCapabilities: ["contact.import"], sourceQuote: message }], [{ dependsOn: [], entity: "contact", localId: "w1", partId: "p1", verb: "import" }], { language: "en" });
  assert.equal(run.result.clarifications.length, 0, run.result.text);
  assert.equal(run.result.actionPreview?.operations[0].capability, "contact.import");
});

test("AE-CON-008 shape: a question about phone and e-mail — the read gives the company and role, no model input holds the methods", async () => {
  const message = "小林健的电话和邮箱是多少？另外他在哪家公司、什么职位？";
  const run = await runContact(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林健" }], requiredCapabilities: ["contact.read"], sourceQuote: message }], [], {
    answer: (call) => {
      const handle = /(s\d+) — contact/u.exec(call.user)?.[1] ?? "s1";
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "小林健在北辰软件，职位是销售总监。" }] });
    },
  });
  assert.ok(run.modelCalls.length >= 1);
  sentNothingOf(run.modelCalls);
  const answer = run.modelCalls.find((call) => call.node === "answer")!;
  assert.match(answer.user, /Contact details: e-mail, phone on file, not shared with you/u, "the answer step knows they exist but are withheld");
  assert.equal(run.frozen.length, 0);
});
