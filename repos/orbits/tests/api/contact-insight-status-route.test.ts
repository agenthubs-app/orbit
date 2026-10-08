/**
 * W0057 SC-02：`GET /api/contacts/:id/insight`——详情面板轮询的只读状态接口。
 * 401 未登录；400 坏 id；本人 → 200 面板视图；他人／不存在 → 404；读失败 503；`cache-control: no-store`。
 * 0 次模型调用由架构测试保证（tests/architecture/contact-insights-read-paths.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createContactInsightStatusHandler } from "../../app/api/contacts/[id]/insight/handler";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";

const NOW = new Date("2026-10-03T03:00:00.000Z");
const GOAL = "认识 SaaS 决策人";
const ROW: ContactInsightRow = {
  aiState: "done", attempts: 1, contactId: "c1", deferredUntil: null, dirtyAt: null, dirtyReasons: [], evidence: [],
  generatedAt: "2026-10-03T02:59:30.000Z", goalHash: contactInsightGoalHash(GOAL), goalRelation: { en: "Fits.", zh: "对得上。" },
  lastErrorCode: null, leaseExpiresAt: null, model: "m", nextStep: { en: "Call.", zh: "打个电话。" }, relevance: 50, retryCount: 0,
  sourceDataVersion: "v", status: "ready",
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });

test("status route: 401 / 400 / own row 200 with the panel view / foreign 404 / read failure 503", async () => {
  const reads: { actorId: string; contactId: string }[] = [];
  const handler = createContactInsightStatusHandler({
    now: () => NOW,
    readStatus: async (input) => {
      reads.push({ actorId: input.actorId, contactId: input.contactId });
      if (input.contactId === "boom") throw new Error("db down");
      if (input.contactId === "c1") return { goal: GOAL, goalKnown: true, quotaExhausted: false, row: ROW };
      if (input.contactId === "c-new") return { goal: GOAL, goalKnown: true, quotaExhausted: false, row: null };
      return null;
    },
    resolveActor: async () => ({ id: "actor:alice" }),
  });
  const request = new Request("http://localhost/api/contacts/c1/insight");
  const ok = await handler(request, params("c1"));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.json();
  assert.equal(body.data.view.state, "ready");
  assert.deepEqual(body.data.view.goalRelation, { en: "Fits.", zh: "对得上。" });
  assert.equal(body.data.quotaExhausted, false);
  const fresh = await (await handler(request, params("c-new"))).json();
  assert.equal(fresh.data.view.state, "pending", "no row yet + goal → 正在生成");
  assert.equal((await handler(request, params("bob-contact"))).status, 404);
  assert.equal((await handler(request, params("boom"))).status, 503);
  assert.equal((await handler(request, params(""))).status, 400);
  assert.deepEqual(reads.map((read) => read.actorId), ["actor:alice", "actor:alice", "actor:alice", "actor:alice"]);
  const anonymous = createContactInsightStatusHandler({ resolveActor: async () => null, readStatus: async () => { throw new Error("never"); } });
  assert.equal((await anonymous(request, params("c1"))).status, 401);
});
