/**
 * Today 决策详情内容测试。
 *
 * T2（today-schedule 合并 P2）之前，这个组件是一个常驻的右栏面板
 * （`OrbitTodayDecisionPanel`，entry 为 null 时有专门的空态）。现在决策卡改
 * 成原位展开的 accordion（orbit-real-today.tsx 的 `DecisionEntryCard`），
 * 这个组件只渲染展开体*内容本身*（`OrbitTodayDecisionPanelBody`）——它总是
 * 拿到一个具体的 entry，不再有"未选中"的空态分支。
 *
 * 内容必须回答设计稿的三个问题：为什么现在出现、建议基于什么信息、确认后将会
 * 发生什么，并且必须显式声明"消息只保存为草稿，不会自动发送"。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentLedgerEntryFixtures } from "../../features/agent/ledger/fixtures";
import { OrbitTodayDecisionPanelBody } from "../../app/(app)/app/today/orbit-today-decision-panel";

const alexChen = agentLedgerEntryFixtures.find(
  (entry) => entry.entryId === "ledger-followup-alex-chen",
)!;

test("the body renders why-now, evidence chips, and effect previews", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanelBody entry={alexChen} />);

  assert.ok(html.includes("为什么现在出现"));
  assert.ok(html.includes(alexChen.whyNow));
  assert.ok(html.includes("建议基于什么信息"));
  assert.ok(html.includes("活动资料"));
  assert.ok(html.includes("确认后将会"));
  assert.ok(html.includes("保存会面笔记"));
});

test("the body states the draft-only guarantee", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanelBody entry={alexChen} />);

  assert.ok(html.includes("只保存为草稿"));
  assert.ok(!html.includes("自动发送邮件"));
});

test("the body never renders a voice-recording evidence chip", () => {
  for (const entry of agentLedgerEntryFixtures) {
    const html = renderToStaticMarkup(<OrbitTodayDecisionPanelBody entry={entry} />);
    assert.ok(!html.includes("语音"), entry.entryId);
  }
});

test("awaiting_confirmation and deferred entries render the confirm form (checkboxes + 确认执行/稍后处理)", () => {
  for (const entry of agentLedgerEntryFixtures) {
    if (entry.status !== "awaiting_confirmation" && entry.status !== "deferred") continue;

    const html = renderToStaticMarkup(<OrbitTodayDecisionPanelBody entry={entry} />);
    assert.ok(html.includes("确认执行"), entry.entryId);
    assert.ok(html.includes("稍后处理"), entry.entryId);
    assert.ok(html.includes("data-orbit-today-decision-form"), entry.entryId);
  }
});

test("terminal entries render no confirm form", () => {
  const completed = agentLedgerEntryFixtures.find(
    (entry) => entry.entryId === "ledger-archive-six-contacts",
  )!;
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanelBody entry={completed} />);

  assert.ok(!html.includes("确认执行"));
});
