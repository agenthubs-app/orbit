import assert from "node:assert/strict";
import test from "node:test";

import type { AgentActionPreviewContract } from "../../shared/contract/agent-v1";
import { agentCardView } from "../../shared/compute/agent-card-view";
import { en } from "../../shared/copy/en";
import { ja } from "../../shared/copy/ja";
import { zh } from "../../shared/copy/zh";

/**
 * agent-design AG07: the one card rule both clients run (shared/compute, synced to the App) — the eight states of the
 * approved draft, offline (§7), an unsynced edit on this device (§7) and a re-frozen card (§5.2). Every word is the
 * preview's or a fixed aiCard word; a field the preview does not have is not on the card.
 */
const preview = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "card1",
  locale: "zh",
  operations: [
    { after: { plannedDate: "2026-11-20" }, before: { plannedDate: "2026-11-18" }, capability: "todo.update", display: { change: "update", record: "待办「给小林发修订报价」", rows: [{ after: "11月20日（周五）", before: "11月18日（周三）", field: "plannedDate", label: "计划日期" }] }, operationId: "card1:op1", status: "pending", target: { collection: "tasks", id: "T42" }, text: "line 1" },
    { after: {}, capability: "memo.create", display: { change: "create", record: "笔记「小林今天来过电话」", rows: [{ after: "小林健", field: "interaction.actualContactIds", label: "往来对象" }] }, operationId: "card1:op2", status: "pending", text: "line 2" },
  ],
  payloadHash: "h1",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "s",
  title: "修改1项，新增1项",
  updatedAt: "2026-11-15T01:00:00.000Z",
  ...overrides,
});
const online = { online: true, pendingTargets: [] as string[] };

test("waiting: the count sentence, each item from the preview, both buttons, the hint", () => {
  const view = agentCardView(preview(), online, zh.aiCard);
  assert.equal(view.kind, "card");
  if (view.kind !== "card") return;
  assert.deepEqual([view.chip.label, view.title], ["等你确认", "修改1项，新增1项"]);
  assert.deepEqual(view.items.map((item) => [item.badge, item.record, item.rows.map((row) => `${row.label} ${row.before ?? ""}→${row.after}`)]), [["改", "待办「给小林发修订报价」", ["计划日期 11月18日（周三）→11月20日（周五）"]], ["新增", "笔记「小林今天来过电话」", ["往来对象 →小林健"]]]);
  assert.deepEqual(view.buttons, { confirm: "确认以上2项", confirmEnabled: true, dismiss: "不改了", dismissEnabled: true });
  assert.deepEqual([view.hint, view.blocked, view.banner, view.pendingCount], ["点确认之前，什么都不会改。", null, null, 1]);
});

test("a field the preview does not have is not on the card (no client-side formatting)", () => {
  const base = preview();
  const lacking = preview({ operations: [{ ...base.operations[0], display: { ...base.operations[0].display!, rows: [] } }, base.operations[1]] });
  const view = agentCardView(lacking, online, zh.aiCard);
  assert.ok(view.kind === "card" && view.items[0].rows.length === 0, "no row is made up from before/after");
  const old = preview({ operations: [{ ...base.operations[0], display: undefined }] });
  const legacy = agentCardView(old, online, zh.aiCard);
  assert.ok(legacy.kind === "card" && legacy.items[0].record === "line 1" && legacy.items[0].rows.length === 0, "a card frozen before AG07 shows the server's line");
});

test("the eight states read as the draft says; rejected and canceled both read 已取消", () => {
  const states: [AgentActionPreviewContract["status"], string, string | null][] = [
    ["approved", "处理中", "已确认，正在处理。"],
    ["executing", "处理中", "已确认，正在处理。"],
    ["completed", "已完成", "2项都已完成。"],
    ["expired", "放太久已失效", null],
    ["rejected", "已取消", "没有改任何记录。"],
    ["canceled", "已取消", "没有改任何记录。"],
  ];
  for (const [status, chip, footer] of states) {
    const view = agentCardView(preview({ status }), online, zh.aiCard);
    assert.ok(view.kind === "card");
    assert.deepEqual([view.chip.label, view.footer, view.buttons, view.confirmEnabled, view.pendingCount], [chip, footer, null, false, 0], status);
  }
  const expired = agentCardView(preview({ status: "expired" }), online, zh.aiCard);
  assert.ok(expired.kind === "card" && expired.regenerate?.question === "这张卡放太久了，要重新生成一张吗？" && expired.dim);
  const done = agentCardView(preview({ operations: preview().operations.map((op) => ({ ...op, status: "succeeded" as const })), status: "completed" }), online, zh.aiCard);
  assert.ok(done.kind === "card");
  assert.deepEqual(done.items.map((item) => item.status?.label), ["已改", "已新增"]);
  const partial = agentCardView(preview({ operations: [{ ...preview().operations[0], status: "succeeded" }, { ...preview().operations[1], status: "failed" }], status: "partially_failed" }), online, zh.aiCard);
  assert.ok(partial.kind === "card");
  assert.deepEqual([partial.chip.label, partial.items.map((item) => item.status?.label), partial.footer], ["部分完成", ["已改", "没保存成功"], "有1项没成功，其余已完成。"]);
  const review = agentCardView(preview({ operations: [{ ...preview().operations[0], status: "succeeded" }, { ...preview().operations[1], status: "needs_review" }], status: "partially_failed" }), online, zh.aiCard);
  assert.ok(review.kind === "card");
  assert.deepEqual([review.chip.label, review.items[1].review, review.reviewButtons?.retry], ["有一项需要你核对", true, "重试"]);
});

test("offline: a waiting card shows only how many changes wait and that it needs the network", () => {
  const view = agentCardView(preview(), { online: false, pendingTargets: [] }, zh.aiCard);
  assert.deepEqual(view, { actionId: "card1", cardContent: "hidden", confirmEnabled: false, hint: "联网后才能确认", kind: "offline", pendingCount: 1, summary: "有1份待确认的修改" });
  assert.doesNotMatch(JSON.stringify(view), /给小林|11月/u, "no record name or date leaks");
  const en1 = agentCardView(preview({ locale: "en" }), { online: false, pendingTargets: [] }, en.aiCard);
  assert.ok(en1.kind === "offline" && en1.summary === "1 change waiting for your confirmation" && en1.hint === "Go online to confirm");
  const closed = agentCardView(preview({ status: "rejected" }), { online: false, pendingTargets: [] }, zh.aiCard);
  assert.ok(closed.kind === "card" && closed.buttons === null, "a closed card stays readable offline, with nothing to press");
});

test("an unsynced edit of a record on the card: confirm is not available, 先同步你的修改; other records do not block", () => {
  const view = agentCardView(preview(), { online: true, pendingTargets: ["tasks:T42"] }, zh.aiCard);
  assert.ok(view.kind === "card");
  assert.deepEqual([view.confirmEnabled, view.buttons?.confirmEnabled, view.buttons?.dismissEnabled, view.blocked, view.hint, view.items[0].pendingEdit], [false, false, true, "先同步你的修改", null, "这条待办你在手机上改过，还没同步"]);
  const other = agentCardView(preview(), { online: true, pendingTargets: ["tasks:T99", "notes:n1"] }, zh.aiCard);
  assert.ok(other.kind === "card" && other.confirmEnabled && other.blocked === null);
});

test("a card re-frozen from changed data: the banner and the changed row; still needs a click", () => {
  const base = preview();
  const revised = preview({ changes: [{ field: "plannedDate", now: "2026-11-19", operationId: "card1:op1", shownBefore: "2026-11-18", to: "2026-11-20" }], operations: [{ ...base.operations[0], display: { ...base.operations[0].display!, rows: [{ after: "11月20日（周五）", before: "11月19日（周四）", field: "plannedDate", label: "计划日期" }] } }, base.operations[1]], revision: 2 });
  const view = agentCardView(revised, online, zh.aiCard);
  assert.ok(view.kind === "card");
  assert.deepEqual([view.banner, view.items[0].rows[0].changed, view.items[0].rows[0].before, view.confirmEnabled, view.revision], ["内容有变化，请再看一遍", true, "11月19日（周四）", true, 2]);
});

test("the fixed words follow the card's language", () => {
  const view = agentCardView(preview({ locale: "ja", title: "変更 1 件、追加 1 件" }), online, ja.aiCard);
  assert.ok(view.kind === "card");
  assert.deepEqual([view.chip.label, view.buttons?.confirm, view.buttons?.dismiss, view.items[0].badge, view.items[1].badge], ["確認待ち", "以上 2 件を確定", "変更しない", "変更", "追加"]);
  const one = agentCardView(preview({ operations: [preview().operations[0]] }), online, en.aiCard);
  assert.ok(one.kind === "card" && one.buttons?.confirm === "Confirm this change");
});
