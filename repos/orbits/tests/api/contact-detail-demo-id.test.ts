/**
 * W0005 SC-04：`PATCH /api/contacts/[id]` 对引导期示例联系人的 id（`demo:` 前缀）在调用
 * 联系人详情 service 之前就拒绝。
 *
 * 用 require.cache 把 `features/contacts/service-factory.ts` 换成记录调用的桩：示例 id（原样或
 * URL 编码）一律 404，service 工厂一次都没被调用；普通 id 仍照常交给 service；未登录仍是 401。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

type PatchHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function loadHandler(t: TestContext) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const factoryPath = require.resolve(join(root, "features/contacts/service-factory.ts"));
  const handlerPath = require.resolve(join(root, "app/api/contacts/[id]/handler.ts"));
  const before = new Map([factoryPath, handlerPath].map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
  });
  const replacement = new Module(factoryPath);
  replacement.filename = factoryPath;
  replacement.loaded = true;
  replacement.exports = {
    createContactDetailTagStatusService: () => {
      calls.push({ operation: "create-service" });
      return {
        invalidPatchBody: async () => {
          calls.push({ operation: "invalid" });
          return { data: {}, success: true };
        },
        updateContactDetail: async (input: unknown) => {
          calls.push({ input, operation: "update" });
          return { data: { ok: true }, success: true };
        },
      };
    },
  };
  require.cache[factoryPath] = replacement;
  delete require.cache[handlerPath];
  const { createContactDetailPatchHandler } = require(handlerPath) as {
    createContactDetailPatchHandler: (resolveActor: () => Promise<{ id: string } | null>) => PatchHandler;
  };
  return { calls, createContactDetailPatchHandler };
}

function patch(id: string, body: unknown = { note: "会后跟进" }) {
  return [
    new Request(`https://orbit.test/api/contacts/${id}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

for (const id of ["demo:wang-yan", "demo%3Awang-yan", "demo:unknown"]) {
  test(`PATCH rejects the demo id ${id} before the contact service is created`, async (t) => {
    const { calls, createContactDetailPatchHandler } = loadHandler(t);
    const handler = createContactDetailPatchHandler(async () => ({ id: "account:a" }));
    const response = await handler(...patch(id, { lastInteraction: { channel: "manual_note", summary: "x" }, note: "x", status: "active" }));
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: { code: string; context?: Record<string, string> }; success: boolean };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.context?.privacy, "guide-demo-contact");
    assert.deepEqual(calls, []);
  });
}

test("PATCH still hands a normal contact id to the service", async (t) => {
  const { calls, createContactDetailPatchHandler } = loadHandler(t);
  const handler = createContactDetailPatchHandler(async () => ({ id: "account:a" }));
  const response = await handler(...patch("contact-1"));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.operation), ["create-service", "update"]);
  assert.equal((calls[1]!.input as { contactId: string }).contactId, "contact-1");
});

test("an anonymous PATCH on a demo id is still 401 (auth first), with no service call", async (t) => {
  const { calls, createContactDetailPatchHandler } = loadHandler(t);
  const handler = createContactDetailPatchHandler(async () => null);
  const response = await handler(...patch("demo:wang-yan"));
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

/* ── relationship-initialization（POST 写、GET 读）同样在建 runtime／service、读 body 之前拒绝 ── */

type InitHandlers = {
  GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function loadInitHandlers(t: TestContext) {
  const calls: string[] = [];
  const runtimePath = require.resolve(join(root, "shared/storage/transactional-postgres.ts"));
  const servicePath = require.resolve(join(root, "features/connections/lifecycle/initialization.ts"));
  const handlerPath = require.resolve(join(root, "app/api/contacts/[id]/relationship-initialization/handler.ts"));
  const before = new Map([runtimePath, servicePath, handlerPath].map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
  });
  const replace = (path: string, exports: unknown) => {
    const replacement = new Module(path);
    replacement.filename = path;
    replacement.loaded = true;
    replacement.exports = exports;
    require.cache[path] = replacement;
  };
  const service = {
    initialize: async () => { calls.push("initialize"); return {}; },
    read: async () => { calls.push("read"); return {}; },
  };
  replace(runtimePath, { createConfiguredTransactionalPostgresRuntime: () => { calls.push("runtime"); return {}; } });
  replace(servicePath, { createRelationshipInitializationService: () => { calls.push("service"); return service; } });
  delete require.cache[handlerPath];
  const { createRelationshipInitializationHandlers } = require(handlerPath) as {
    createRelationshipInitializationHandlers: (dependencies: { resolveActor: () => Promise<{ id: string } | null> }) => InitHandlers;
  };
  return { calls, handlers: createRelationshipInitializationHandlers({ resolveActor: async () => ({ id: "account:a" }) }) };
}

for (const id of ["demo:wang-yan", "demo%3Awang-yan"]) {
  test(`relationship-initialization POST rejects ${id} before runtime, service or body`, async (t) => {
    const { calls, handlers } = loadInitHandlers(t);
    let bodyRead = false;
    const request = new Request(`https://orbit.test/api/contacts/${id}/relationship-initialization`, {
      body: JSON.stringify({ choice: "keep_in_touch" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const originalJson = request.json.bind(request);
    request.json = async () => { bodyRead = true; return originalJson(); };
    const response = await handlers.POST(request, { params: Promise.resolve({ id }) });
    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "NOT_FOUND");
    assert.deepEqual(calls, []);
    assert.equal(bodyRead, false);
  });
}

test("relationship-initialization GET on a demo id is also rejected without a runtime", async (t) => {
  const { calls, handlers } = loadInitHandlers(t);
  const response = await handlers.GET(new Request("https://orbit.test/api/contacts/demo:x/relationship-initialization"), { params: Promise.resolve({ id: "demo:x" }) });
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("relationship-initialization POST on a normal id still builds the runtime and service", async (t) => {
  const { calls, handlers } = loadInitHandlers(t);
  await handlers.POST(
    new Request("https://orbit.test/api/contacts/contact-1/relationship-initialization", { body: "{}", headers: { "content-type": "application/json" }, method: "POST" }),
    { params: Promise.resolve({ id: "contact-1" }) },
  );
  assert.deepEqual(calls.slice(0, 2), ["runtime", "service"]);
});

test("isDemoContactRouteId covers raw and URL-encoded ids only", async () => {
  const { isDemoContactRouteId } = await import("../../shared/domain/guide-demo-contact");
  assert.equal(isDemoContactRouteId("demo:a"), true);
  assert.equal(isDemoContactRouteId("demo%3Aa"), true);
  assert.equal(isDemoContactRouteId("demo%3aa"), true);
  assert.equal(isDemoContactRouteId("contact-demo:a"), false);
  assert.equal(isDemoContactRouteId("%E0%A4%A"), false);
  assert.equal(isDemoContactRouteId("demo"), false);
});
