/**
 * 像素门禁的「设计稿示例 fixture」（features/plans/v2/design-fixtures）只能是数据、进不了生产（主会话 2026-10-12 规定）：
 * 1. 生产构建不把 `*.dev.ts` 当路由（开发接口与它引用的 fixture 不被打包）；
 * 2. 除开发接口与测试外，产品代码不引用 fixture 目录；
 * 3. 每个 fixture 经同一个服务读出来都过同一份接口 schema（与真实数据同一形状：只补数据，不改结构）。
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { PLAN_DESIGN_EVENT_FACTS, PLAN_DESIGN_FIXTURES } from "../../features/plans/v2/design-fixtures";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { planV2DetailSchema, planV2SummaryResponseSchema } from "../../shared/api-schema/plan-v2";

const ROOT = process.cwd();
const require = createRequire(path.join(ROOT, "package.json"));

function loadNextConfig(nodeEnv: string): { pageExtensions?: string[] } {
  const previous = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = nodeEnv;
  try {
    const file = require.resolve(path.join(ROOT, "next.config.js"));
    delete require.cache[file];
    return require(file);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  }
}

test("production builds do not treat *.dev.ts as routes; development does", () => {
  const production = loadNextConfig("production").pageExtensions ?? [];
  assert.ok(production.length > 0);
  assert.equal(production.some((extension) => extension.startsWith("dev.")), false);
  assert.ok((loadNextConfig("development").pageExtensions ?? []).includes("dev.ts"));
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

test("only the dev route imports the design fixtures", () => {
  const offenders = ["app", "features", "shared", "proxy.ts"]
    .flatMap((entry) => {
      const full = path.join(ROOT, entry);
      return statSync(full, { throwIfNoEntry: false })?.isDirectory() ? walk(full) : statSync(full, { throwIfNoEntry: false }) ? [full] : [];
    })
    .filter((file) => !file.includes(`${path.sep}design-fixtures${path.sep}`))
    .filter((file) => /design-fixtures/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(ROOT, file));
  // R26: the events design fixtures have their own dev route (same rules: .dev.ts, mock only).
  // R11b: the 人脈分析 design fixtures have their own dev route too (app/api/dev/network-design-fixture/route.dev.ts).
  assert.deepEqual(offenders.filter((file) => !file.startsWith("app/api/dev/event-design-fixture/") && !file.startsWith("app/api/dev/network-design-fixture/")), ["app/api/dev/plan-design-fixture/route.dev.ts"]);
});

test("every design fixture is plain data: read through the same service, it fits the same API schema", async () => {
  for (const [name, fixture] of Object.entries(PLAN_DESIGN_FIXTURES)) {
    const repository = createMemoryPlanV2Repository();
    const scope = { actorId: "actor:fixture", workspaceId: "workspace:fixture" };
    repository.seed(scope, fixture());
    const service = createPlanV2Service({ now: () => new Date("2026-10-07T00:00:00Z"), references: { findMissingContactIds: async () => [], findMissingEventIds: async () => [] }, repository, sample: true, scope });
    const summary = planV2SummaryResponseSchema.parse(await service.summary());
    for (const goal of summary.goals) {
      const detail = await service.detail(goal.planId);
      if (detail) planV2DetailSchema.parse(detail);
    }
    assert.ok(name.length > 0);
  }
});

test("c-goals keeps the 128-point achievement example consistent with the goal sheet", async () => {
  const repository = createMemoryPlanV2Repository();
  const scope = { actorId: "actor:goal-example", workspaceId: "workspace:goal-example" };
  const state = PLAN_DESIGN_FIXTURES["c-goals"]!();
  repository.seed(scope, state);
  const service = createPlanV2Service({ now: () => new Date("2026-10-07T00:00:00Z"), references: { findMissingContactIds: async () => [], findMissingEventIds: async () => [] }, repository, sample: true, scope });
  const overview = await service.overview(state.plans![0]!.id);
  assert.equal(overview?.score.total, 128);
  assert.equal(overview?.score.overflow, 38);
  const goals = await service.listGoals();
  assert.deepEqual(goals.filter((goal) => goal.status === "active").map((goal) => [goal.total, goal.talkedPeople]), [[128, 19], [72, 14]]);
});

test("b4 goal menu preview omits the older plan without changing the goals", () => {
  const complete = PLAN_DESIGN_FIXTURES["c-goals"]!();
  const preview = PLAN_DESIGN_FIXTURES["c-goals-b4-menu"]!();
  assert.equal(complete.legacy?.length, 1);
  assert.equal(preview.legacy?.length, 0);
  assert.deepEqual(preview.plans, complete.plans);
});

test("b12-206 premise modal keeps the four VC candidates without a background pending card", async () => {
  const repository = createMemoryPlanV2Repository();
  const scope = { actorId: "actor:premise-example", workspaceId: "workspace:premise-example" };
  const state = PLAN_DESIGN_FIXTURES["b12-206-premise"]!();
  repository.seed(scope, state);
  const service = createPlanV2Service({ now: () => new Date(), references: { findMissingContactIds: async () => [], findMissingEventIds: async () => [] }, repository, sample: true, scope });
  const overview = await service.overview(state.plans![0]!.id);
  assert.equal(overview?.pending?.length, 0);
  assert.equal(overview?.typeStats?.find((item) => item.itemId === "demo-plan-item-vc_partner")?.candidates, 4);
  assert.equal(overview?.quota.reviewLeftThisMonth, 2);
});

test("b12-206 premise keeps tonight's CFO Night chance available late in the day", async () => {
  const repository = createMemoryPlanV2Repository();
  const scope = { actorId: "actor:premise-tonight", workspaceId: "workspace:premise-tonight" };
  const state = PLAN_DESIGN_FIXTURES["b12-206-premise"]!();
  repository.seed(scope, state);
  const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const service = createPlanV2Service({
    now: () => new Date(`${day}T23:00:00+09:00`),
    events: async () => PLAN_DESIGN_EVENT_FACTS["b12-206-premise"]!(),
    references: { findMissingContactIds: async () => [], findMissingEventIds: async () => [] },
    repository, sample: true, scope,
  });
  const overview = await service.overview(state.plans![0]!.id);
  assert.match(overview?.todayChance?.label ?? "", /CFO Night Tokyo/);
});

test("b12-244 lawyer record preview retains the two lawyer event examples", () => {
  const events = PLAN_DESIGN_EVENT_FACTS["b12-244-law"]!();
  assert.deepEqual(events.filter((event) => event.facts.expected.lawyer).map((event) => event.eventId), [
    "fx-a-ev-saas-summit",
    "fx-a-ev-cfo-night",
  ]);
});
