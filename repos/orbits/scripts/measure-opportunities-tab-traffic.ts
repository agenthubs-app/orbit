/**
 * W0050 SC-05：「机会」标签单次打开的读取字节与语句数（本机 live 库实测，D39 口径）。
 *
 * 只连本机 verify 库（`assertVerifyDatabaseTarget` 三重断言），账号默认 verify-plan（有快照、有计划），只读：
 * 走与页面相同的入口（`loadOpportunitiesTab` 默认依赖：计划 `getCurrent()`、快照 `readView(…, { enqueue: false })`、
 * 待确认候选 `listPending`、可报名活动（目录 + 本人报名）、待唤醒、gap 依据姓名），逐部分分别计量。不调用任何 AI，0 写入。
 *
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：拦截 `pg.Client.prototype.query`，每条语句返回行的 JSON 字节之和。
 * 去重：计划 getCurrent 与快照 readView 在 W0049 已按「结构／机会标签每次打开」入账（D32 W0049 行），这里单列不重复计。
 *
 * 运行：npx tsx scripts/measure-opportunities-tab-traffic.ts [verify-plan]
 */
import { Client } from "pg";

import { defaultOpportunitiesTabLoaderDeps, loadOpportunitiesTab, type OpportunitiesTabLoaderDeps } from "../app/(app)/app/contacts/analysis/opportunities-route-service";
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
/** W0049 已入账的同一入口读取（每次打开分析子页）：结构标签的依据姓名，机会标签已不再读（W50-5）。 */
const W0049_EVIDENCE_NAMES_BYTES = 384;

async function main() {
  loadLocalEnv();
  const account = process.argv[2] ?? "verify-plan";
  assertVerifyDatabaseTarget();
  const actorId = `user_${account.replace("-", "_")}`;
  const now = new Date();
  const deps = defaultOpportunitiesTabLoaderDeps();
  const parts: Record<string, Meter> = {};
  const wrap = <K extends keyof OpportunitiesTabLoaderDeps>(key: K): OpportunitiesTabLoaderDeps[K] => {
    const original = deps[key] as unknown as ((...args: unknown[]) => Promise<unknown>) | null;
    if (!original) return original as OpportunitiesTabLoaderDeps[K];
    return (async (...args: unknown[]) => {
      // 各部分并行执行：按部分单独测一遍（与页面同一调用），合计另测。
      const { meter, value } = await measure(() => original(...args));
      parts[key] = meter;
      return value;
    }) as unknown as OpportunitiesTabLoaderDeps[K];
  };
  // 1) 逐部分（串行：每部分独占计量器）
  const serial: OpportunitiesTabLoaderDeps = {
    readBookableEvents: wrap("readBookableEvents"),
    readContactNames: wrap("readContactNames"),
    readDormant: wrap("readDormant"),
    readPending: wrap("readPending"),
    readPlan: wrap("readPlan"),
    readSnapshot: wrap("readSnapshot"),
  };
  const sequential = async () => {
    const plan = await serial.readPlan(actorId);
    const report = serial.readSnapshot ? await serial.readSnapshot(actorId, "zh") : null;
    await serial.readDormant(actorId);
    if (plan && serial.readPending) await serial.readPending(actorId);
    await serial.readBookableEvents(actorId, now);
    return { plan, report };
  };
  await sequential();
  // 2) 整个加载（页面同一入口）
  const total = await measure(() => loadOpportunitiesTab({ actorId, goal: null, language: "zh", now }, deps));
  const view = total.value;
  const bytes = (key: string) => parts[key]?.bytes ?? 0;
  const counted = bytes("readPlan") + bytes("readSnapshot");
  const netNew = total.meter.bytes - counted - W0049_EVIDENCE_NAMES_BYTES;
  // 活动目录只在有还缺人的需求时读：本账号若全部满足，整页实测不含它，另按逐部分实测加回作为上限口径。
  const eventsIncluded = view.coverage.state === "ready" && view.coverage.needs.some((need) => need.missing > 0);
  const netNewWithEvents = netNew + (eventsIncluded ? 0 : bytes("readBookableEvents"));
  const monthly = (perDay: number, value: number) => mb(value * perDay * 1000 * 30);
  console.log(JSON.stringify({
    account, actorId,
    view: {
      coverage: view.coverage.state === "ready" ? { needs: view.coverage.needs.length, percent: view.coverage.percent } : view.coverage.state,
      dormant: view.dormant?.length ?? null,
      pendingMatches: view.weekActions.pendingMatches,
      report: view.report.state,
      weekActions: view.weekActions.planActions?.length ?? null,
    },
    parts: Object.fromEntries(Object.entries(parts).map(([key, meter]) => [key, { bytes: meter.bytes, statements: meter.statements, labels: meter.labels }])),
    totalPerOpen: { bytes: total.meter.bytes, statements: total.meter.statements },
    dedupe: { alreadyCountedInW0049: counted, w0049EvidenceNamesNoLongerReadOnOpp: W0049_EVIDENCE_NAMES_BYTES, netNewPerOpen: netNew, eventsIncludedInTotal: eventsIncluded, netNewPerOpenWithEvents: netNewWithEvents },
    monthlyMb: {
      assumption: "1000 位活跃用户 × 每人每天打开机会标签 1 次／3 次 × 30 天",
      direct: { perDay1: monthly(1, total.meter.bytes), perDay3: monthly(3, total.meter.bytes) },
      netNew: { perDay1: monthly(1, netNew), perDay3: monthly(3, netNew) },
      netNewWithEvents: { perDay1: monthly(1, netNewWithEvents), perDay3: monthly(3, netNewWithEvents) },
    },
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
