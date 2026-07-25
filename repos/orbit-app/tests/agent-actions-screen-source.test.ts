import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AgentActionsScreen.tsx"),
  "utf8"
);

test("agent actions screen shows web external action sandbox audit and no-op send confirmation", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.externalActionSandboxAudit/u);
  assert.match(screenSource, /externalActionSandboxSendMessagePath/u);
  assert.match(screenSource, /buildExternalActionConfirmationDecisionRequest/u);
  assert.match(screenSource, /externalActionConfirmationDecisionToView/u);
  assert.match(screenSource, /externalActionSandboxToView/u);
  assert.match(screenSource, /externalActionNoOpToView/u);
  assert.match(screenSource, /buildExternalActionSendMessageRequest/u);
  assert.match(
    screenSource,
    /useApiResource<unknown>\(\s*ORBIT_API_ENDPOINTS\.externalActionSandboxAudit/u
  );
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*externalActionSandboxSendMessagePath\(\)/u
  );
  assert.match(screenSource, /"对外动作确认"/u);
  assert.match(screenSource, /确认历史/u);
  assert.match(screenSource, /"确认沙盒发送"/u);
  assert.match(screenSource, /"批准确认"/u);
  assert.match(screenSource, /"拒绝确认"/u);
  assert.match(screenSource, /pendingConfirmationDecision/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*request\.request\.path/u);
  assert.match(screenSource, /audit\.contextLines\.map/u);
  assert.match(screenSource, /audit\.safetyText/u);
  assert.match(screenSource, /audit\.evidenceLabel/u);
  assert.doesNotMatch(screenSource, /真实发送|已发送给/u);
});
