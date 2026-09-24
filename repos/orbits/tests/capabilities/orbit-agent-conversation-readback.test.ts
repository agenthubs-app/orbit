import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { createLiveOrbitAgentConversationService } from "../../features/orbit-ai/live-conversation-service";
import { createMemoryOrbitAgentChatRequestStore, createReliableOrbitAgentSendService } from "../../features/orbit-ai/reliable-send-service";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const at = "2026-09-16T08:00:00.000Z";
const graph = {
  accounts: ["a", "b"].map(id => ({ id: `account:${id}`, name: id, createdAt: at, updatedAt: at })),
  profiles: ["a", "b"].map(id => ({ id: `profile:${id}`, accountId: `account:${id}`, displayName: id, createdAt: at, updatedAt: at })),
  evidenceIds: [], generatedAt: at,
};

// Only external boundaries are substituted. The production routes, membership
// resolver, reliable-send state machine and live-record session provider run.
async function harness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const providers = new Map<string, ReturnType<typeof createStorageOrbitAgentChatSessionProvider>>();
  const requests = new Map<string, ReturnType<typeof createMemoryOrbitAgentChatRequestStore>>();
  const fixture = {
    subject: "profile:a", graph, store, calls: 0, taskPersistenceCalls: 0, actors: [] as string[], providerBodies: [] as string[],
    provider(actorId: string) {
      let provider = providers.get(actorId);
      if (!provider) {
        provider = createStorageOrbitAgentChatSessionProvider({ actorId, store, workspaceId: "workspace:readback" });
        providers.set(actorId, provider);
      }
      return provider;
    },
    requestStore(actorId: string) {
      let requestStore = requests.get(actorId);
      if (!requestStore) { requestStore = createMemoryOrbitAgentChatRequestStore(); requests.set(actorId, requestStore); }
      return requestStore;
    },
    service(actorId?: string) {
      if (actorId) fixture.actors.push(actorId);
      return createLiveOrbitAgentConversationService({
        apiKey: "deterministic-test-key", model: "deepseek-chat", provider: "deepseek",
        fetchImplementation: (async (_url, init) => {
          fixture.calls += 1;
          fixture.providerBodies.push(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
            assistantMessage: "确定性回答", intent: "general_chat", toolRequests: [],
          }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
        }) as typeof fetch,
      });
    },
  };
  const globalFixture = globalThis as typeof globalThis & { __orbitReadbackFixture?: typeof fixture };
  globalFixture.__orbitReadbackFixture = fixture;
  const prefix = "const f = globalThis.__orbitReadbackFixture;";
  const shims: Record<string, string> = {
    "auth.ts": "export async function auth() { return { user: { id: f.subject } }; }",
    "features/account/storage/account-live-record-provider.ts": "export function createConfiguredStorageAccountSessionProvider() { return { readAccountSessionGraph: async () => f.graph }; }",
    "shared/storage/configured-live-record-store.ts": "export function createConfiguredPostgresLiveRecordStore() { return { store: f.store, workspaceId: 'workspace:readback' }; }",
    "features/orbit-ai/service-factory.ts": "export const createOrbitAgentConversationService = () => f.service(); export const createOrbitAgentConversationServiceForActor = id => f.service(id);",
    "features/orbit-ai/storage/orbit-agent-chat-session-provider-factory.ts": "export const createOrbitAgentChatSessionProvider = (_, id) => f.provider(id);",
    "features/orbit-ai/storage/orbit-agent-chat-request-store.ts": "export const createOrbitAgentChatRequestStore = (_, id) => f.requestStore(id);",
    "features/orbit-ai/storage/orbit-agent-chat-group-provider.ts": "export const createOrbitAgentChatOrganizationStore = () => null;",
  };
  const bundled = await build({
    stdin: { contents: `export { POST } from './app/api/ai/conversations/route'; export { createOrbitAgentChatSessionsHandlers } from './app/api/ai/conversations/sessions/handler'; export { createOrbitAgentChatSessionHandlers } from './app/api/ai/conversations/sessions/[id]/handler';`, resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
    plugins: [{ name: "isolated-readback-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /transactional-postgres$/ }, args => {
        const importer = args.importer.slice(root.length + 1);
        if (["features/tasks/service-factory.ts", "features/notifications/reminder-plan-service-factory.ts"].includes(importer)) return { path: "readback-task-transaction-boundary", namespace: "readback-transaction" };
      });
      plugin.onLoad({ filter: /.*/, namespace: "readback-transaction" }, () => ({ contents: prefix + "export function createConfiguredTransactionalPostgresRuntime() { return { workspaceId: 'workspace:readback', client: { async query() { f.taskPersistenceCalls++; throw new Error('Unexpected task SQL'); }, async transaction() { f.taskPersistenceCalls++; throw new Error('Unexpected task transaction'); }, async close() {} } }; }", loader: "ts" }));
      plugin.onLoad({ filter: /\.ts$/ }, args => {
        const source = shims[args.path.slice(root.length + 1)];
        return source ? { contents: prefix + source, loader: "ts" } : undefined;
      });
    } }],
  });
  const module = { exports: {} as {
    POST: (request: Request) => Promise<Response>;
    createOrbitAgentChatSessionsHandlers: () => { GET: (request: Request) => Promise<Response> };
    createOrbitAgentChatSessionHandlers: () => { GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
  } };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(resolve(root, "package.json")), module, module.exports);
  return { fixture, ...module.exports };
}

const input = {
  protocolVersion: 2, sessionId: "session:readback", clientMessageId: "message:first", requestId: "request:first",
  expectedMessageRevision: 0, locale: "zh", message: "我们聊聊协作方式", references: [],
};
const request = (
  body: typeof input & { actorId?: string; workspaceId?: string } = input,
  identityHeaders: Record<string, string> = {},
) => new Request("https://orbit.local/api/ai/conversations", {
  method: "POST", headers: { "content-type": "application/json", ...identityHeaders }, body: JSON.stringify(body),
});

test("reliable continuation supplies persisted prior turns even when the client omits history", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "live";
  try {
    const h = await harness();
    assert.equal((await h.POST(request())).status, 200);
    const continued = await h.POST(request({ ...input, clientMessageId: "message:second", requestId: "request:second", expectedMessageRevision: 2, message: "继续讨论" }));
    assert.equal(continued.status, 200);
    assert.equal(h.fixture.calls, 2);
    assert.equal(h.fixture.taskPersistenceCalls, 0);
    assert.ok(h.fixture.providerBodies[1].includes(input.message), "continuation must read previous user content from its real session store");
    assert.ok(h.fixture.providerBodies[1].includes("确定性回答"), "continuation must include the persisted assistant turn");
  } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous;
    delete (globalThis as typeof globalThis & { __orbitReadbackFixture?: unknown }).__orbitReadbackFixture;
  }
});

test("conversation POST receipt opens through the canonical actor session GET and history without another provider call", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "live";
  try {
    const h = await harness();
    const sent = await h.POST(request(
      { ...input, actorId: "account:b", workspaceId: "workspace:foreign" },
      { "x-orbit-actor-id": "account:b", "x-orbit-workspace-id": "workspace:foreign" },
    ));
    const receipt = await sent.json();
    assert.equal(sent.status, 200);
    assert.equal(receipt.data.reliableSend.state, "completed");
    const read = await h.createOrbitAgentChatSessionHandlers().GET(
      new Request(`https://orbit.local/api/ai/conversations/sessions/${input.sessionId}`),
      { params: Promise.resolve({ id: receipt.data.reliableSend.sessionId }) },
    );
    assert.equal(read.status, 200, "a success receipt must be readable by the same signed-in account, not a raw profile namespace");
    const opened = await read.json();
    assert.deepEqual(opened.data.session.messages.map((m: { role: string; text: string }) => [m.role, m.text]), [["user", input.message], ["assistant", "确定性回答"]]);
    const list = await h.createOrbitAgentChatSessionsHandlers().GET(new Request("https://orbit.local/api/ai/conversations/sessions?v=2"));
    assert.equal((await list.json()).data.sessions[0].id, input.sessionId);
    const replay = await h.POST(request());
    assert.equal((await replay.json()).data.reliableSend.replayed, true);
    assert.equal(h.fixture.calls, 1);
    assert.equal(h.fixture.taskPersistenceCalls, 0);
    assert.deepEqual(h.fixture.actors, ["account:a", "account:a"]);
    h.fixture.subject = "profile:b";
    const foreign = await h.createOrbitAgentChatSessionHandlers().GET(new Request("https://orbit.local"), { params: Promise.resolve({ id: input.sessionId }) });
    assert.equal(foreign.status, 404);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous;
    delete (globalThis as typeof globalThis & { __orbitReadbackFixture?: unknown }).__orbitReadbackFixture;
  }
});

test("conversation POST rejects an authenticated subject without account membership before provider execution or session writes", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "live";
  try {
    const h = await harness();
    h.fixture.subject = "profile:unknown";
    const sent = await h.POST(request(
      { ...input, actorId: "account:a", workspaceId: "workspace:readback" },
      { "x-orbit-actor-id": "account:a", "x-orbit-workspace-id": "workspace:readback" },
    ));
    assert.equal(sent.status, 401);
    assert.equal(h.fixture.calls, 0);
    assert.equal(h.fixture.taskPersistenceCalls, 0);
    assert.deepEqual(await h.fixture.provider("profile:unknown").listSessions(), []);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous;
    delete (globalThis as typeof globalThis & { __orbitReadbackFixture?: unknown }).__orbitReadbackFixture;
  }
});

test("execution-safe retry does not repeat the already-persisted current question in provider history", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageOrbitAgentChatSessionProvider({ actorId: "account:retry", store, workspaceId: "workspace:readback" });
  let writes = 0;
  let executions = 0;
  const service = createReliableOrbitAgentSendService({
    requestStore: createMemoryOrbitAgentChatRequestStore(),
    sessionProvider: {
      ...provider,
      upsertSession: async snapshot => {
        const saved = await provider.upsertSession(snapshot);
        if (++writes === 1) throw new Error("acknowledgement lost after user write");
        return saved;
      },
    },
    now: () => at,
  });
  const execute: Parameters<typeof service.send>[0]["execute"] = async prepared => {
    executions += 1;
    assert.deepEqual(prepared?.history, [], "current question is supplied separately, never duplicated as prior history");
    return { assistantMessage: { id: "answer:retry", text: "回答" }, result: {} };
  };
  await assert.rejects(service.send({ input: { ...input, protocolVersion: 2 }, execute }), /acknowledgement lost/);
  assert.equal(executions, 0);
  assert.equal((await service.send({ input: { ...input, protocolVersion: 2 }, execute })).state, "completed");
  assert.equal(executions, 1);
  assert.equal((await provider.getSession(input.sessionId))?.messages.length, 2);
});
