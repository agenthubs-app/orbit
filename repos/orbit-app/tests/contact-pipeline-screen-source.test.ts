import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/screens/contacts/ContactPipelineScreen.tsx", import.meta.url),
  "utf8"
);

test("relationship progress defaults to a compact task-first view", () => {
  assert.match(source, /ORBIT_API_ENDPOINTS\.tasks/);
  assert.match(source, /useState<RelationshipProgressMode>\("actions"\)/);
  assert.match(source, /label="待处理"/);
  assert.match(source, /label="按阶段"/);
  assert.match(source, /view\.actionItems\.slice\(0, 3\)/);
  assert.match(source, /router\.push\("\/tasks\?scope=relationship" as Href\)/);
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
