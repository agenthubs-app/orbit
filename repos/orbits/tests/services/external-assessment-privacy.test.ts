import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_EVENT_SCORE_PREFERENCES } from "../../shared/compute/event-score";
import { createMemoryEventAssessmentRepository, type AssessmentRow } from "../../features/events/assessment/repository";
import { createEventAssessmentService } from "../../features/events/assessment/service";
import { livePlanEventFacts } from "../../features/plans/v2/event-facts";

// R26 external-assessment-privacy（SC-R26-17，复核 S1）：外部活动不进活动表；评估记录即这场活动，只对本人可见。
// 名片归属窗口、公开目录、探す、主催中心只读 event_ops_*，他人的计划 live 事实只读他自己的外部评估。
const NOW = new Date("2026-10-07T03:00:00.000Z");
const context = { contacts: [], goalKeywords: [], goalLabel: "G", homeArea: null, language: "ja" as const, planId: "p", preferences: DEFAULT_EVENT_SCORE_PREFERENCES, types: [] };
const external = (id: string, actorId: string): AssessmentRow => ({
  actorId, aiOperationId: null, attempts: 0, attendeeSignature: null, createdAt: NOW.toISOString(), eventId: null, factBasis: {}, facts: { startsAt: "2026-10-20T19:00:00+09:00", title: "CFO Night" }, factsRefreshedAt: null, failureReason: null, id, idempotencyKey: id, leaseUntil: null, missingFields: [], pageCandidates: null, planItemId: null, posterAssetIds: [], promptVersion: null, readMs: null, rubricVersion: "event-score-v2", scoreBreakdown: [], sourceDigest: `url:${id}`, sourceHost: "peatix.com", sourceKind: "url", sourceUrl: "https://peatix.com/event/1", status: "ready", total: 60, totalMax: null, totalMin: null, updatedAt: NOW.toISOString(), userDecision: null, userFilledFields: [], verdict: "recommend", view: {},
});

test("参加予定に追加（外部）→ 计划引用 assessment:<id>，不碰活动表；只有本人的计划 live 事实读得到", async () => {
  const repository = createMemoryEventAssessmentRepository();
  await repository.insert(external("eva-a", "actor:a"));
  const planned: Array<{ actorId: string; eventId: string; external: boolean }> = [];
  const service = createEventAssessmentService({
    ai: { available: () => false, dailyLimit: 5, monthlyLimit: 10 } as never,
    fetchPage: async () => { throw new Error("no fetch"); },
    now: () => NOW,
    orbitEvents: { facts: async () => { throw new Error("orbit events must not be touched"); } } as never,
    plan: { addToPlan: async (actorId, input) => { planned.push({ actorId, eventId: input.eventId, external: input.external }); return { itemId: "item-1", planId: "plan-a" }; }, context: async () => context },
    repository,
    schedule: () => undefined,
  });
  assert.deepEqual(await service.addToPlan("actor:a", "eva-a"), { planId: "plan-a", planItemId: "item-1" });
  assert.deepEqual(planned, [{ actorId: "actor:a", eventId: "assessment:eva-a", external: true }]);
  // 他人拿不到这条评估，也加不进自己的计划。
  assert.equal(await service.addToPlan("actor:b", "eva-a"), null);

  const window = { from: NOW.toISOString(), limit: 20, until: "2026-12-06T00:00:00.000Z" };
  assert.equal((await repository.listAddedExternal("actor:a", window)).length, 1);
  assert.equal((await repository.listAddedExternal("actor:b", window)).length, 0);

  const factsFor = (actorId: string) => livePlanEventFacts({
    actorId, now: () => NOW, ready: true, window: () => ({ listPublishedStartingBetween: async () => [] }) as never,
    sources: async () => ({
      myEventIds: async () => [],
      myExternal: async (w) => (await repository.listAddedExternal(actorId, w)).map((row) => ({ eventId: `assessment:${row.id}`, facts: {} as never, startsAt: row.facts.startsAt!, title: row.facts.title ?? "", venue: null })),
      orbitFacts: async () => [],
    }),
  })();
  assert.deepEqual((await factsFor("actor:a")).map((fact) => fact.eventId), ["assessment:eva-a"]);
  assert.deepEqual(await factsFor("actor:b"), []);
});

test("只有评估、我的活动与本人秘書来源核验读 event_assessments，且都按 actor_id 过滤", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && readFileSync(full, "utf8").includes("from event_assessments")) files.push(path.relative(root, full));
    }
  };
  for (const dir of ["features", "app", "shared"]) walk(path.join(root, dir));
  assert.deepEqual(files.filter((file) => !file.startsWith("features/events/assessment/")).sort(), ["features/events/mine/service.ts", "features/notifications/secretary/source-access.ts"]);
  const mine = readFileSync(path.join(root, "features/events/mine/service.ts"), "utf8");
  for (const statement of mine.match(/from event_assessments where[^`]*/g) ?? []) assert.match(statement, /actor_id = \$2/);
  const secretary = readFileSync(path.join(root, "features/notifications/secretary/source-access.ts"), "utf8");
  const secretaryReads = secretary.match(/from event_assessments\s+where[^`]*/g) ?? [];
  assert.ok(secretaryReads.length > 0);
  for (const statement of secretaryReads) assert.match(statement, /actor_id=\$2/);
  assert.ok(!readFileSync(path.join(root, "features/events/core/start-window.ts"), "utf8").includes("event_assessments"));
});
