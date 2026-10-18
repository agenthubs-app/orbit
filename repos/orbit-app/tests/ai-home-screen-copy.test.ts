import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const view = readFileSync(join(repoRoot, "src/screens/ai/IOrbitStartView.tsx"), "utf8");
const controller = readFileSync(join(repoRoot, "src/screens/ai/AiScreen.tsx"), "utf8");

test("R21 App start owns one kit screen with a one-line full-screen header", () => {
  assert.match(view, /<AppScreen inset="kit"/u);
  assert.match(view, /numberOfLines=\{1\} adjustsFontSizeToFit/u);
  assert.match(view, /accessibilityLabel="会話リスト"/u);
  assert.match(view, /accessibilityLabel="閉じる"/u);
  assert.match(view, /gesture\.x0 < 54 && gesture\.dx > 64/u);
});

test("R21 starter questions are explicit sends and the composer keeps its draft", () => {
  assert.match(view, /suggestions\.slice\(0, 4\)\.map/u);
  assert.match(view, /onPress=\{\(\) => onSend\(item\.label\)\}/u);
  assert.match(view, /onChangeText=\{onDraftChange\}/u);
  assert.match(view, /disabled=\{!draft\.trim\(\) \|\| offline\}/u);
  assert.match(controller, /navigationLock\.current/u);
});

test("R21 history has a real search, pagination, pin and delete confirmation", () => {
  assert.match(view, /<FullDrawer visible=\{historyOpen\}/u);
  assert.match(view, /<SearchField value=\{historyQuery\}/u);
  assert.match(view, /onPress=\{onLoadMore\}/u);
  assert.match(view, /onLongPress=\{\(\) => setSelected\(item\)\}/u);
  assert.match(view, /<ActionSheet visible=\{selected !== null\}/u);
  assert.match(view, /<ConfirmDialog visible=\{confirmDelete !== null\}/u);
  assert.match(controller, /serverSearchState/u);
});

test("R21 history surfaces server pin limit and a server-acknowledged undo", () => {
  assert.match(controller, /result\.code === "PIN_LIMIT"/u);
  assert.match(controller, /deleteAiSession\(client, item\.id/u);
  assert.match(controller, /restoreAiSession\(client, id, token\)/u);
  assert.match(view, /label="削除を元に戻す"/u);
});

test("R21 history separates typed plan entries from conversations", () => {
  assert.match(view, /planIntakes\.map/u);
  assert.match(view, /planGoals\.map/u);
  assert.match(controller, /planFlowHref\("app", intake\.intakeId\)/u);
  assert.match(controller, /planOverviewHref\("app", goal\.planId\)/u);
  assert.match(controller, /planReviewHref\("app", goal\.planId\)/u);
  assert.match(controller, /planDoneHref\("app", goal\.planId\)/u);
});

test("R21 offline history has a timestamp and never enables an offline send", () => {
  assert.match(view, /オフライン ·/u);
  assert.match(view, /timeZone: "Asia\/Tokyo"/u);
  assert.match(view, /disabled=\{!draft\.trim\(\) \|\| offline\}/u);
});
