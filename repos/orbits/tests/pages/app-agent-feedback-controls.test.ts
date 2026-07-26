import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Agent chat and Settings expose explicit result-learning controls", async () => {
  const [chat, feedback, settings, settingsContent] = await Promise.all([
    readFile(
      new URL(
        "../../app/(app)/app/agent/orbit-real-agent.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(app)/app/agent/agent-outcome-feedback.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(app)/app/settings/orbit-agent-feedback-settings.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(app)/app/settings/orbit-settings-content.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(chat, /<AgentOutcomeFeedback/);
  assert.match(feedback, /data-agent-feedback-rating/);
  assert.match(feedback, /data-agent-feedback-outcome/);
  assert.match(feedback, /encodeURIComponent\(runId\)/);
  assert.match(settingsContent, /<OrbitAgentFeedbackSettings/);
  assert.match(settings, /data-orbit-agent-feedback-settings/);
  assert.match(settings, /删除学习记录/);
});
