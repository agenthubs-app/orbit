/**
 * All actions 权限与通知设置区测试。
 *
 * 三项设置来自设计稿；当前只有界面与本地交互，尚未持久化到 agent settings。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitAllActionsSettings } from "../../app/(app)/app/contacts/all-actions/orbit-all-actions-settings";
import { loadAppAllActionsRouteViewModel } from "../../app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitRealAllActions } from "../../app/(app)/app/contacts/all-actions/orbit-real-all-actions";

test("the settings block renders the three designed controls", () => {
  const html = renderToStaticMarkup(<OrbitAllActionsSettings />);

  assert.ok(html.includes("权限与通知"));
  assert.ok(html.includes("自动准备会面笔记"));
  assert.ok(html.includes("活动后推送跟进提醒"));
  assert.ok(html.includes("安静时段"));
  assert.ok(html.includes("22:00"));
  assert.ok(html.includes("08:00"));
});

test("the settings block is honest about not persisting yet", () => {
  const html = renderToStaticMarkup(<OrbitAllActionsSettings />);

  assert.ok(html.includes("尚未保存"));
});

test("both toggles render as checkboxes defaulted on", () => {
  const html = renderToStaticMarkup(<OrbitAllActionsSettings />);
  const checkboxes = html.match(/type="checkbox"/g) ?? [];

  assert.equal(checkboxes.length, 2);
  assert.equal((html.match(/checked=""/g) ?? []).length, 2);
});

test("an empty ledger renders the dedicated empty state", async () => {
  const model = await loadAppAllActionsRouteViewModel({ scenario: "empty" });
  const html = renderToStaticMarkup(<OrbitRealAllActions viewModel={model} />);

  assert.ok(html.includes("app-all-actions-route-empty"));
  assert.ok(html.includes("还没有任何操作记录"));
});

test("a zero-match filter renders the no-match message instead of a blank list", async () => {
  const model = await loadAppAllActionsRouteViewModel({ status: "failed" });
  const html = renderToStaticMarkup(<OrbitRealAllActions viewModel={model} />);

  assert.ok(html.includes("data-orbit-all-actions-no-match"));
  assert.ok(html.includes("该状态下没有记录"));
});

// Mobile audit P1: rows with two action buttons (重试失败项 + 撤销) squeezed
// the title down to ~1ch and it stacked one character per line at 390px.
// The fix stacks title+chip / actions into two lines via a scoped class +
// @media rule (an inline style on the row would beat any external
// override). This locks in that both the stacking class and the media rule
// ship with the entry rows.
test("entry rows carry a scoped mobile-stack rule so two action buttons don't squeeze the title", async () => {
  const model = await loadAppAllActionsRouteViewModel({});
  const html = renderToStaticMarkup(<OrbitRealAllActions viewModel={model} />);

  assert.ok(html.includes("orbit-all-actions-entry"), "rows carry the stacking class");
  assert.ok(html.includes("@media (max-width: 760px)"), "scoped mobile stack rule ships with the rows");
});
