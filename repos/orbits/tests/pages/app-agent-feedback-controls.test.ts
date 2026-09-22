import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { iorbitChatSurfaceSource } from "./iorbit-chat-surface-source";

test("Settings retain result-learning controls without exposing them in chat", async () => {
  const [chat, feedback, settings, settingsContent] = await Promise.all([
    Promise.resolve(iorbitChatSurfaceSource()),
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
    // 个人中心 task 6: settings/orbit-settings-content.tsx was deleted; the
    // feedback module is mounted by profile-0918/profile-legacy-settings.tsx.
    readFile(
      new URL(
        "../../app/(app)/app/profile/profile-0918/profile-legacy-settings.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(chat, /<AgentOutcomeFeedback/);
  assert.match(feedback, /data-agent-feedback-rating/);
  assert.match(feedback, /data-agent-feedback-outcome/);
  assert.match(feedback, /encodeURIComponent\(runId\)/);
  assert.match(settingsContent, /<OrbitAgentFeedbackSettings/);
  assert.match(settings, /data-orbit-agent-feedback-settings/);
  assert.match(settings, /删除学习记录/);
});
