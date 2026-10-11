/**
 * R16 SC-R16-05：每天一问的路由（R08 契约 3）。
 *   - mock（真实 route.ts）：演示世界的题（R16 形状），回答 / 跳过成功；
 *   - live（同一个 `redesignContractRoute` 包装 + 注入的登录人与服务；真实 route.ts 的登录要 Next 的请求上下文）：取题 / 回答 / 跳过过契约 schema；示例模式拦写（演示账号与
 *     `x-orbit-sample: 1`）且示例模式取题不写库；请求体严格；答案不合法 400；他人的题 404；库未配置 503。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryContactCompletionStorage } from "../../features/contacts/completion/configured";
import { createContactCompletionLiveHandlers } from "../../features/contacts/completion/handlers";
import { COMPLETION_QUESTION_COLLECTION } from "../../features/contacts/completion/repository";
import { createContactCompletionService, type ContactCompletionService } from "../../features/contacts/completion/service";
import { redesignMock } from "../../features/redesign-contracts/mock-service";
import { redesignContractRoute } from "../../features/redesign-contracts/route";
import { resolveRedesignContract } from "../../features/redesign-contracts/service-factory";
import { contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../shared/api-schema/contact-completion";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";

type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

async function withMode<T>(mode: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = mode;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = previous;
  }
}

async function routeFile(file: string, method: string): Promise<Handler> {
  return ((await import(`../../app/api/${file}/route.ts`)) as Record<string, Handler>)[method]!;
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, method: "POST" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

test("service factory: contact-completion resolves live; the other R08 contracts still answer NOT_IMPLEMENTED in live", () => {
  const live = resolveRedesignContract("contact-completion", "live");
  assert.equal(live.success, true);
  assert.equal(live.success && live.service.mode, "live");
  assert.equal(resolveRedesignContract("home-layout", "live").success, false);
  const mock = resolveRedesignContract("contact-completion", "mock");
  assert.equal(mock.success && mock.service.mode, "mock");
});

test("mock: the demo-world question has the R16 shape; answer and skip succeed", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const response = await (await routeFile("contacts/completion-question", "GET"))(new Request("http://localhost/x"));
    const question = contactCompletionQuestionSchema.parse((await response.json()).data);
    assert.equal(question.kind, "met_where");
    assert.equal(question.sample, true);
    const answered = await (await routeFile("contacts/completion-question/[id]/answer", "POST"))(new Request("http://localhost/x", json({ answer: question.options[0], idempotencyKey: "k" })), params(question.id));
    assert.equal(answered.status, 200);
    const skipped = await (await routeFile("contacts/completion-question/[id]/skip", "POST"))(new Request("http://localhost/x", json({ idempotencyKey: "k" })), params(question.id));
    assert.equal(skipped.status, 200);
  });
});

function liveRoutes(actorId: string | null, service: ContactCompletionService | null) {
  const live = createContactCompletionLiveHandlers({ resolveActor: async () => (actorId ? ({ id: actorId } as never) : null), service });
  const never = () => {
    throw new Error("live only");
  };
  return {
    answer: redesignContractRoute("contact-completion", contactCompletionResultSchema, (request, p, { service: resolved }) => (resolved.mode === "live" ? live.answer(request, p) : never())),
    get: redesignContractRoute("contact-completion", contactCompletionQuestionSchema.nullable(), (request, p, { service: resolved }) => (resolved.mode === "live" ? live.get(request, p) : never())),
    skip: redesignContractRoute("contact-completion", contactCompletionResultSchema, (request, p, { service: resolved }) => (resolved.mode === "live" ? live.skip(request, p) : never())),
  };
}

async function seeded() {
  const storage = createMemoryContactCompletionStorage({ workspaceId: "workspace:completion-routes" });
  const createdAt = new Date(Date.now() - 86_400_000).toISOString();
  for (const [actor, id, name] of [["actor:alice", "c:alice", "伊藤 直子"], ["actor:bob", "c:bob", "Bob の知人"], [DEMO_ACTOR_ID, "c:demo", "デモ 太郎"]] as const) {
    await storage.store.upsertRecord({
      collectionName: "contacts", createdAt, evidenceIds: [], lifecycleState: "active",
      payload: { createdAt, displayName: name, id, source: { id: "s", type: "manual" }, stage: "captured", updatedAt: createdAt },
      recordId: id, sourceId: "s", sourceType: "manual", updatedAt: createdAt, userId: actor, workspaceId: storage.workspaceId,
    });
  }
  return { service: createContactCompletionService({ log: () => undefined, storage }), storage };
}

test("live: get → answer → replay; strict bodies; bad answer 400; someone else's question 404; unconfigured 503; no session 401", async () => {
  const { service } = await seeded();
  await withMode("live", async () => {
    const alice = liveRoutes("actor:alice", service);
    const got = await alice.get(new Request("http://localhost/x"));
    assert.equal(got.status, 200);
    assert.equal(got.headers.get("X-Orbit-Feature-Mode"), "live");
    const question = contactCompletionQuestionSchema.parse((await got.json()).data);
    assert.equal(question.kind, "organization");
    assert.equal((await alice.answer(new Request("http://localhost/x", json({ answer: "紹介", extra: 1, idempotencyKey: "k" })), params(question.id))).status, 400, "strict body");
    const bad = await alice.answer(new Request("http://localhost/x", json({ answer: "自分で入力", idempotencyKey: "k" })), params(question.id));
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.context.reason, "INVALID_ANSWER");
    const bob = liveRoutes("actor:bob", service);
    const foreign = await bob.answer(new Request("http://localhost/x", json({ answer: "Example KK", idempotencyKey: "k" })), params(question.id));
    assert.equal(foreign.status, 404);
    const ok = await alice.answer(new Request("http://localhost/x", json({ answer: "Harmonia KK", idempotencyKey: "k" })), params(question.id));
    assert.equal(ok.status, 200);
    const result = contactCompletionResultSchema.parse((await ok.json()).data);
    assert.deepEqual([result.status, result.next, result.densityAfter], ["answered", null, 1]);
    assert.equal((await (await alice.get(new Request("http://localhost/x"))).json()).data, null, "answered → nothing more today");
    const skipAfter = await alice.skip(new Request("http://localhost/x", json({ idempotencyKey: "s" })), params(question.id));
    assert.equal(skipAfter.status, 409);
    assert.equal((await liveRoutes(null, service).get(new Request("http://localhost/x"))).status, 401);
    const unconfigured = await liveRoutes("actor:alice", null).get(new Request("http://localhost/x"));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error.context.reason, "CONTACT_COMPLETION_UNCONFIGURED");
  });
});

test("live sample mode: the demo account and x-orbit-sample: 1 cannot answer or skip (403 SAMPLE_READ_ONLY), and their GET writes nothing", async () => {
  const { service, storage } = await seeded();
  await withMode("live", async () => {
    const demo = liveRoutes(DEMO_ACTOR_ID, service);
    const got = await demo.get(new Request("http://localhost/x"));
    assert.equal((await got.json()).data, null);
    for (const route of [demo.answer, liveRoutes("actor:alice", service).answer]) {
      const blocked = await route(new Request("http://localhost/x", json({ answer: "紹介", idempotencyKey: "k" }, { "x-orbit-sample": "1" })), params("anything"));
      assert.equal(blocked.status, 403);
      assert.equal((await blocked.json()).error.context.reason, "SAMPLE_READ_ONLY");
    }
    const blockedSkip = await demo.skip(new Request("http://localhost/x", json({ idempotencyKey: "k" })), params("anything"));
    assert.equal(blockedSkip.status, 403);
    const sampleGet = await liveRoutes("actor:alice", service).get(new Request("http://localhost/x", { headers: { "x-orbit-sample": "1" } }));
    assert.equal((await sampleGet.json()).data, null);
    const written = await storage.store.listRecords({ collectionName: COMPLETION_QUESTION_COLLECTION, limit: 10, workspaceId: storage.workspaceId });
    assert.equal(written.length, 0, "sample requests never write");
  });
});
