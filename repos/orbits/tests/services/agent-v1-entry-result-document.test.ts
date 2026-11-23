import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitAgentChatSessionHandlers } from "../../app/api/ai/conversations/sessions/[id]/handler";
import { readAgentV1RequestDocument } from "../../features/agent-v1/entry/http";
import { createSessionWriter } from "../../features/agent-v1/entry/legacy-runtime";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

/**
 * AG01-3: one result document per requestId, read the same way by every client (the session GET
 * with ?requestId=). Mid-run it holds what is done so far, at the end everything; another
 * account reading the same requestId gets nothing.
 */

const ACTOR = "actor:owner";
const OTHER = "actor:other";
const SESSION = "session:doc";

function setup() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  const records = createMemoryLiveRecordStore<Record<string, unknown>>();
  const providerFor = (actorId: string) => createStorageOrbitAgentChatSessionProvider({ actorId, store: records, workspaceId: "workspace:doc" });
  const deps: AgentEntryDependencies = {
    execute: async ({ input }) => {
      await opened;
      return { sourceRefs: ["note:N1"], text: `11 月 19 日中午有“和田中午餐”。（${input.message}）` };
    },
    sessions: createSessionWriter(providerFor(ACTOR)),
    store: createMemoryAgentEntryStore(),
  };
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  process.env.ORBIT_AGENT_V1_MODE = "on";
  const handlersFor = (actorId: string) => createOrbitAgentChatSessionHandlers({
    agentRequestReader: (input) => readAgentV1RequestDocument({ ...input, dependencies: deps }),
    artifactReaderForActor: () => null,
    organizationStoreForActor: () => null,
    providerForActor: () => providerFor(actorId),
    requestStoreForActor: () => null,
    resolveActor: async () => ({ id: actorId }) as never,
  });
  const restore = () => {
    if (previous === undefined) delete process.env.ORBIT_AGENT_V1_MODE;
    else process.env.ORBIT_AGENT_V1_MODE = previous;
  };
  return { deps, handlersFor, release, restore };
}

async function readBack(handlers: ReturnType<typeof createOrbitAgentChatSessionHandlers>, requestId: string, sessionId = SESSION) {
  const response = await handlers.GET(new Request(`http://orbit.local/api/ai/conversations/sessions/${sessionId}?requestId=${encodeURIComponent(requestId)}`), { params: Promise.resolve({ id: sessionId }) });
  return { body: await response.json(), status: response.status };
}

test("mid-run the document shows the request running with no answer yet; at the end it has the answer", async () => {
  const { deps, handlersFor, release, restore } = setup();
  try {
    const { receipt } = await acceptMessage(deps, { actorId: ACTOR, body: { clientMessageId: "m1", locale: "zh", message: "11 月 19 日中午我有什么安排？", protocolVersion: 3, references: [], sessionId: SESSION } });
    const during = await readBack(handlersFor(ACTOR), receipt.requestId);
    assert.equal(during.status, 200);
    assert.equal(during.body.data.agentRequest.status, "running");
    assert.equal(during.body.data.agentRequest.answer, null);
    assert.equal(during.body.data.reliableSend, undefined);

    release();
    await settleSession(ACTOR, SESSION);
    const done = await readBack(handlersFor(ACTOR), receipt.requestId);
    const direct = await getRequestResult(deps, { actorId: ACTOR, requestId: receipt.requestId });
    assert.deepEqual(done.body.data.agentRequest, direct, "the route returns the stored document as is");
    assert.equal(direct?.status, "completed");
    assert.match(direct!.answer!.text, /和田中午餐/u);
    assert.deepEqual(direct?.partResults, [{ partId: "p1", status: "answered" }]);
    // The turn is in the session history too (for the next turn's context), but that is not the delivery.
    assert.deepEqual(done.body.data.session.messages.map((message: { role: string }) => message.role), ["user", "assistant"]);
  } finally {
    restore();
  }
});

test("two devices reading the same requestId get the same document; another account gets none", async () => {
  const { deps, handlersFor, release, restore } = setup();
  try {
    release();
    const { receipt } = await acceptMessage(deps, { actorId: ACTOR, body: { clientMessageId: "m2", locale: "zh", message: "问", protocolVersion: 3, references: [], sessionId: SESSION } });
    await settleSession(ACTOR, SESSION);
    const web = await readBack(handlersFor(ACTOR), receipt.requestId);
    const app = await readBack(handlersFor(ACTOR), receipt.requestId);
    assert.deepEqual(web.body.data.agentRequest, app.body.data.agentRequest);

    const other = await readBack(handlersFor(OTHER), receipt.requestId);
    assert.equal(other.body.data?.agentRequest, undefined);
    assert.equal(await getRequestResult(deps, { actorId: OTHER, requestId: receipt.requestId }), null);
    // The requestId read under a different session id is not handed out either.
    assert.equal(await readAgentV1RequestDocument({ actorId: ACTOR, dependencies: deps, mode: "live", requestId: receipt.requestId, sessionId: "session:elsewhere" }), null);
  } finally {
    restore();
  }
});

test("with the switch off the session GET answers as before and never reads a protocol-3 document", async () => {
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  delete process.env.ORBIT_AGENT_V1_MODE;
  try {
    let read = 0;
    const handlers = createOrbitAgentChatSessionHandlers({
      agentRequestReader: async (input) => {
        read += 1;
        return readAgentV1RequestDocument({ ...input, dependencies: null });
      },
      artifactReaderForActor: () => null,
      organizationStoreForActor: () => null,
      providerForActor: () => null,
      requestStoreForActor: () => null,
      resolveActor: async () => ({ id: ACTOR }) as never,
    });
    const response = await handlers.GET(new Request(`http://orbit.local/x?requestId=agreq_x`), { params: Promise.resolve({ id: SESSION }) });
    const body = await response.json();
    assert.deepEqual(body.data, { session: null, storage: { configured: false, persisted: false } });
    assert.equal(read, 1);
  } finally {
    if (previous !== undefined) process.env.ORBIT_AGENT_V1_MODE = previous;
  }
});
