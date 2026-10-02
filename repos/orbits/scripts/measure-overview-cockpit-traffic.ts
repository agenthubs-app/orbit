/**
 * W0052 SC-05：人脉概览单次打开新增读取的字节与语句数（本机 live 库实测，D39 口径）。
 *
 * 只连本机 verify 库（`assertVerifyDatabaseTarget` 三重断言），账号默认 verify-plan（有快照、有计划、有 memo），只读：
 * 走与页面相同的入口（`loadOverviewCockpit` 默认依赖：计划 `getCurrent()`、快照 `readView(…, { enqueue: false })`、
 * 待确认 `listPending`、时间线最近 5 条、档位看板每列前 2、一次姓名读取），逐部分分别计量。不调用任何 AI，0 写入。
 *
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：拦截 `pg.Client.prototype.query`，每条语句返回行的 JSON 字节之和。
 * 参考行（不进总账）：改前概览已有的读取（分析 `loadContactsAnalysis`、名单一页 `loadAppContactsRouteViewModel`、
 * 本页档位表 `readRelationshipTierLookup`——W0052 起概览不再读它，作为节省项单列）。
 * 「按来源」复用名单读取已有的全量分面 `facet_sources`，不新增语句。
 *
 * 运行：npx tsx scripts/measure-overview-cockpit-traffic.ts [verify-plan]
 */
import { Client } from "pg";

import { loadContactsAnalysis } from "../app/(app)/app/contacts/analysis/contacts-analysis-route-service";
import { defaultOverviewCockpitLoaderDeps, loadOverviewCockpit, type OverviewCockpitLoaderDeps } from "../app/(app)/app/contacts/analysis/overview-cockpit-loader";
import { overviewNameIds } from "../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import { toOpportunityPlanView } from "../features/plans/coverage";
import { loadAppContactsRouteViewModel } from "../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { readRelationshipTierLookup } from "../features/relationship-strength/read-model";
import { assertVerifyDatabaseTarget } from "./lib/verify-database-target";
import { loadLocalEnv } from "./load-local-env";

interface Meter { statements: number; bytes: number; labels: { label: string; bytes: number }[] }
let active: Meter | null = null;

function rowBytes(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((total: number, row) => total + Buffer.byteLength(JSON.stringify(row) ?? "", "utf8"), 0);
}

const originalQuery = Client.prototype.query as (...args: unknown[]) => unknown;
function account(meter: Meter | null, text: string, rows: unknown) {
  if (!meter) return;
  const bytes = rowBytes(rows);
  meter.statements += 1;
  meter.bytes += bytes;
  meter.labels.push({ bytes, label: (text.match(/\/\*\s*([^*]+?)\s*\*\//)?.[1] ?? text.trim().replace(/\s+/g, " ")).slice(0, 70) });
}
// pg 的 Pool.query 走回调形式、PoolClient.query 走 Promise 形式：两种都计。
(Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function patched(this: Client, ...args: unknown[]) {
  const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text ?? "";
  const meter = active;
  const last = args[args.length - 1];
  if (meter && typeof last === "function") {
    args[args.length - 1] = (error: unknown, value: { rows?: unknown } | undefined) => {
      if (!error) account(meter, text, value?.rows);
      return (last as (...inner: unknown[]) => unknown)(error, value);
    };
    return originalQuery.apply(this, args);
  }
  const result = originalQuery.apply(this, args);
  if (meter && result && typeof (result as Promise<unknown>).then === "function") {
    return (result as Promise<{ rows?: unknown }>).then((value) => {
      account(meter, text, value?.rows);
      return value;
    });
  }
  return result;
};

async function measure<T>(run: () => Promise<T>): Promise<{ meter: Meter; value: T }> {
  const meter: Meter = { bytes: 0, labels: [], statements: 0 };
  active = meter;
  try {
    return { meter, value: await run() };
  } finally {
    active = null;
  }
}

const mb = (bytes: number) => Math.round((bytes / 1e6) * 100) / 100;
/** W0046 REPORT 的「跨联系人最近动态（limit 10，W0052 预估）」行，本实测替换它。 */
const W0046_ESTIMATE_MB = 452.7;

async function main() {
  loadLocalEnv();
  const accountName = process.argv[2] ?? "verify-plan";
  assertVerifyDatabaseTarget();
  const actorId = `user_${accountName.replace("-", "_")}`;
  const now = new Date();
  const deps = defaultOverviewCockpitLoaderDeps();
  const parts: Record<string, Meter> = {};
  const wrap = <K extends keyof OverviewCockpitLoaderDeps>(key: K): OverviewCockpitLoaderDeps[K] => {
    const original = deps[key] as unknown as ((...args: unknown[]) => Promise<unknown>) | null;
    if (!original) return original as OverviewCockpitLoaderDeps[K];
    return (async (...args: unknown[]) => {
      const { meter, value } = await measure(() => original(...args));
      parts[key] = meter;
      return value;
    }) as unknown as OverviewCockpitLoaderDeps[K];
  };
  // 1) 逐部分（串行：每部分独占计量器，与页面同一调用）
  const serial: OverviewCockpitLoaderDeps = {
    readBoard: wrap("readBoard"),
    readContactNames: wrap("readContactNames"),
    readPending: wrap("readPending"),
    readPlan: wrap("readPlan"),
    readSnapshot: wrap("readSnapshot"),
    readTimeline: wrap("readTimeline"),
  };
  const planSnapshot = await serial.readPlan(actorId).catch(() => undefined);
  const plan = planSnapshot ? toOpportunityPlanView(planSnapshot, now) : planSnapshot;
  const snapshot = serial.readSnapshot ? await serial.readSnapshot(actorId, "zh") : null;
  const timeline = await serial.readTimeline(actorId, now);
  const board = await serial.readBoard(actorId);
  if (plan && plan.needs.length > 0 && serial.readPending) await serial.readPending(actorId);
  const nameIds = overviewNameIds({
    board: { active: board.columns.active.slice(0, 2), core: board.columns.core.slice(0, 2) },
    plan,
    snapshot: snapshot ?? { blocks: [], contactCount: 0, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: null, state: "unavailable" },
    timeline: { items: timeline.items.slice(0, 5), unavailable: false },
  });
  if (nameIds.length > 0) await serial.readContactNames(actorId, nameIds);
  // 2) 整个加载（页面同一入口，并行）
  const total = await measure(() => loadOverviewCockpit({ actorId, language: "zh", now }, deps));
  // 3) 参考：改前概览已有的读取（不进总账）
  const before = await measure(async () => {
    const [analysis, route] = await Promise.all([loadContactsAnalysis(actorId, "zh"), loadAppContactsRouteViewModel({}, actorId)]);
    return { analysis, route };
  });
  const route = before.value.route;
  const ids = route.state === "success" ? route.payload.contacts.map((contact) => contact.id) : [];
  const lookup = await measure(() => readRelationshipTierLookup({ actorId, contactIds: ids }));
  const value = total.value;
  const netNew = total.meter.bytes - lookup.meter.bytes;
  const monthly = (perDay: number, bytes: number) => mb(bytes * perDay * 1000 * 30);
  console.log(JSON.stringify({
    account: accountName, actorId,
    view: {
      board: value.board ? { active: value.board.active.length, core: value.board.core.length } : null,
      names: value.names?.size ?? null,
      pendingMatches: value.pendingMatches,
      plan: value.plan === undefined ? "failed" : value.plan ? { needs: value.plan.needs.length, weekActions: value.plan.weekActions.length } : null,
      snapshot: { blocks: value.snapshot.blocks.length, contactCount: value.snapshot.contactCount, state: value.snapshot.state },
      sourceFacets: route.state === "success" ? route.payload.availableFilters.sources.map((option) => [option.value, option.count]) : null,
      timeline: value.timeline ? { items: value.timeline.items.length, unavailable: value.timeline.unavailable } : null,
    },
    parts: Object.fromEntries(Object.entries(parts).map(([key, meter]) => [key, { bytes: meter.bytes, statements: meter.statements, labels: meter.labels }])),
    totalPerOpen: { bytes: total.meter.bytes, statements: total.meter.statements },
    removedOnOverview: { tierLookup: { bytes: lookup.meter.bytes, statements: lookup.meter.statements } },
    netNewPerOpen: netNew,
    referenceBeforeChange: { bytes: before.meter.bytes, statements: before.meter.statements, note: "analysis + contacts list page (unchanged; not added to the ledger)" },
    monthlyMb: {
      assumption: "1000 位活跃用户 × 每人每天打开概览 2 次 × 30 天",
      direct: monthly(2, total.meter.bytes),
      netNew: monthly(2, netNew),
      // W0046 的预估行只登记在 D32 文字里、没有并入三档累计；本实测替换它，并入总账的是 netNew 全额。
      replacesW0046EstimateRowMb: W0046_ESTIMATE_MB,
    },
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
