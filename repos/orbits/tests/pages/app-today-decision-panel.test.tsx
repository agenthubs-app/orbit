/**
 * Today 决策详情面板测试。
 *
 * 面板必须回答设计稿的三个问题：为什么现在出现、建议基于什么信息、确认后将会发生什么，
 * 并且必须显式声明"消息只保存为草稿，不会自动发送"。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentLedgerEntryFixtures } from "../../features/agent/ledger/fixtures";
import { OrbitTodayDecisionPanel } from "../../app/(app)/app/today/orbit-today-decision-panel";

const alexChen = agentLedgerEntryFixtures.find(
  (entry) => entry.entryId === "ledger-followup-alex-chen",
)!;

test("the panel renders why-now, evidence chips, and effect previews", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={alexChen} />);

  assert.ok(html.includes("为什么现在出现"));
  assert.ok(html.includes(alexChen.whyNow));
  assert.ok(html.includes("建议基于什么信息"));
  assert.ok(html.includes("活动资料"));
  assert.ok(html.includes("确认后将会"));
  assert.ok(html.includes("保存会面笔记"));
});

test("the panel states the draft-only guarantee", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={alexChen} />);

  assert.ok(html.includes("只保存为草稿"));
  assert.ok(!html.includes("自动发送邮件"));
});

test("the panel never renders a voice-recording evidence chip", () => {
  for (const entry of agentLedgerEntryFixtures) {
    const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={entry} />);
    assert.ok(!html.includes("语音"), entry.entryId);
  }
});

test("a null entry renders an explicit empty panel rather than crashing", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={null} />);

  assert.ok(html.includes("选择左侧任一条目"));
});

test("terminal entries render no confirm form", () => {
  const completed = agentLedgerEntryFixtures.find(
    (entry) => entry.entryId === "ledger-archive-six-contacts",
  )!;
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={completed} />);

  assert.ok(!html.includes("确认执行"));
});
