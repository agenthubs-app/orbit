import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = (name, ...args) => name === "expo-router"
  ? { usePathname: () => "/ai", useRouter: () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} }) }
  : originalLoad(name, ...args);
const { IOrbitStartView } = require("../src/screens/ai/IOrbitStartView");
loader._load = originalLoad;

const noop = () => {};
function start(overrides: Record<string, unknown> = {}) {
  return renderToHtml(<IOrbitStartView
    contactCount={1} confirmDelete={null} deleting={false} draft="" error={null}
    history={[]} historyHasMore={false} historyLoading={false} historyNotice={null}
    historyOpen historyQuery="" offline={false} offlineAt={null}
    onClose={noop} onCancelDelete={noop} onConfirmDelete={noop} onDelete={noop}
    onDraftChange={noop} onHistoryClose={noop} onHistoryOpen={noop}
    onHistoryQueryChange={noop} onLoadMore={noop} onNew={noop}
    onNewGoal={noop} onOpen={noop} onOpenGoal={noop} onOpenIntake={noop}
    onPin={noop} onRename={noop} onScan={noop} onSend={noop} onUndo={noop}
    planGoals={[]} planIntakes={[]} suggestions={[]} undoAvailable={false}
    {...overrides}
  />);
}

test("R21 history loading does not claim the list is empty", () => {
  const html = start({ historyLoading: true });
  assert.equal(html.includes("正在加载会话…"), true);
  assert.equal(html.includes("还没有会话"), false);
});

test("R21 a completed empty history has a distinct state", () => {
  const html = start();
  assert.equal(html.includes("还没有会话"), true);
  assert.equal(html.includes("正在加载会话…"), false);
});

test("R21 a failed history read offers retry and does not claim empty", () => {
  const html = start({ historyNotice: { message: "履歴を読み込めません", retryLabel: "再読み込み", onRetry: noop } });
  assert.equal(html.includes("履歴を読み込めません"), true);
  assert.equal(html.includes("再読み込み"), true);
  assert.equal(html.includes("还没有会话"), false);
});

test("R21 a completed search with no hits says so", () => {
  const html = start({ historyQuery: "該当なし" });
  assert.equal(html.includes("没有匹配的会话"), true);
  assert.equal(html.includes("还没有会话"), false);
});

test("R21 a later-page failure retains already loaded history", () => {
  const history = [{ source: "session", id: "session:kept", title: "残った会話", when: "今日", updatedAt: "2026-10-18T00:00:00Z", groupId: null, pinned: false, organizationRevision: 1, preview: "" }];
  const html = start({ history, historyNotice: { message: "続きを読み込めません", retryLabel: "再試行", onRetry: noop } });
  assert.equal(html.includes("残った会話"), true);
  assert.equal(html.includes("続きを読み込めません"), true);
});

test("R21 an offline organization edit is visibly waiting to sync", () => {
  assert.equal(start({ offline: true, hasPendingWrites: true }).includes("更改待同步"), true);
  assert.equal(start({ offline: true, hasPendingWrites: false }).includes("更改待同步"), false);
  assert.equal(start({ onDiscardFailedWrite: noop }).includes("放弃本次更改"), true);
});
