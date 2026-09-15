import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

function withSessionApiEnv<TValue>(
  mode: "live" | "mock",
  run: () => Promise<TValue>,
): Promise<TValue> {
  const previous = {
    ORBIT_DATABASE_URL: process.env.ORBIT_DATABASE_URL,
    ORBIT_EVENT_DATABASE_URL: process.env.ORBIT_EVENT_DATABASE_URL,
    ORBIT_FEATURE_MODE: process.env.ORBIT_FEATURE_MODE,
    ORBIT_LIVE_DATABASE_URL: process.env.ORBIT_LIVE_DATABASE_URL,
    ORBIT_MODULE_MODE: process.env.ORBIT_MODULE_MODE,
  };

  delete process.env.ORBIT_DATABASE_URL;
  delete process.env.ORBIT_EVENT_DATABASE_URL;
  delete process.env.ORBIT_LIVE_DATABASE_URL;
  delete process.env.ORBIT_FEATURE_MODE;
  process.env.ORBIT_MODULE_MODE = mode;

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("Orbit Agent chat session API fails closed for writes when live storage is unconfigured", async () => {
  await withSessionApiEnv("live", async () => {
    const module = await importProjectModule<{
      createOrbitAgentChatSessionsHandlers: (dependencies: {
        resolveActor: () => Promise<{ id: string }>;
      }) => {
        GET: () => Promise<Response>;
        POST: (request: Request) => Promise<Response>;
      };
    }>("app/api/ai/conversations/sessions/handler.ts");
    const route = module.createOrbitAgentChatSessionsHandlers({
      resolveActor: async () => ({ id: "account:live-unconfigured" }),
    });

    const listResponse = await route.GET();
    const listEnvelope = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listEnvelope.success, true);
    assert.deepEqual(listEnvelope.data.sessions, []);
    assert.equal(listEnvelope.data.storage.configured, false);
    assert.equal(listEnvelope.data.storage.persisted, false);

    const saveResponse = await route.POST(
      new Request("https://orbit.local/api/ai/conversations/sessions", {
        body: JSON.stringify({
          session: {
            id: "agent-session-demo",
            messages: [{ role: "user", text: "你好" }],
            title: "演示",
            updatedAt: "2026-07-09T02:30:00.000Z",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const saveEnvelope = await saveResponse.json();

    assert.equal(saveResponse.status, 503);
    assert.equal(saveEnvelope.success, false);
    assert.equal(saveEnvelope.error.code, "SERVICE_UNAVAILABLE");
    assert.match(saveEnvelope.error.message, /storage is not configured/i);

    const byIdModule = await importProjectModule<{
      createOrbitAgentChatSessionHandlers: (dependencies: {
        resolveActor: () => Promise<{ id: string }>;
      }) => {
        DELETE: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      };
    }>("app/api/ai/conversations/sessions/[id]/handler.ts");
    const byIdRoute = byIdModule.createOrbitAgentChatSessionHandlers({
      resolveActor: async () => ({ id: "account:live-unconfigured" }),
    });
    const deleteResponse = await byIdRoute.DELETE(
      new Request(
        "https://orbit.local/api/ai/conversations/sessions/agent-session-demo",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ id: "agent-session-demo" }) },
    );
    const deleteEnvelope = await deleteResponse.json();

    assert.equal(deleteResponse.status, 503);
    assert.equal(deleteEnvelope.success, false);
    assert.equal(deleteEnvelope.error.code, "SERVICE_UNAVAILABLE");
    assert.match(deleteEnvelope.error.message, /storage is not configured/i);
  });
});

test("Orbit Agent chat session API restores mock sessions across requests", async () => {
  await withSessionApiEnv("mock", async () => {
    const module = await importProjectModule<{
      createOrbitAgentChatSessionsHandlers: (dependencies: {
        resolveActor: () => Promise<{ id: string }>;
      }) => {
        GET: () => Promise<Response>;
        POST: (request: Request) => Promise<Response>;
      };
    }>("app/api/ai/conversations/sessions/handler.ts");
    const route = module.createOrbitAgentChatSessionsHandlers({
      resolveActor: async () => ({ id: "account:mock-session-owner" }),
    });
    const sessionId = `agent-session-mock-${Date.now()}`;
    const session = {
      createdAt: "2026-07-26T03:00:00.000Z",
      id: sessionId,
      messages: [
        { role: "user", text: "创建会后跟进" },
        {
          actionIds: ["action:followup-task:session-test"],
          role: "assistant",
          runId: "run:post-event-followup:session-test",
          text: "已创建 4 个待确认动作。",
        },
      ],
      title: "创建会后跟进",
      updatedAt: "2026-07-26T03:01:00.000Z",
    };

    const saveResponse = await route.POST(
      new Request("https://orbit.local/api/ai/conversations/sessions", {
        body: JSON.stringify({ session }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const saveEnvelope = await saveResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(saveEnvelope.success, true);
    assert.equal(saveEnvelope.data.storage.configured, true);
    assert.equal(saveEnvelope.data.storage.persisted, true);

    const listResponse = await route.GET();
    const listEnvelope = await listResponse.json();
    const listedSession = listEnvelope.data.sessions.find(
      (item: { id?: string }) => item.id === sessionId,
    );

    assert.equal(listResponse.status, 200);
    assert.equal(listEnvelope.success, true);
    assert.equal(listedSession.id, sessionId);
    assert.equal(
      listedSession.messages[1].runId,
      "run:post-event-followup:session-test",
    );
    assert.deepEqual(listedSession.messages[1].actionIds, [
      "action:followup-task:session-test",
    ]);

    const byIdModule = await importProjectModule<{
      createOrbitAgentChatSessionHandlers: (dependencies: {
        resolveActor: () => Promise<{ id: string }>;
      }) => {
        GET: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
        DELETE: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      };
    }>("app/api/ai/conversations/sessions/[id]/handler.ts");
    const byIdRoute = byIdModule.createOrbitAgentChatSessionHandlers({
      resolveActor: async () => ({ id: "account:mock-session-owner" }),
    });
    const routeContext = { params: Promise.resolve({ id: sessionId }) };
    const getResponse = await byIdRoute.GET(
      new Request(
        `https://orbit.local/api/ai/conversations/sessions/${sessionId}`,
      ),
      routeContext,
    );
    const getEnvelope = await getResponse.json();

    assert.equal(getResponse.status, 200);
    assert.equal(getEnvelope.data.session.id, sessionId);

    const deleteResponse = await byIdRoute.DELETE(
      new Request(
        `https://orbit.local/api/ai/conversations/sessions/${sessionId}`,
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ id: sessionId }) },
    );
    assert.equal(deleteResponse.status, 200);

    const deletedResponse = await byIdRoute.GET(
      new Request(
        `https://orbit.local/api/ai/conversations/sessions/${sessionId}`,
      ),
      { params: Promise.resolve({ id: sessionId }) },
    );
    assert.equal(deletedResponse.status, 404);
  });
});

test("Orbit Agent chat session API authorizes contact references before canonical persistence", async () => {
  await withSessionApiEnv("mock", async () => {
    const module = await importProjectModule<typeof import("../../app/api/ai/conversations/sessions/handler")>("app/api/ai/conversations/sessions/handler.ts");
    const route = module.createOrbitAgentChatSessionsHandlers({
      resolveActor: async () => ({ id: "account:session-reference-owner" }),
    });
    const session = {
      createdAt: "2026-09-15T02:00:00.000Z",
      id: `agent-session-reference-${Date.now()}`,
      messages: [{ id: "message:reference", references: [{ id: "demo-contact-1", type: "contact" }], role: "user", text: "起草联系消息" }],
      title: "起草联系消息",
      updatedAt: "2026-09-15T02:00:00.000Z",
    };
    const save = (value: unknown) => route.POST(new Request("https://orbit.local/api/ai/conversations/sessions", {
      body: JSON.stringify({ session: value }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));

    const allowed = await save(session);
    const allowedEnvelope = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.deepEqual(allowedEnvelope.data.session.messages[0].references, [{ id: "demo-contact-1", type: "contact" }]);

    const denied = await save({
      ...session,
      id: `${session.id}-denied`,
      messages: [{ ...session.messages[0], id: "message:reference-denied", references: [{ id: "contact:not-accessible", type: "contact" }] }],
    });
    const deniedEnvelope = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(deniedEnvelope.error.code, "FORBIDDEN");
    assert.doesNotMatch(deniedEnvelope.error.message, /contact:not-accessible/u);
  });
});

test("Orbit Agent chat session APIs reject unauthenticated access before storage", async () => {
  await withSessionApiEnv("live", async () => {
    let providerCalls = 0;
    const collectionModule = await importProjectModule<{
      createOrbitAgentChatSessionsHandlers: (dependencies: {
        providerForActor: () => null;
        resolveActor: () => Promise<null>;
      }) => {
        GET: () => Promise<Response>;
        POST: (request: Request) => Promise<Response>;
      };
    }>("app/api/ai/conversations/sessions/handler.ts");
    const itemModule = await importProjectModule<{
      createOrbitAgentChatSessionHandlers: (dependencies: {
        providerForActor: () => null;
        resolveActor: () => Promise<null>;
      }) => {
        DELETE: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
        GET: (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
      };
    }>("app/api/ai/conversations/sessions/[id]/handler.ts");
    const dependencies = {
      providerForActor: () => {
        providerCalls += 1;
        return null;
      },
      resolveActor: async () => null,
    };
    const collection = collectionModule.createOrbitAgentChatSessionsHandlers(dependencies);
    const item = itemModule.createOrbitAgentChatSessionHandlers(dependencies);
    const itemContext = { params: Promise.resolve({ id: "private-session" }) };

    const responses = await Promise.all([
      collection.GET(),
      collection.POST(
        new Request("https://orbit.local/api/ai/conversations/sessions", {
          body: JSON.stringify({ session: { id: "private-session" } }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
      item.GET(
        new Request(
          "https://orbit.local/api/ai/conversations/sessions/private-session",
        ),
        itemContext,
      ),
      item.DELETE(
        new Request(
          "https://orbit.local/api/ai/conversations/sessions/private-session",
          { method: "DELETE" },
        ),
        { params: Promise.resolve({ id: "private-session" }) },
      ),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [401, 401, 401, 401],
    );
    assert.equal(providerCalls, 0);
  });
});

test("Orbit Agent chat session GET returns the actor-scoped reliable request result", async () => {
  const [{ createOrbitAgentChatSessionHandlers }, { createMemoryOrbitAgentChatRequestStore }, sessionModule] =
    await Promise.all([
      importProjectModule<typeof import("../../app/api/ai/conversations/sessions/[id]/handler")>(
        "app/api/ai/conversations/sessions/[id]/handler.ts",
      ),
      importProjectModule<typeof import("../../features/orbit-ai/reliable-send-service")>(
        "features/orbit-ai/reliable-send-service.ts",
      ),
      importProjectModule<typeof import("../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider")>(
        "features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts",
      ),
    ]);
  const actorId = "account:request-result-owner";
  const requestStore = createMemoryOrbitAgentChatRequestStore();
  const provider = sessionModule.createStorageOrbitAgentChatSessionProvider({
    actorId,
    store: (await importProjectModule<typeof import("../../shared/storage/live-record-store")>(
      "shared/storage/live-record-store.ts",
    )).createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:request-result",
  });
  await provider.upsertSession({
    createdAt: "2026-09-14T01:00:00.000Z",
    id: "session:request-result",
    messageRevision: 2,
    messages: [
      { id: "message:user", role: "user", text: "问题" },
      { id: "message:assistant", role: "assistant", text: "答案" },
    ],
    title: "问题",
    updatedAt: "2026-09-14T01:01:00.000Z",
  });
  await requestStore.reserve(
    "request:result",
    "fingerprint:result",
    "session:request-result",
  );
  await requestStore.complete("request:result", "fingerprint:result", {
    answer: "答案",
  });
  const handlers = createOrbitAgentChatSessionHandlers({
    providerForActor: () => provider,
    requestStoreForActor: () => requestStore,
    resolveActor: async () => ({ id: actorId }),
  });

  const response = await handlers.GET(
    new Request(
      "https://orbit.local/api/ai/conversations/sessions/session%3Arequest-result?requestId=request%3Aresult",
    ),
    { params: Promise.resolve({ id: "session:request-result" }) },
  );
  const envelope = await response.json();

  assert.equal(response.status, 200, JSON.stringify(envelope));
  assert.equal(envelope.data.reliableSend.protocolVersion, 2);
  assert.equal(envelope.data.reliableSend.state, "completed");
  assert.equal(envelope.data.reliableSend.requestId, "request:result");
  assert.deepEqual(envelope.data.reliableSend.result, { answer: "答案" });
});
