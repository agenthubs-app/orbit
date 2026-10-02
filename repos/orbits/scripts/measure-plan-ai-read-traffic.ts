/**
 * W0048b SC-05（R-14）：计划接 AI 后三类数据库读流量的本机实测与 1000 人月出站折算（D39 口径）。
 *
 * ① bootstrap 与 reanalysis 各一次（AI 流水线：账本预留、快照判定与同操作快照、计划输入、计划写入；另测 mock 同路径作对照）；
 * ② 计划 GET（`getCurrentView`）与计划页 SSR（`getCurrentView` + 本月额度）各一次；
 * ③ `plan-phase` 阶段补细维护一轮（候选 SQL + 一位 actor 的一个阶段补细：目标判定、后台池预留、计划输入、写入）。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库（非回环直接失败），在随机临时 schema 里建表，造测试账号
 * （默认 200 位联系人），模型一律用本地假回复（0 次付费调用），快照用 mock 生成器；测完删除 schema。
 * 计量口径：拦截 `pg.Client.prototype.query`（W0017 口径），每条语句返回行的 JSON 字节之和（近似 Neon 出站）。
 * 不含页面已有、本 Sprint 未改动的读取（资料、联系人名字、示例期判定）。
 *
 * 运行：ORBIT_EVENT_DATABASE_URL=postgresql://…@localhost:5432/orbit_test npx tsx scripts/measure-plan-ai-read-traffic.ts [--contacts=200]
 */
import { Client } from "pg";

import { createNetworkAnalysisRuntime } from "../features/network-analysis/runtime";
import { createMockSnapshotGenerator } from "../features/network-analysis/snapshot-generator";
import {
  AI_PLAN_GENERATOR_ID,
  createAiPhaseRefiner,
  createAiPlanGenerator,
  planSnapshotPortFromRuntime,
  type PlanAiChat,
} from "../features/plans/ai-generator";
import { createPlanBootstrapService } from "../features/plans/bootstrap";
import type { PlanGenerator } from "../features/plans/generator";
import { createPostgresPlanContactReader } from "../features/plans/input-source";
import { createPostgresPlanMatchRepository } from "../features/plans/matching-repository";
import { createMockPlanGenerator } from "../features/plans/mock-generator";
import { createPlanFollowUpService } from "../features/plans/reanalysis";
import { createAllowListPlanReferenceValidator } from "../features/plans/reference-validator";
import { createPostgresPlanRepository, type PlanPoolLike } from "../features/plans/repository";
import { createPlanService } from "../features/plans/service";
import { ALICE, BOB, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../tests/support/network-analysis-harness";

const CONTACTS = Number(process.argv.find((arg) => arg.startsWith("--contacts="))?.split("=")[1] ?? 200);
const USERS = 1000;
const DAYS = 30;
const CAROL = "actor:carol";

interface Meter {
  statements: number;
  rows: number;
  bytes: number;
}
let active: Meter | null = null;

function record(result: unknown) {
  if (!active || !result || typeof result !== "object") return;
  for (const entry of Array.isArray(result) ? result : [result]) {
    const rows = (entry as { rows?: unknown }).rows;
    active.statements += 1;
    if (!Array.isArray(rows)) continue;
    active.rows += rows.length;
    for (const row of rows) active.bytes += Buffer.byteLength(JSON.stringify(row) ?? "", "utf8");
  }
}

const originalQuery = Client.prototype.query as (...args: unknown[]) => unknown;
(Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function patched(this: Client, ...args: unknown[]) {
  const last = args[args.length - 1];
  if (typeof last === "function") {
    args[args.length - 1] = (error: unknown, result: unknown) => {
      if (!error) record(result);
      (last as (error: unknown, result: unknown) => void)(error, result);
    };
    return originalQuery.apply(this, args);
  }
  const returned = originalQuery.apply(this, args);
  if (returned && typeof (returned as Promise<unknown>).then === "function") {
    return (returned as Promise<unknown>).then((result) => {
      record(result);
      return result;
    });
  }
  return returned;
};

async function measure<T>(run: () => Promise<T>): Promise<{ meter: Meter; value: T }> {
  const meter: Meter = { bytes: 0, rows: 0, statements: 0 };
  active = meter;
  try {
    return { meter, value: await run() };
  } finally {
    active = null;
  }
}

const mb = (bytes: number) => Math.round((bytes / 1e6) * 100) / 100;

/** 本地假回复（不发任何网络请求）：骨架 3 段（一年期 4 段）、每段 3 条行动 + 1 条需求。 */
const fakeChat: PlanAiChat = async ({ system, user }) => {
  const payload = JSON.parse(user) as { horizon?: string; phase?: { startWeek: number; title: string } };
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (system.startsWith("You detail one phase")) {
    const week = payload.phase!.startWeek;
    return {
      content: JSON.stringify({
        actions: [1, 2, 3].map((n) => ({ contactIds: ["C1"], detail: "说明".repeat(20), title: `${payload.phase!.title} 行动 ${n}`, week })),
        followups: ["当天发感谢"],
        infos: [{ title: "对方怎么决策？" }],
        needs: [{ description: "做采购的人", primaryIndustryId: "manufacturing_supply_chain", targetCount: 2, title: "采购负责人", titleKeywords: ["采购"] }],
      }),
      usage,
    };
  }
  const weeks = payload.horizon === "year" ? [[1, 13], [14, 26], [27, 39], [40, 52]] : [[1, 3], [4, 8], [9, 12]];
  return {
    content: JSON.stringify({
      allies: [{ contactId: "C1", help: "可以介绍" }],
      answer: [{ text: "先从现有人脉切入。" }],
      gaps: ["采购负责人"],
      phases: weeks.map(([startWeek, endWeek], index) => ({ endWeek, startWeek, summary: `摘要 ${index + 1}`, title: `阶段 ${index + 1}` })),
      pitch: { setting: "交流会", text: "我在做制造业数字化。" },
      risk: "约不到人。",
      thisWeek: [{ contactIds: ["C1"], eventIds: [], title: "约一位老客户", why: "最近有互动" }],
    }),
    usage,
  };
};

async function main() {
  await withNetworkDatabase(async (harness: NetworkHarness) => {
    const industries = ["technology_internet", "finance_investment", "manufacturing_supply_chain", "trade_logistics"];
    for (const actor of [ALICE, BOB, CAROL]) {
      for (let index = 0; index < CONTACTS; index += 1) {
        const name = `${["佐藤", "田中", "Chen", "Kim"][index % 4]} ${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(97 + Math.floor(index / 26))}`;
        await harness.addContact(actor, `${actor}:c${index}`, {
          displayName: name,
          primaryIndustryId: industries[index % industries.length],
          publicProfile: { seniorityLevel: ["director", "manager", "vp", "individual_contributor"][index % 4] },
          region: { city: "Tokyo", countryCode: "JP" },
        });
      }
    }
    const clock = { now: new Date("2026-10-05T03:00:00.000Z") };
    const goal = "三个月内拿到 10 家制造业企业客户的试用";
    const planPool = harness.pool as unknown as PlanPoolLike;
    const plansFor = (actorId: string) => {
      let tick = 0;
      return createPlanService({
        now: () => new Date(clock.now.getTime() + tick++).toISOString(),
        references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }),
        repository: createPostgresPlanRepository({ pool: planPool }),
        scope: { actorId, workspaceId: WORKSPACE },
      });
    };
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client,
      generator: createMockSnapshotGenerator(),
      now: () => clock.now,
      readCurrentPlan: async (actorId: string) => plansFor(actorId).getCurrent(),
      readProfile: async () => ({ goal, profileSection: { profile: { relationshipGoal: goal }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    const source = {
      listContacts: createPostgresPlanContactReader({ client: harness.client, workspaceId: WORKSPACE }),
      // 活动目录来自活动子系统（与改前同一读取），本脚本不计。
      listEvents: async () => [],
    };
    const ai = createAiPlanGenerator({ chat: fakeChat, ledger: runtime.ledger, log: () => undefined, model: "local-fake", snapshots: planSnapshotPortFromRuntime(runtime) });
    const bootstrapWith = (actorId: string, generator: PlanGenerator, horizon: "quarter" | "year" = "quarter") =>
      createPlanBootstrapService({ actorId, generator, now: () => clock.now, plans: plansFor(actorId), references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }), source })
        .bootstrap({ goal: { horizon, snapshot: goal, text: goal }, idempotencyKey: `measure-${actorId}-${horizon}`, locale: "zh", supplement: null });

    // ① bootstrap（AI 与 mock 对照）与 reanalysis。
    const aiBootstrap = await measure(() => bootstrapWith(ALICE, ai));
    const mockBootstrap = await measure(() => bootstrapWith(BOB, createMockPlanGenerator()));
    const followUp = createPlanFollowUpService({
      actorId: ALICE,
      generator: ai,
      now: () => clock.now,
      plans: plansFor(ALICE),
      references: createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: "any" } }),
      source,
    });
    const aiReanalysis = await measure(() =>
      followUp.create({ basePlanId: aiBootstrap.value.snapshot.plan.id, goal: { horizon: "quarter", snapshot: goal, text: goal }, idempotencyKey: "measure-re", locale: "zh", origin: "reanalysis" }),
    );

    // ② 计划 GET 与计划页 SSR（本 Sprint 未改读取语句；AI 计划同样 0 次模型调用）。
    const get = await measure(() => plansFor(ALICE).getCurrentView({ includeLog: true }));
    const ssr = await measure(async () => {
      const plans = plansFor(ALICE);
      const view = await plans.getCurrentView({ includeLog: true });
      await plans.reanalysisQuota();
      return view;
    });

    // ③ 一年期 AI 计划进入第 2 段后的一轮补细维护。
    await bootstrapWith(CAROL, ai, "year");
    clock.now = new Date("2027-01-05T03:00:00.000Z"); // 第 14 周：第 2 段成为当前 → 补第 3 段
    const matching = createPostgresPlanMatchRepository({ pool: harness.pool as never, workspaceId: WORKSPACE });
    const refineActor = createAiPhaseRefiner({ chat: fakeChat, ledger: runtime.ledger, log: () => undefined, model: "local-fake", now: () => clock.now, planServiceFor: plansFor, source });
    const listing = await measure(() => matching.listActorsNeedingPhaseRefinement!({ aiGeneratorId: AI_PLAN_GENERATOR_ID, limit: 50, today: "2027-01-05" }));
    const refine = await measure(() => refineActor(CAROL));
    const idle = await measure(() => matching.listActorsNeedingPhaseRefinement!({ aiGeneratorId: AI_PLAN_GENERATOR_ID, limit: 50, today: "2027-01-05" }));

    const monthly = (bytes: number, perUserPerMonth: number) => mb(bytes * perUserPerMonth * USERS);
    const userPath = {
      bootstrapAiMonthlyMb: monthly(aiBootstrap.meter.bytes, 1),
      bootstrapIncrementVsMockMb: monthly(aiBootstrap.meter.bytes - mockBootstrap.meter.bytes, 1),
      planPageMonthlyMb: monthly(ssr.meter.bytes, 2 * DAYS),
      reanalysisMonthlyMb: monthly(aiReanalysis.meter.bytes, 1),
    };
    const result = {
      account: { contactsPerActor: CONTACTS },
      perOperation: {
        "①bootstrapAi": aiBootstrap.meter,
        "①bootstrapMock(对照)": mockBootstrap.meter,
        "①reanalysisAi": aiReanalysis.meter,
        "②planGet": get.meter,
        "②planPageSsr": ssr.meter,
        "③refineCandidatesSql": listing.meter,
        "③refineOneActor": { ...refine.meter, outcome: refine.value },
        "③refineCandidatesSqlAfter": idle.meter,
      },
      monthlyMb_userPath_D39: {
        ...userPath,
        // 本 Sprint 新增到 D39 用户路径总账的部分：AI bootstrap 比 mock 多出的读取 + 每月 1 次 AI reanalysis（mock 时同路径已在账上，按全量计入作为上限）。
        // 计划页 GET／SSR 读取语句不变（增量 0），只列出绝对值供核对。
        addedToD39Total: Math.round((userPath.bootstrapIncrementVsMockMb + userPath.reanalysisMonthlyMb) * 100) / 100,
      },
      monthlyMb_backgroundRefine: {
        // 每人每月至多补细 1 个阶段（季度计划第 3 段；一年期每季度 1 段）上限估；候选 SQL 每天 1 次（全体共享一条）。
        refinePerUserMonthUpperBound: monthly(refine.meter.bytes, 1),
        candidatesSqlDaily: mb(listing.meter.bytes * DAYS),
      },
    };
    console.log(JSON.stringify(result, null, 2));
  }, { syncRevision: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
