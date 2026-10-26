import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVENT_SCORE_PREFERENCES } from "../../shared/compute/event-score";
import { eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import { createEventAssessmentLiveHandlers } from "../../features/events/assessment/handlers";
import { createMemoryEventAssessmentRepository } from "../../features/events/assessment/repository";
import { createEventAssessmentService, EventAssessmentError, type EventAssessmentService } from "../../features/events/assessment/service";

// R26 契约 8 live 路由：登录、示例模式拦写、库未配置 503、限速 429、他人 404、响应过契约 schema。

const context = { contacts: [], goalKeywords: [], goalLabel: null, homeArea: null, language: "ja" as const, planId: null, preferences: DEFAULT_EVENT_SCORE_PREFERENCES, types: [] };
function service(): EventAssessmentService {
  return createEventAssessmentService({
    ai: { available: () => false, dailyLimit: 5, gate: { beginCall: async () => ({ callId: "x" }), endCall: async () => {}, finish: async () => {}, reserve: async () => ({ ok: false, reason: "disabled" }) }, monthlyLimit: 10, provider: null },
    fetchPage: async () => ({ ok: false, reason: "fetch_failed" }),
    orbitEvents: { facts: async () => null },
    plan: { addToPlan: async () => null, context: async () => context },
    repository: createMemoryEventAssessmentRepository(),
    schedule: () => undefined,
  });
}
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/events/assessments", { body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, method: "POST" });
const manual = { facts: { price: "無料", startsAt: "2026-10-21T08:00:00+09:00", title: "朝会", venue: "丸の内" }, idempotencyKey: "m1", sourceKind: "manual" };

test("未登录 401；示例模式写 403 SAMPLE_READ_ONLY、读为空；库未配置 503", async () => {
  const anon = createEventAssessmentLiveHandlers({ resolveActor: async () => null, service: service() });
  assert.equal("error" in (await anon.list(new Request("http://localhost/x"))) && (await anon.list(new Request("http://localhost/x")) as { error: { code: string } }).error.code, "UNAUTHORIZED");
  const demo = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: DEMO_ACTOR_ID }) as never, service: service() });
  const blocked = await demo.create(post(manual));
  assert.equal("error" in blocked && blocked.context?.reason, "SAMPLE_READ_ONLY");
  assert.deepEqual(await demo.list(new Request("http://localhost/x")), { data: [] });
  const header = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:a" }) as never, service: service() });
  const sample = await header.create(post(manual, { "x-orbit-sample": "1" }));
  assert.equal("error" in sample && sample.context?.reason, "SAMPLE_READ_ONLY");
  const unconfigured = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:a" }) as never, service: null });
  const reply = await unconfigured.list(new Request("http://localhost/x"));
  assert.equal("error" in reply && reply.context?.reason, "EVENT_ASSESSMENT_UNCONFIGURED");
});

test("3 项手入力 → 200 + 合契约 schema；他人 404；限速 → 429 RATE_LIMITED", async () => {
  const shared = service();
  const alice = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:a" }) as never, service: shared });
  const bob = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:b" }) as never, service: shared });
  const created = await alice.create(post(manual));
  assert.ok("data" in created);
  const parsed = eventAssessmentSchema.parse((created as { data: unknown }).data);
  assert.equal(parsed.status, "ready");
  const other = await bob.get(new Request("http://localhost/x"), { id: parsed.id });
  assert.equal("error" in other && other.error.code, "NOT_FOUND");
  const limited = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:a" }) as never, service: { ...shared, create: async () => { throw new EventAssessmentError("RATE_LIMITED", "slow down"); } } });
  const reply = await limited.create(post({ idempotencyKey: "u", sourceKind: "url", url: "https://x.jp/e" }));
  assert.equal("error" in reply && reply.status, 429);
  assert.equal("error" in reply && reply.context?.reason, "RATE_LIMITED");
});

test("QA-B2: DELETE removes my assessment (contract shape); someone else's → 404; sample mode → 403", async () => {
  const { eventAssessmentDeleteResultSchema } = await import("../../shared/api-schema/event-assessment");
  const shared = service();
  const alice = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:a" }) as never, service: shared });
  const bob = createEventAssessmentLiveHandlers({ resolveActor: async () => ({ id: "actor:b" }) as never, service: shared });
  const created = await alice.create(post({ ...manual, idempotencyKey: "del" }));
  const id = eventAssessmentSchema.parse((created as { data: unknown }).data).id;
  const del = (headers: Record<string, string> = {}) => new Request(`http://localhost/api/events/assessments/${id}`, { headers, method: "DELETE" });
  const refused = await bob.remove(del(), { id });
  assert.equal("error" in refused && refused.error.code, "NOT_FOUND");
  const sample = await alice.remove(del({ "x-orbit-sample": "1" }), { id });
  assert.equal("error" in sample && sample.context?.reason, "SAMPLE_READ_ONLY");
  const removed = await alice.remove(del(), { id });
  assert.deepEqual(eventAssessmentDeleteResultSchema.parse((removed as { data: unknown }).data), { assessmentId: id, deleted: true });
  const gone = await alice.get(new Request("http://localhost/x"), { id });
  assert.equal("error" in gone && gone.error.code, "NOT_FOUND");
});
