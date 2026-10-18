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

import { PLAN_DESIGN_FIXTURES } from "../../features/plans/v2/design-fixtures";
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
