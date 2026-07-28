import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AgentActionsScreen.tsx"),
  "utf8"
);

test("agent actions screen excludes fixed external-action sandbox fixtures", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.agentActions/u);
  assert.match(screenSource, /agentActionAcceptPath/u);
  assert.match(screenSource, /agentActionDismissPath/u);
  assert.doesNotMatch(
    screenSource,
    /externalActionSandbox|ExternalActionSandbox|确认沙盒发送|批准确认|拒绝确认/u
  );
});
