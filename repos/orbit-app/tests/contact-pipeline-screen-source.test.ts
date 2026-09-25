import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/screens/contacts/ContactPipelineScreen.tsx", import.meta.url),
  "utf8"
);

test("relationship progress reads one bounded page resource and keeps the task-first view", () => {
  assert.match(source, /useContactPipelinePages/);
  assert.doesNotMatch(source, /ORBIT_API_ENDPOINTS\.(contacts|connections|tasks)/);
  assert.match(source, /useState<"actions" \| "stages">\("actions"\)/);
  assert.match(source, /label="待处理"/);
  assert.match(source, /label="按阶段"/);
  assert.match(source, /hasMore/);
  assert.match(source, /loadMore/);
  assert.match(source, /router\.push\("\/tasks\?scope=relationship" as Href\)/);
  assert.doesNotMatch(source, /contactsPipelineToView|\.slice\(0,\s*3\)/);
});

test("relationship progress has no legacy preview write path and retains task navigation", () => {
  assert.doesNotMatch(source, /ActionSheetIOS|connectionStagePath|client\.patch|pendingStageActionKey/);
  assert.match(source, /\/tasks\?scope=relationship/);
  assert.doesNotMatch(source, /styles\.stageActionsRow/);
});

test("relationship progress removes legacy dashboard language and intro promotion", () => {
  assert.doesNotMatch(source, /eyebrow="名片夹"/);
  assert.doesNotMatch(source, /管线总览/);
  assert.doesNotMatch(source, /引荐准备/);
  assert.match(source, /stages\.map/);
});
