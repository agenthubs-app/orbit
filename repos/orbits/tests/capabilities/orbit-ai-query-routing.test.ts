import assert from "node:assert/strict";
import test from "node:test";

import { executeOrbitAgentTool, getOrbitAgentToolMetadata } from "../../features/orbit-ai/agent-tools/registry";
import { validateGeminiOrbitAgentPlannerOutput } from "../../features/orbit-ai/gemini-provider";
import { artifactKindForTool, routingDecisionFromPlannerIntent, toolNameForIntent } from "../../features/orbit-ai/live-agent-runtime";

const cases = [
  { intent: "notes_query", message: "查找我的项目笔记", toolName: "notes.query", family: "notes" },
  { intent: "tasks_query", message: "Show my open tasks", toolName: "tasks.query", family: "tasks" },
  { intent: "followups_query", message: "保存済みのフォローアップを見せて", toolName: "followups.query", family: "followups" },
  { intent: "schedule_query", message: "今週の予定を見せて", toolName: "schedule.query", family: "schedule" },
] as const;

test("query intents in Chinese, English, and Japanese route to one minimal data domain", () => {
  for (const item of cases) {
    const parsed = validateGeminiOrbitAgentPlannerOutput({
      actionRequests: [],
      assistantMessage: item.message,
      intent: item.intent,
      toolRequests: [{
        arguments: { operation: "list" },
        requiresUserConfirmation: true,
        toolName: item.toolName,
      }],
    });
    assert.ok(parsed);
    assert.equal(parsed.toolRequests.length, 1);
    assert.equal(toolNameForIntent(parsed.intent), item.toolName);
    assert.equal(routingDecisionFromPlannerIntent(parsed.intent).toolFamily, item.family);
    assert.equal(artifactKindForTool(item.toolName), "data_query");
  }
  assert.equal(validateGeminiOrbitAgentPlannerOutput({
    actionRequests: [],
    assistantMessage: "Show my notes",
    intent: "notes_query",
    toolRequests: [{ arguments: { operation: "list" }, requiresUserConfirmation: true, toolName: "tasks.query" }],
  }), null);
});

test("registered query tools enforce their field allowlists before execution", async () => {
  assert.equal(getOrbitAgentToolMetadata("notes.query")?.requiresConfirmation, false);
  let executed = false;
  await assert.rejects(executeOrbitAgentTool({
    arguments: { actorId: "actor:b", operation: "list", query: "My notes" },
    context: {
      mode: "live",
      async executeArtifactTool() {
        executed = true;
        throw new Error("must not execute");
      },
    },
    toolName: "notes.query",
  }), /Invalid input for notes\.query/);
  assert.equal(executed, false);
});
