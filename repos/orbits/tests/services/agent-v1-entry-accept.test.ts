import assert from "node:assert/strict";
import test from "node:test";

import type { AgentSendInputContract } from "../../shared/contract/agent-v1";
import { agentV1EntryEnabled, readAgentV1Mode } from "../../features/agent-v1/entry/mode";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies, type AgentEntryExecuteResult } from "../../features/agent-v1/entry/service";
import { AgentEntryError, createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";

/**
 * AG01-1: the send answers before the model has finished (here: before it even returns), and a
 * resend with the same client message key returns the original request without a second run.
 */

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { open, opened };
}

function body(overrides: Partial<AgentSendInputContract> = {}): AgentSendInputContract {
  return { clientMessageId: "message:1", locale: "zh", message: "帮我想三个开场话题。", protocolVersion: 3, references: [], sessionId: "session:accept", ...overrides };
}

function stuckRuntime() {
  const release = gate();
  const calls: string[] = [];
  const deps: AgentEntryDependencies = {
    execute: async ({ input }): Promise<AgentEntryExecuteResult> => {
      calls.push(input.message);
      await release.opened;
      return { sourceRefs: [], text: `答：${input.message}` };
    },
    store: createMemoryAgentEntryStore(),
  };
  return { calls, deps, release };
}

test("ORBIT_AGENT_V1_MODE is off unless set to on; shadow is treated as off in AG01", () => {
  assert.equal(readAgentV1Mode({}), "off");
  assert.equal(readAgentV1Mode({ ORBIT_AGENT_V1_MODE: "ON" }), "on");
  assert.equal(readAgentV1Mode({ ORBIT_AGENT_V1_MODE: "shadow" }), "shadow");
  assert.equal(readAgentV1Mode({ ORBIT_AGENT_V1_MODE: "yes" }), "off");
  assert.equal(agentV1EntryEnabled({ ORBIT_AGENT_V1_MODE: "shadow" }), false);
  assert.equal(agentV1EntryEnabled({ ORBIT_AGENT_V1_MODE: "on" }), true);
});

test("the send returns requestId and status while the runtime is still stuck", async () => {
  const { calls, deps, release } = stuckRuntime();
  const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: body() });
  assert.match(receipt.requestId, /^agreq_[0-9a-f]{32}$/u);
  assert.equal(receipt.status, "running");
  assert.equal(receipt.receivedSeq, 1);
  assert.equal(receipt.replayed, false);
  // The answer is not there yet: the runtime has not returned.
  const during = await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId });
  assert.equal(during?.status, "running");
  assert.equal(during?.answer, null);
  release.open();
  await settleSession("actor:a", "session:accept");
  const done = await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId });
  assert.equal(done?.status, "completed");
  assert.equal(done?.answer?.text, "答：帮我想三个开场话题。");
  assert.equal(calls.length, 1);
});

test("a resend with the same message key returns the original request and is processed once", async () => {
  const { calls, deps, release } = stuckRuntime();
  const first = await acceptMessage(deps, { actorId: "actor:a", body: body({ sessionId: "session:resend" }) });
  const whileRunning = await acceptMessage(deps, { actorId: "actor:a", body: body({ sessionId: "session:resend" }) });
  assert.equal(whileRunning.receipt.requestId, first.receipt.requestId);
  assert.equal(whileRunning.receipt.replayed, true);
  assert.equal(whileRunning.receipt.status, "running");
  release.open();
  await settleSession("actor:a", "session:resend");
  const afterDone = await acceptMessage(deps, { actorId: "actor:a", body: body({ sessionId: "session:resend" }) });
  assert.equal(afterDone.receipt.requestId, first.receipt.requestId);
  assert.equal(afterDone.receipt.status, "completed");
  await settleSession("actor:a", "session:resend");
  assert.equal(calls.length, 1, "the runtime ran once for three sends of the same message");
});

test("the same message key with different content is refused, as REQUEST_ID_REUSED was before", async () => {
  const { deps, release } = stuckRuntime();
  await acceptMessage(deps, { actorId: "actor:a", body: body({ sessionId: "session:reuse" }) });
  await assert.rejects(acceptMessage(deps, { actorId: "actor:a", body: body({ message: "别的内容", sessionId: "session:reuse" }) }), (error: unknown) => error instanceof AgentEntryError && error.code === "REQUEST_ID_REUSED");
  release.open();
  await settleSession("actor:a", "session:reuse");
});

test("a message that arrives while another one runs is acknowledged as queued", async () => {
  const { deps, release } = stuckRuntime();
  const first = await acceptMessage(deps, { actorId: "actor:a", body: body({ sessionId: "session:queue" }) });
  const second = await acceptMessage(deps, { actorId: "actor:a", body: body({ clientMessageId: "message:2", message: "再问一句", sessionId: "session:queue" }) });
  assert.equal(first.receipt.status, "running");
  assert.equal(second.receipt.status, "queued");
  assert.equal(second.receipt.receivedSeq, 2);
  assert.notEqual(second.receipt.requestId, first.receipt.requestId);
  release.open();
  await settleSession("actor:a", "session:queue");
  assert.equal((await getRequestResult(deps, { actorId: "actor:a", requestId: second.receipt.requestId }))?.status, "completed");
});
