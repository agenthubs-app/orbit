import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveOrbitAgentRuntime,
  requestsMessageDraft,
  runLiveOrbitAgentRuntime,
} from "../../features/orbit-ai/live-agent-runtime";
import type { OrbitAgentArtifactTaskService } from "../../features/orbit-ai/service";

// QA-A3 2026-10-26: "@高橋智子 帮我起草一封邮件…" ended with the planner's "我先查一下…然后…起草"
// and no draft, when the writer step timed out or the lookup returned nothing.
const PLAN_PROMISE = "我先查一下你和高橋智子的关系记录，然后按你们的情况来起草。";
const DRAFT = "**主题：下周二喝杯咖啡**\n\n高橋女士，您好：……\n\n[待补充：你的姓名]\n\n这封邮件还没有发送。";

const noArtifacts: OrbitAgentArtifactTaskService = {
  createArtifactTask: async () => ({
    success: false,
    error: { code: "ARTIFACT_UNAVAILABLE", message: "unavailable" },
  }) as never,
  getArtifactTask: async () => ({
    success: false,
    error: { code: "ARTIFACT_UNAVAILABLE", message: "unavailable" },
  }) as never,
};

function setup(synthesisReplies: Array<"fail" | "empty" | string>) {
  const runtime = createLiveOrbitAgentRuntime({ artifactTaskService: noArtifacts, maxLoopSteps: 3 });
  runtime.planner.plan = async () => ({ success: true, data: {
    assistantMessage: PLAN_PROMISE, intent: "relationship_chat_context", actionRequests: [],
    toolRequests: [{ toolName: "chat.context", requiresUserConfirmation: true, arguments: { searchTerms: "高橋智子" } }],
    model: "fake", provider: "deepseek", rawOutputText: "", source: "provider:deepseek-chat-completions",
  } }) as never;
  const synthesisCalls: Array<{ intent?: string }> = [];
  runtime.planner.synthesize = async (input) => {
    synthesisCalls.push({ intent: input.intent });
    const reply = synthesisReplies.shift() ?? "fail";
    if (reply === "fail") {
      return { success: false, error: {
        code: "MODEL_REQUEST_FAILED", message: "deepseek request timed out after 20000ms.",
        provider: "deepseek", source: "provider:deepseek-chat-completions",
      } } as never;
    }
    return { success: true, data: {
      assistantMessage: reply === "empty" ? "  " : reply,
      model: "fake", provider: "deepseek", rawOutputText: reply, source: "provider:deepseek-chat-completions",
    } } as never;
  };
  runtime.planner.draftEntity = async () => { throw new Error("a message draft is not a record"); };
  return { runtime, synthesisCalls };
}

const MESSAGE = "@高橋智子 帮我起草一封邮件，约她下周二下午喝咖啡聊聊合作";

test("a draft request with no tool result still gets the written draft", async () => {
  const { runtime, synthesisCalls } = setup([DRAFT]);
  const result = await runLiveOrbitAgentRuntime(runtime, { locale: "zh", message: MESSAGE });
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.equal(result.finalAssistantMessage, DRAFT);
  assert.doesNotMatch(result.finalAssistantMessage, /我先查一下/);
  assert.equal(synthesisCalls.length, 1);
  // No card is shown for a message draft, so the writer is told the reply is everything.
  assert.equal(synthesisCalls[0].intent, "relationship_chat_context");
});

test("a failed draft write is retried once", async () => {
  const { runtime, synthesisCalls } = setup(["fail", DRAFT]);
  const result = await runLiveOrbitAgentRuntime(runtime, { locale: "zh", message: MESSAGE });
  assert.equal(result.state, "completed");
  if (result.state === "completed") assert.equal(result.finalAssistantMessage, DRAFT);
  assert.equal(synthesisCalls.length, 2);
});

test("a draft that cannot be written fails visibly instead of returning the plan", async () => {
  for (const replies of [["fail", "fail"], ["empty", "empty"]] as const) {
    const { runtime, synthesisCalls } = setup([...replies]);
    const result = await runLiveOrbitAgentRuntime(runtime, { locale: "zh", message: MESSAGE });
    assert.equal(result.state, "planner_failure");
    if (result.state === "planner_failure") {
      assert.equal(result.failureResult.success, false);
      assert.equal(result.failureResult.error.code, "ORBIT_AGENT_PROVIDER_REQUEST_FAILED");
    }
    assert.equal(synthesisCalls.length, 2);
  }
});

test("other requests keep the plan reply when no tool returned anything", async () => {
  const { runtime, synthesisCalls } = setup([]);
  const result = await runLiveOrbitAgentRuntime(runtime, { locale: "zh", message: "我为什么认识高橋智子？" });
  assert.equal(result.state, "completed");
  if (result.state === "completed") assert.equal(result.finalAssistantMessage, PLAN_PROMISE);
  assert.equal(synthesisCalls.length, 0);
});

test("draft request detection", () => {
  for (const message of [
    MESSAGE,
    "帮我写一条跟进消息给 Maya",
    "回复她的邮件，语气客气一点",
    "Please polish this draft to @QA Kato",
    "Draft an email to Ken about Tuesday",
    "高橋さんにメールを書いて",
  ]) assert.equal(requestsMessageDraft(message), true, message);
  for (const message of [
    "我为什么认识高橋智子？",
    "保存这段消息草稿：明天见",
    "帮我建一个日程：周四下午3点和林玫开会",
    "最近有哪些活动适合我？",
    "不要写邮件，帮我看看本周该跟进谁",
  ]) assert.equal(requestsMessageDraft(message), false, message);
});
