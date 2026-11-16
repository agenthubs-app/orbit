import assert from "node:assert/strict";
import test from "node:test";

import { buildCardOperationList, prepareCardOperation, type CardOperationIntent } from "../../features/agent/runtime/card-operations";
import { agentCardPreview } from "../../features/agent/runtime/card-view";
import type { AgentActionRecord } from "../../features/agent/runtime/contract";
import { cardHashInput, cardPayloadHash } from "../../features/agent/runtime/decision";
import { dayText, type TodoReader } from "../../features/agent/runtime/todo-operations";

/**
 * agent-design AG07 (approved visual draft, 设计稿 §10): every word of a card item is written by the server
 * in the card's language and frozen with the card — which record ("待办「给小林发修订报价」"), and one row per
 * field with its label, the value before (struck through on screen) and after. Clients choose only the fixed
 * badge word by `change`; they never format a date or assemble a difference.
 */
const reader: TodoReader = {
  async read(id) {
    return id === "T42" ? { dueAt: "2026-11-17T09:00:00.000Z", plannedDate: "2026-11-18", status: "open", title: "给小林发修订报价", updatedAt: "2026-11-10T00:00:00.000Z" } : null;
  },
};

const update: CardOperationIntent = { capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: "T42" };
const call: CardOperationIntent = {
  capability: "memo.create",
  set: {
    body: "他今天来过电话",
    contactIds: ["C17", "C20"],
    interaction: { actualContactIds: ["C17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-15" } as never,
    names: { C17: "小林健", C20: "田中" },
    title: "小林今天来过电话",
  },
};

test("zh days are written as the draft shows them: 11月20日（周五）; ja and en keep their own forms", () => {
  assert.equal(dayText("2026-11-20", "zh"), "11月20日（周五）");
  assert.equal(dayText("2026-11-20", "ja"), "11月20日（金）");
  assert.equal(dayText("2026-11-20", "en"), "Fri, Nov 20");
});

test("a to-do change carries the record, the label and the old and new value, all written by code", async () => {
  const op = await prepareCardOperation({ actionId: "card1", index: 0, intent: update, locale: "zh", reader, revision: 1 });
  assert.deepEqual(op?.display, {
    change: "update",
    record: "待办「给小林发修订报价」",
    rows: [{ after: "11月20日（周五）", before: "11月18日（周三）", field: "plannedDate", label: "计划日期" }],
  });
});

test("AG07 repair 2 item 4: the card shows a note by its title and fields, never the raw body with its pronoun (approved draft)", async () => {
  for (const locale of ["zh", "ja", "en"] as const) {
    const op = await prepareCardOperation({ actionId: "card1", index: 1, intent: call, locale, reader, revision: 1 });
    const shown = [op!.display?.record ?? "", ...(op!.display?.rows ?? []).flatMap((row) => [row.label, row.after, row.before ?? ""]), op!.preview ?? ""].join("\n");
    assert.doesNotMatch(shown, /他今天来过电话/u, `${locale}: ${shown}`);
    assert.match(shown, /小林健/u, `${locale}: the person is named`);
  }
});

test("a new interaction memo lists who, which day and how, in the card's language", async () => {
  const zh = await prepareCardOperation({ actionId: "card1", index: 1, intent: call, locale: "zh", reader, revision: 1 });
  assert.deepEqual(zh?.display, {
    change: "create",
    record: "笔记「小林今天来过电话」",
    rows: [
      { after: "小林健", field: "interaction.actualContactIds", label: "往来对象" },
      { after: "11月15日（周日）", field: "interaction.occurredOn", label: "日期" },
      { after: "对方来电", field: "interaction.channel", label: "方式" },
      { after: "田中（只是提到）", field: "contactIds", label: "另关联" },
    ],
  });
  const ja = await prepareCardOperation({ actionId: "card1", index: 1, intent: call, locale: "ja", reader, revision: 1 });
  assert.equal(ja?.display?.record, "メモ「小林今天来过电话」");
  assert.deepEqual(ja?.display?.rows.map((row) => `${row.label} ${row.after}`), ["相手 小林健", "日付 11月15日（日）", "方法 先方からの電話", "関連 田中（話に出ただけ）"]);
  const en = await prepareCardOperation({ actionId: "card1", index: 1, intent: call, locale: "en", reader, revision: 1 });
  assert.deepEqual(en?.display?.rows.map((row) => `${row.label} ${row.after}`), ["With 小林健", "Date Sun, Nov 15", "How they called", "Also linked 田中 (only mentioned)"]);
});

test("a new to-do names itself and lists the dates it gets; a due time keeps its clock", async () => {
  const op = await prepareCardOperation({ actionId: "card1", index: 0, intent: { capability: "todo.create", set: { dueAt: "2026-11-30T09:00:00.000Z", plannedDate: "2026-11-30", title: "给客户寄新年贺卡" } }, locale: "zh", reader, revision: 1 });
  assert.deepEqual(op?.display, {
    change: "create",
    record: "待办「给客户寄新年贺卡」",
    rows: [
      { after: "11月30日（周一）", field: "plannedDate", label: "计划日期" },
      { after: "11月30日（周一） 18:00", field: "dueAt", label: "截止时间" },
    ],
  });
});

test("an item that waits for the one before says so on the card", async () => {
  const built = await buildCardOperationList(reader, { actionId: "card1", intents: [update, { ...call, dependsOn: [0] }], locale: "zh", revision: 1 });
  assert.equal(built.operations[1].display?.note, "第1项成功后才执行");
  assert.equal(built.operations[0].display?.note, undefined);
});

test("the one preview carries the display and the card's language; the display is covered by the card hash", async () => {
  const built = await buildCardOperationList(reader, { actionId: "card1", intents: [update, call], locale: "ja", revision: 1 });
  const action = {
    actionId: "card1", createdAt: "2026-11-15T01:00:00.000Z", immutablePayloadHash: "h", locale: "ja", operations: built.operations, payloadHash: "h",
    preview: "p", revision: 1, status: "awaiting_confirmation", title: "変更 1 件、追加 1 件", updatedAt: "2026-11-15T01:00:00.000Z",
  } as unknown as AgentActionRecord;
  const preview = agentCardPreview(action, null, "2026-11-15T01:00:00.000Z");
  assert.equal(preview.locale, "ja");
  assert.deepEqual(preview.operations[0].display, built.operations[0].display);
  const changed = built.operations.map((op, index) => (index === 0 ? { ...op, display: { ...op.display!, record: "タスク「別のもの」" } } : op));
  assert.notEqual(cardPayloadHash({ operations: built.operations, preview: "p", revision: 1, title: "t" }), cardPayloadHash({ operations: changed, preview: "p", revision: 1, title: "t" }));
  // A card frozen before AG07 (no display) keeps the hash it was frozen with.
  const old = built.operations.map(({ display: _display, ...op }) => op);
  const input = cardHashInput({ operations: old, preview: "p", revision: 1, title: "t" }) as { operations: Record<string, unknown>[] };
  assert.equal("display" in input.operations[0], false);
});
