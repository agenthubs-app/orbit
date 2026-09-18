import assert from "node:assert/strict";
import test from "node:test";
import { runLiveOrbitAgentRuntime, type LiveOrbitAgentRuntime } from "../../features/orbit-ai/live-agent-runtime";
import type { OrbitAgentArtifactPayload } from "../../features/orbit-ai/artifact-contract";

const presentation = { preferredSurface: "inline_card", title: "候选结果" } as const;
const artifact: OrbitAgentArtifactPayload = {
  task: { artifactId: "artifact:qa", taskId: "task:qa", conversationId: "conversation:qa", kind: "contact_recommendations", status: "ready", artifactProducer: "contact_recommendation_producer", query: "点单助手", presentation, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" },
  result: {
    artifactId: "artifact:qa", taskId: "task:qa", kind: "contact_recommendations", status: "ready", presentation, nextAction: "先复核证据。",
    generatedView: { summary: "已匹配1位可复核候选人。", sections: [{ title: "匹配", items: [{ id: "contact-recommendation:contact:qa:one", title: "虚构候选甲", reason: "参与餐厅数字化测试项目", metadata: [], actions: [], evidenceIds: ["evidence:qa"] }] }] },
    provenance: { source: "synthetic-test", sourceModules: ["contacts"], evidenceIds: ["evidence:qa"], toolCalls: [], generatedAt: "2026-09-16T00:00:00.000Z", generationMethod: "artifact-producer-generated-view" },
    safety: { actionsRequireConfirmation: true, aiProviderRequested: false, calendarProviderRequested: false, domainWritesExecuted: false, emailProviderRequested: false, externalNetworkRequested: false, externalSideEffectsExecuted: false, liveDatabaseReadExecuted: true, liveDatabaseWriteExecuted: false, notificationDelivered: false }
  }
};

test("unexecuted service-scope guardrail preserves its truthful boundary reply", async () => {
  const fixture = fixtureRuntime(1);
  let plannerCalls = 0;
  fixture.runtime.planner.plan = async () => { plannerCalls++; throw new Error("guardrail must not call planner"); };
  const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "麻辣香锅怎么做？给我详细菜谱", locale: "zh" });
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.equal(plannerCalls, 0);
  assert.equal(fixture.synthesisCalls(), 0);
  assert.equal(result.artifacts.length, 0);
  assert.match(result.finalAssistantMessage, /不属于 Orbit|不会直接回答/u);
});

function fixtureRuntime(maxLoopSteps: number, synthesisReply: string | null = "模型总结保留。", value = artifact, intent: "contact_recommendations" | "self_profile" = "contact_recommendations") {
  let synthesisCalls = 0;
  const runtime: LiveOrbitAgentRuntime = {
    maxLoopSteps,
    artifactTaskService: { createArtifactTask: () => ({ success: true, data: structuredClone(value) }), getArtifactTask: () => ({ success: true, data: structuredClone(value) }) },
    planner: {
      async plan() { return { success: true, data: { intent, assistantMessage: "我来查找可能感兴趣的人。", actionRequests: [], toolRequests: [{ toolName: intent === "self_profile" ? "profile.getSelf" : "contacts.recommend", arguments: {}, requiresUserConfirmation: true }], model: "synthetic", provider: "gemini", source: "provider:gemini-interactions-api", rawOutputText: "" } }; },
      // Sprint 0085: this fixture never asks to create anything, so the draft
      // call must not be reached.
      async draftEntity() { return { reason: "api_key_missing" as const, success: false as const }; },
      async synthesize() {
        synthesisCalls++;
        if (synthesisReply === null) return { success: false, error: { code: "MODEL_REQUEST_FAILED", message: "synthetic failure", provider: "gemini", source: "provider:gemini-interactions-api" } };
        return { success: true, data: { assistantMessage: synthesisReply, model: "synthetic", provider: "gemini", source: "provider:gemini-interactions-api", rawOutputText: "" } };
      }
    }
  };
  return { runtime, synthesisCalls: () => synthesisCalls };
}

test("loop-two actual runtime summarizes completed contact evidence without a synthesis call", async () => {
  const fixture = fixtureRuntime(2);
  const before = JSON.stringify(artifact);
  const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "我准备做点单助手，谁可能想聊聊？", locale: "zh" });
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.equal(fixture.synthesisCalls(), 0);
  assert.equal(result.synthesisResult, null);
  assert.equal(result.shouldSynthesizeAfterTools, false);
  assert.match(result.finalAssistantMessage, /虚构候选甲/u);
  assert.match(result.finalAssistantMessage, /餐厅数字化测试项目/u);
  assert.ok(result.finalAssistantMessage.includes(artifact.result.generatedView!.summary));
  assert.equal(JSON.stringify(artifact), before);
});

test("loop-three successful nonempty synthesis remains the real final reply", async () => {
  const fixture = fixtureRuntime(3);
  const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "点单助手项目想找人讨论。", locale: "zh" });
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.equal(fixture.synthesisCalls(), 1);
  assert.equal(result.finalAssistantMessage, "模型总结保留。");
  assert.equal(result.synthesisResult?.success, true);
  assert.equal(result.shouldSynthesizeAfterTools, true);
});

for (const reply of [null, "", "   "]) {
  test(`loop-three ${reply === null ? "failed" : "empty"} synthesis falls back to actual candidate evidence without rewriting diagnostics`, async () => {
    const fixture = fixtureRuntime(3, reply);
    const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "点单助手项目想找人讨论。", locale: "zh" });
    assert.equal(result.state, "completed");
    if (result.state !== "completed") return;
    assert.equal(fixture.synthesisCalls(), 1);
    assert.match(result.finalAssistantMessage, /虚构候选甲/u);
    assert.equal(result.synthesisResult?.success, reply !== null);
    assert.equal(result.shouldSynthesizeAfterTools, true);
  });
}

for (const status of ["pending", "failed"] as const) {
  test(`nonready ${status} contact artifacts never claim completed matches`, async () => {
    const value = structuredClone(artifact);
    value.task.status = status; value.result.status = status; value.result.generatedView = null;
    const fixture = fixtureRuntime(2, null, value, value.task.kind === "self_profile" ? "self_profile" : "contact_recommendations");
    const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "点单助手项目想找人讨论。", locale: "zh" });
    assert.equal(result.state, "completed");
    if (result.state !== "completed") return;
    assert.doesNotMatch(result.finalAssistantMessage, /虚构候选甲|已匹配/u);
    assert.equal(fixture.synthesisCalls(), 0);
  });
}

test("empty ready results never claim candidates, and noncontact private profile content is not used by the fallback", async () => {
  const empty = structuredClone(artifact); empty.result.generatedView!.sections = [];
  const profile = structuredClone(artifact); profile.task.kind = profile.result.kind = "self_profile";
  profile.task.artifactProducer = "self_profile_reader";
  profile.result.generatedView!.summary = "PRIVATE_PROFILE_DO_NOT_DISPLAY";
  profile.result.generatedView!.sections[0]!.items[0]!.title = "PRIVATE_PROFILE_DO_NOT_DISPLAY";
  for (const value of [empty, profile]) {
    const fixture = fixtureRuntime(2, null, value, value.task.kind === "self_profile" ? "self_profile" : "contact_recommendations");
    const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "点单助手项目想找人讨论。", locale: "zh" });
    assert.equal(result.state, "completed");
    if (result.state !== "completed") return;
    if (value.task.kind === "self_profile") assert.equal(result.finalAssistantMessage, "我来查找可能感兴趣的人。");
    assert.doesNotMatch(result.finalAssistantMessage, /PRIVATE_PROFILE|已匹配/u);
    assert.equal(fixture.synthesisCalls(), 0);
  }
});

for (const status of ["empty", "pending", "failed"] as const) {
  test(`unverified planner count is never retained when actual contact tool state is ${status}`, async () => {
    const value = structuredClone(artifact);
    if (status === "empty") value.result.generatedView!.sections = [];
    else { value.task.status = value.result.status = status; value.result.generatedView = null; }
    const fixture = fixtureRuntime(2, null, value);
    const plan = fixture.runtime.planner.plan;
    fixture.runtime.planner.plan = async input => { const result = await plan(input); if (result.success) result.data.assistantMessage = "已找到8位有兴趣的候选人。"; return result; };
    const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "点单助手项目想找人讨论。", locale: "zh" });
    assert.equal(result.state, "completed");
    if (result.state !== "completed") return;
    assert.doesNotMatch(result.finalAssistantMessage, /已找到8位|已匹配|有兴趣的候选人/u);
    assert.match(result.finalAssistantMessage, status === "empty" ? /没有匹配/u : status === "pending" ? /尚未完成/u : /失败/u);
    assert.equal(fixture.synthesisCalls(), 0);
  });
}

test("ready candidates without evidence references do not claim evidence exists", async () => {
  const value = structuredClone(artifact); value.result.generatedView!.summary = "";
  value.result.generatedView!.sections[0]!.items[0]!.evidenceIds = [];
  const fixture = fixtureRuntime(2, null, value);
  const result = await runLiveOrbitAgentRuntime(fixture.runtime, { message: "点单助手项目想找人讨论。", locale: "zh" });
  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.match(result.finalAssistantMessage, /虚构候选甲/u);
  assert.doesNotMatch(result.finalAssistantMessage, /有关系证据|有证据支撑/u);
});
