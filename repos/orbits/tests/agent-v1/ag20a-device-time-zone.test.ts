import assert from "node:assert/strict";
import { test } from "node:test";

import { agentSendInputSchema } from "../../shared/api-schema/agent-v1";
import { entryTimeZone } from "../../features/agent-v1/entry/time-zone";
import { agentEntryFingerprint } from "../../features/agent-v1/entry/store";
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { createCardKit } from "../services/agent-ledger-card-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { byNode } from "./functions-kit";

/**
 * agent-design AG20a, owner's decision 8 of 2026-11-20 (设计稿 §3.1 "客户端可以表达时区偏好，服务端校验后固定本轮基准"):
 * the entry carries the device's time zone; the server checks it and makes it the turn's base for "今天", "周五", "下午三点";
 * absent or not a real zone, the deployment's zone, exactly as before. Old clients that send nothing behave as today.
 */

const BASE = { clientMessageId: "m1", locale: "zh", message: "今天做", protocolVersion: 3, references: [], sessionId: "s1" };

test("the schema takes an optional zone; the server keeps only a real one", () => {
  assert.equal(agentSendInputSchema.safeParse(BASE).success, true, "an old client sends none");
  assert.equal(agentSendInputSchema.safeParse({ ...BASE, timeZone: "America/Los_Angeles" }).success, true);
  assert.equal(agentSendInputSchema.safeParse({ ...BASE, timeZone: "x".repeat(65) }).success, false);
  assert.deepEqual(entryTimeZone("America/Los_Angeles", "Asia/Tokyo"), { from: "device", zone: "America/Los_Angeles" });
  assert.deepEqual(entryTimeZone("UTC", "Asia/Tokyo"), { from: "device", zone: "UTC" });
  for (const bad of [undefined, null, "", "Mars/Olympus", "Asia/Tokyo; drop", 42, "../etc"]) assert.deepEqual(entryTimeZone(bad, "Asia/Tokyo"), { from: "deployment", zone: "Asia/Tokyo" }, String(bad));
});

test("a message sent without a zone keeps the fingerprint it had (a retry of an old client is the same message)", () => {
  const input = { locale: "zh" as const, message: "今天做", references: [] };
  assert.equal(agentEntryFingerprint("s1", "m1", input), agentEntryFingerprint("s1", "m1", { ...input, timeZone: "America/Los_Angeles" } as never), "the zone is not part of what makes it the same message");
});

async function plannedDayFor(timeZone: string | undefined): Promise<string | null> {
  const kit = createCardKit({ start: "2026-11-15T01:00:00.000Z" });
  const message = "新建一条待办：寄回样片，今天做。";
  const understood = json({ language: "zh", parts: [part({ deliverable: "change", requiredCapabilities: ["todo.create"], sourceQuote: message })], plainChat: false });
  const proposed = json({ operations: [{ dateText: "今天", dependsOn: [], entity: "todo", fields: [{ name: "title", valueText: "寄回样片" }], localId: "w1", partId: "p1", verb: "create" }] });
  const model = deepseekStub(byNode({ propose: () => proposed, understand: () => understood }));
  // 2026-11-15 01:00 UTC: Sunday 10:00 in Tokyo, still Saturday 17:00 in Los Angeles.
  const graph = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf({ events: [], records: [] }) });
  const store = createMemoryAgentEntryStore();
  const deps: AgentEntryDependencies = { execute: createGraphExecutor("mock", { ...graph.deps, entryStore: store, runtime: kit.runtime }), schedule: (task) => { void task(); }, sessions: null, store };
  const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: "m:tz", locale: "zh", message, protocolVersion: 3, references: [], sessionId: "session:tz", ...(timeZone ? { timeZone } : {}) } });
  await settleSession("actor:a", "session:tz");
  const doc = await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId });
  const after = doc?.actionPreview?.operations[0]?.after as { plannedDate?: string } | undefined;
  return after?.plannedDate ?? null;
}

test("'今天' is the device's today when the device says its zone; without one, the deployment's (as before)", async () => {
  const before = process.env.ORBIT_DEFAULT_TIME_ZONE;
  process.env.ORBIT_DEFAULT_TIME_ZONE = "Asia/Tokyo";
  try {
    assert.equal(await plannedDayFor("America/Los_Angeles"), "2026-11-14");
    assert.equal(await plannedDayFor(undefined), "2026-11-15");
    assert.equal(await plannedDayFor("Not/AZone"), "2026-11-15", "an invalid zone falls back");
  } finally {
    if (before === undefined) delete process.env.ORBIT_DEFAULT_TIME_ZONE;
    else process.env.ORBIT_DEFAULT_TIME_ZONE = before;
  }
});
