/**
 * R16 SC-R16-05：每天一问的路由（R08 契约 3）。
 *   - mock（真实 route.ts）：演示世界的题（R16 形状），与 live 同一组断言（复核 M5：校验答案、densityAfter、答过当天 null、
 *     同键重放、换键 409）；「会社は？」样例；reset 恢复；
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
import { DEMO_ACTOR_ID, demoCompletionOrganizationQuestion } from "../../shared/mock/demo-world/fixtures";

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

type Routes = { get: Handler; answer: Handler; skip: Handler };

async function mockRoutes(): Promise<Routes> {
  return {
    answer: await routeFile("contacts/completion-question/[id]/answer", "POST"),
    get: await routeFile("contacts/completion-question", "GET"),
    skip: await routeFile("contacts/completion-question/[id]/skip", "POST"),
  };
}

/**
 * R16 复核 M5：mock 与 live 用同一组断言——答案要在选项里（否则 400 INVALID_ANSWER）、结果带 densityAfter、
 * 答过当天 GET 返回 null、同键重放同结果、换键 409、答过再跳过 409。
 */
async function sharedScenario(routes: Routes): Promise<void> {
  const got = await routes.get(new Request("http://localhost/x"));
  assert.equal(got.status, 200);
  const question = contactCompletionQuestionSchema.parse((await got.json()).data);
  const answer = (body: unknown) => routes.answer(new Request("http://localhost/x", json(body)), params(question.id));
  const bad = await answer({ answer: "自分で入力", idempotencyKey: "k" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.context.reason, "INVALID_ANSWER");
  const notAnOption = await answer({ answer: question.kind === "organization" ? "自分で入力" : "どこか知らない会", idempotencyKey: "k" });
  assert.equal(notAnOption.status, 400, "an answer that is not one of the choices");
  const ok = await answer({ answer: "覚えていない", idempotencyKey: "k" });
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()).data;
  const result = contactCompletionResultSchema.parse(okBody);
  assert.equal(result.status, "answered");
  assert.equal(result.next, null);
  assert.ok(result.densityAfter === 1 || result.densityAfter === 2 || result.densityAfter === 3, "densityAfter is always returned");
  assert.equal((await (await routes.get(new Request("http://localhost/x"))).json()).data, null, "answered → nothing more today");
  const replay = await answer({ answer: "覚えていない", idempotencyKey: "k" });
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).data, okBody, "same key → same result");
  const otherKey = await answer({ answer: "覚えていない", idempotencyKey: "k2" });
  assert.equal(otherKey.status, 409);
  assert.equal((await otherKey.json()).error.context.reason, "CONFLICT");
  const skipAfter = await routes.skip(new Request("http://localhost/x", json({ idempotencyKey: "s" })), params(question.id));
  assert.equal(skipAfter.status, 409);
  const unknown = await routes.answer(new Request("http://localhost/x", json({ answer: "覚えていない", idempotencyKey: "u" })), params("no-such-question"));
  assert.equal(unknown.status, 404);
}

test("mock: the demo-world question has the R16 shape and follows the live rules", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const routes = await mockRoutes();
    const question = contactCompletionQuestionSchema.parse((await (await routes.get(new Request("http://localhost/x"))).json()).data);
    assert.equal(question.kind, "met_where");
    assert.equal(question.sample, true);
    await sharedScenario(routes);
  });
});

test("mock: answering where we met shows the density change; skip → nothing more today; reset brings the question back", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const routes = await mockRoutes();
    const question = contactCompletionQuestionSchema.parse((await (await routes.get(new Request("http://localhost/x"))).json()).data);
    const answered = await routes.answer(new Request("http://localhost/x", json({ answer: question.options[0], idempotencyKey: "e" })), params(question.id));
    assert.equal(contactCompletionResultSchema.parse((await answered.json()).data).densityAfter, 2, "an attended event + a contact point → ●●○");
    redesignMock.reset();
    const skipped = await routes.skip(new Request("http://localhost/x", json({ idempotencyKey: "s" })), params(question.id));
    assert.deepEqual((await skipped.json()).data, { next: null, questionId: question.id, status: "skipped" });
    assert.equal((await (await routes.get(new Request("http://localhost/x"))).json()).data, null);
    const late = await routes.answer(new Request("http://localhost/x", json({ answer: "紹介", idempotencyKey: "late" })), params(question.id));
    assert.equal(late.status, 409);
    redesignMock.reset();
    assert.equal(contactCompletionQuestionSchema.parse((await (await routes.get(new Request("http://localhost/x"))).json()).data).id, question.id);
  });
});

test("mock: the 「会社は？」 sample — the company from the email domain, a typed company, or 覚えていない; 「自分で入力」 itself is not an answer", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const routes = await mockRoutes();
    const question = contactCompletionQuestionSchema.parse(demoCompletionOrganizationQuestion);
    assert.equal(question.kind, "organization");
    const typeIn = await routes.answer(new Request("http://localhost/x", json({ answer: "自分で入力", idempotencyKey: "t" })), params(question.id));
    assert.equal(typeIn.status, 400);
    const typed = await routes.answer(new Request("http://localhost/x", json({ answer: "株式会社ハルモニア", idempotencyKey: "t" })), params(question.id));
    assert.equal(typed.status, 200);
    assert.equal(contactCompletionResultSchema.parse((await typed.json()).data).densityAfter, 1, "a company alone does not raise the density");
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

test("live: the same assertions as the mock", async () => {
  const { service } = await seeded();
  await withMode("live", async () => {
    const alice = liveRoutes("actor:alice", service);
    await sharedScenario({ answer: alice.answer as Handler, get: alice.get as Handler, skip: alice.skip as Handler });
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
