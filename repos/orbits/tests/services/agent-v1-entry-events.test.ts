import assert from "node:assert/strict";
import test from "node:test";

import type { AgentResultDocument, AgentSessionEventContract } from "../../shared/contract/agent-v1";
import { documentsFromEvents, reconcileClientView } from "../../features/agent-v1/entry/client-view";
import { handleAgentV1Events } from "../../features/agent-v1/entry/http";
import { acceptMessage, cancelCurrentRun, getRequestResult, listSessionEvents, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";

/**
 * AG01-4: the channel is resumable by sequence number (a reconnect with the last seq gets only the
 * events after it, never a replay from the start), and a fragment seen only on the channel that the
 * stored document does not hold counts as not delivered.
 */

function deps(): AgentEntryDependencies {
  return { execute: async ({ input }) => ({ sourceRefs: [], text: `答：${input.message}` }), store: createMemoryAgentEntryStore() };
}

async function twoTurns(dependencies: AgentEntryDependencies, actorId: string, sessionId: string) {
  const first = await acceptMessage(dependencies, { actorId, body: { clientMessageId: "m1", locale: "zh", message: "一", protocolVersion: 3, references: [], sessionId } });
  await settleSession(actorId, sessionId);
  const second = await acceptMessage(dependencies, { actorId, body: { clientMessageId: "m2", locale: "zh", message: "二", protocolVersion: 3, references: [], sessionId } });
  await settleSession(actorId, sessionId);
  return [first.receipt.requestId, second.receipt.requestId];
}

test("events carry increasing seqs; reading after a seq returns only the later ones; other accounts see none", async () => {
  const dependencies = deps();
  const [first, second] = await twoTurns(dependencies, "actor:a", "session:events");
  const all = await listSessionEvents(dependencies, { actorId: "actor:a", afterSeq: 0, sessionId: "session:events" });
  assert.deepEqual(all.events.map((event) => event.seq), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(all.events.map((event) => `${event.requestId === first ? "1" : "2"}:${event.kind}:${event.status}`), [
    "1:accepted:queued", "1:status:running", "1:document:completed",
    "2:accepted:queued", "2:status:running", "2:document:completed",
  ]);
  const later = await listSessionEvents(dependencies, { actorId: "actor:a", afterSeq: 3, sessionId: "session:events" });
  assert.deepEqual(later.events.map((event) => event.seq), [4, 5, 6]);
  assert.ok(later.events.every((event) => event.requestId === second));
  assert.equal(later.lastSeq, 6);
  const none = await listSessionEvents(dependencies, { actorId: "actor:a", afterSeq: 6, sessionId: "session:events" });
  assert.deepEqual(none.events, []);
  assert.equal(none.lastSeq, 6);
  assert.deepEqual((await listSessionEvents(dependencies, { actorId: "actor:b", afterSeq: 0, sessionId: "session:events" })).events, []);
});

function parseFrames(text: string): AgentSessionEventContract[] {
  return text.split("\n\n").flatMap((frame) => {
    const data = frame.split("\n").find((line) => line.startsWith("data: "));
    return data ? [JSON.parse(data.slice(6)) as AgentSessionEventContract] : [];
  });
}

async function readStream(response: Response, until: (events: AgentSessionEventContract[]) => boolean): Promise<AgentSessionEventContract[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (until(parseFrames(text))) break;
  }
  await reader.cancel();
  return parseFrames(text);
}

test("the event stream resumes after Last-Event-ID instead of starting over", async () => {
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  process.env.ORBIT_AGENT_V1_MODE = "on";
  try {
    const dependencies = deps();
    await twoTurns(dependencies, "actor:a", "session:stream");
    const open = (headers: Record<string, string>) => handleAgentV1Events(
      new Request("http://orbit.local/api/ai/conversations/sessions/session:stream/events", { headers: { accept: "text/event-stream", ...headers } }),
      { actorId: "actor:a", dependencies, maxStreamMs: 2_000, mode: "live", pollMs: 10, sessionId: "session:stream" },
    );
    const firstConnection = await open({});
    assert.equal(firstConnection.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const beforeDrop = await readStream(firstConnection, (events) => events.length >= 2);
    const lastSeen = beforeDrop[beforeDrop.length - 1].seq;
    const resumed = await readStream(await open({ "last-event-id": String(lastSeen) }), (events) => events.some((event) => event.seq === 6));
    assert.ok(resumed.every((event) => event.seq > lastSeen), "nothing at or before the last seen seq is sent again");
    const seen = [...beforeDrop, ...resumed].map((event) => event.seq);
    assert.equal(new Set(seen).size, seen.length);
    assert.deepEqual(seen.slice(0, 6).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);

    const json = await handleAgentV1Events(new Request("http://orbit.local/x?after=4"), { actorId: "actor:a", dependencies, mode: "live", sessionId: "session:stream" });
    const page = await json.json();
    assert.deepEqual(page.data.events.map((event: AgentSessionEventContract) => event.seq), [5, 6]);
    const bad = await handleAgentV1Events(new Request("http://orbit.local/x?after=-1"), { actorId: "actor:a", dependencies, mode: "live", sessionId: "session:stream" });
    assert.equal(bad.status, 400);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_AGENT_V1_MODE;
    else process.env.ORBIT_AGENT_V1_MODE = previous;
  }
});

test("the channel is closed while the switch is off", async () => {
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  delete process.env.ORBIT_AGENT_V1_MODE;
  try {
    const response = await handleAgentV1Events(new Request("http://orbit.local/x"), { actorId: "actor:a", dependencies: deps(), mode: "live", sessionId: "s" });
    assert.equal(response.status, 404);
  } finally {
    if (previous !== undefined) process.env.ORBIT_AGENT_V1_MODE = previous;
  }
});

test("what was only on the channel and is not in the stored document is not delivered", async () => {
  const stored: AgentResultDocument = { answer: null, ending: { at: "2026-11-15T10:00:05.000Z", kind: "stopped_by_user" }, partResults: [], requestId: "r1", revision: 3, schemaVersion: 1, sessionId: "s", status: "cancelled", updatedAt: "2026-11-15T10:00:05.000Z" };
  const channelOnly: AgentResultDocument = { ...stored, answer: { sourceRefs: [], text: "第一句话……" }, ending: undefined, status: "running", updatedAt: "2026-11-15T10:00:04.000Z" };
  const received = documentsFromEvents([
    { at: "t", document: { ...stored, revision: 2, status: "running", answer: null, ending: undefined }, kind: "document", requestId: "r1", seq: 2, sessionId: "s", status: "running" },
    { at: "t", document: channelOnly, kind: "document", requestId: "r1", seq: 3, sessionId: "s", status: "running" },
  ]);
  const { show, undelivered } = reconcileClientView(received, new Map([["r1", stored]]));
  assert.deepEqual(undelivered, [{ requestId: "r1", revision: 3, status: "running", text: "第一句话……" }]);
  assert.deepEqual(show.get("r1"), stored, "the client shows the stored document, without the channel-only text");

  const same = reconcileClientView(new Map([["r1", stored]]), new Map([["r1", stored]]));
  assert.deepEqual(same.undelivered, []);
});

test("after a stop, the documents read back by requestId equal what the channel delivered last", async () => {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  const dependencies: AgentEntryDependencies = {
    execute: async () => {
      await opened;
      return { sourceRefs: [], text: "迟到" };
    },
    store: createMemoryAgentEntryStore(),
  };
  const accepted = await acceptMessage(dependencies, { actorId: "actor:a", body: { clientMessageId: "m1", locale: "zh", message: "长", protocolVersion: 3, references: [], sessionId: "s:stop" } });
  await cancelCurrentRun(dependencies, { actorId: "actor:a", requestId: accepted.receipt.requestId });
  release();
  await settleSession("actor:a", "s:stop");
  const events = await listSessionEvents(dependencies, { actorId: "actor:a", afterSeq: 0, sessionId: "s:stop" });
  const stored = await getRequestResult(dependencies, { actorId: "actor:a", requestId: accepted.receipt.requestId });
  const { undelivered } = reconcileClientView(documentsFromEvents(events.events), new Map([[accepted.receipt.requestId, stored!]]));
  assert.deepEqual(undelivered, []);
  assert.equal(stored?.status, "cancelled");
  assert.equal(events.events.some((event) => event.document?.answer?.text === "迟到"), false, "the late answer never reached the channel either");
});
