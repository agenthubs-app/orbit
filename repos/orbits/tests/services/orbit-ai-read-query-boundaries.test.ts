import assert from "node:assert/strict";
import test from "node:test";
import { createLiveOrbitAgentLocalBoundaryPayload } from "../../features/orbit-ai/live-agent-runtime";

for (const message of [
  "只读查询我的待办 task:4d52f8933ae91e7df909b870，返回标题和当前状态。不要创建任务或发送消息。验收标记：连续第二轮20260917。",
  "查询我今天的待办。不要发送消息。",
  "查询当前跟进状态，请不要创建任务或发送消息。",
]) {
  test(`negated messaging does not turn an internal read into realtime news: ${message}`, () => {
    assert.equal(createLiveOrbitAgentLocalBoundaryPayload(message), null);
  });
}

for (const message of [
  "查一下今天 OpenAI 的最新新闻。不要创建任务或发送消息。",
  "查询当前天气，不要发送消息。",
  "Tell me the current exchange rate. Do not create a task.",
]) {
  test(`unsupported external realtime reads remain local: ${message}`, () => {
    const result = createLiveOrbitAgentLocalBoundaryPayload(message);
    assert.equal(result?.provenance.source, "local:orbit-agent-unsupported-realtime-boundary");
    assert.equal(result?.provenance.safety.externalNetworkRequested, false);
  });
}
