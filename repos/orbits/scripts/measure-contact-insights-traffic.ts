/**
 * W0051 SC-05：每人洞察三处读取的数据库读取字节与语句数（本机 live 库实测，D39 口径）。
 *
 * 只连本机 verify 库（`assertVerifyDatabaseTarget` 三重断言），账号默认 verify-plan，只读、0 次 AI：
 * - 所有人脉列表一页：`loadContactCardRoute` 改前（不读洞察一句）与改后（默认依赖）各测一次，差值 = 新增；
 * - 详情一次：`readContactInsightDetail`（一行洞察；有行时读一次目标；可重新生成时读一次当日用量）；
 * - 洞察标签一页：`loadInsightsTab` 默认依赖（整块新增）；
 * - 机会标签待唤醒改读洞察：`readDormantInsights`（≤5 位，一条主键语句）。
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：拦截 `pg.Client.prototype.query`，每条语句返回行的 JSON 字节之和。
 *
 * 运行：npx tsx scripts/measure-contact-insights-traffic.ts [verify-plan]
 */
import { Client } from "pg";

import { loadContactCardRoute } from "../app/(app)/app/contacts/contact-card-route-service";
import { loadInsightsTab } from "../app/(app)/app/contacts/analysis/insights-tab";
import { readDormantInsights } from "../app/(app)/app/contacts/analysis/opportunities-route-service";
import { readContactInsightDetail } from "../features/contacts/insights/read";
import { readSnapshotProfile } from "../features/network-analysis/runtime";
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
const strip = (meter: Meter) => ({ bytes: meter.bytes, statements: meter.statements, labels: meter.labels });

async function main() {
  loadLocalEnv();
  const account = process.argv[2] ?? "verify-plan";
  assertVerifyDatabaseTarget();
  const actorId = `user_${account.replace("-", "_")}`;
  const actor = { id: actorId };
  const now = new Date();
  const goal = (await readSnapshotProfile(actorId)).goal;
  // 1) 列表一页：改前（不读洞察）／改后（默认）。
  const before = await measure(() => loadContactCardRoute({}, actor, { readInsightPreviews: async () => new Map() }));
  const after = await measure(() => loadContactCardRoute({}, actor));
  const listIds = after.value?.state === "ready" ? after.value.view.list.items.map((item) => item.id) : [];
  const withInsight = after.value?.state === "ready" ? after.value.view.list.items.filter((item) => item.insight).length : 0;
  // 2) 详情一次：有洞察的人与没有洞察的人各测一次（没有行时不读目标）。
  const withRow = listIds.find((id) => after.value?.state === "ready" && after.value.view.list.items.find((item) => item.id === id)?.insight) ?? listIds[0]!;
  const withoutRow = listIds.find((id) => after.value?.state === "ready" && !after.value.view.list.items.find((item) => item.id === id)?.insight) ?? listIds[0]!;
  const detailWith = await measure(() => readContactInsightDetail({ actorId, contactId: withRow, now }));
  const detailWithout = await measure(() => readContactInsightDetail({ actorId, contactId: withoutRow, now }));
  // 3) 洞察标签一页。
  const tab = await measure(() => loadInsightsTab({ actorId, goal, now, search: { tab: "insight" } }));
  // 4) 待唤醒改读洞察（≤5 位）。
  const dormant = await measure(() => readDormantInsights(actorId, listIds.slice(0, 5), goal, now));
  const listDelta = after.meter.bytes - before.meter.bytes;
  const detailUpper = detailWith.meter.bytes;
  const perUserDay = { detail: 3, dormant: 1, list: 2, tab: 0.5 };
  const perUserDayBytes = listDelta * perUserDay.list + detailUpper * perUserDay.detail + tab.meter.bytes * perUserDay.tab + dormant.meter.bytes * perUserDay.dormant;
  console.log(JSON.stringify({
    account, actorId,
    list: { before: strip(before.meter), after: strip(after.meter), deltaBytes: listDelta, deltaStatements: after.meter.statements - before.meter.statements, pageContacts: listIds.length, withInsight },
    detail: { withRow: strip(detailWith.meter), withoutRow: strip(detailWithout.meter) },
    insightsTab: { ...strip(tab.meter), rows: tab.value.rows.length, total: tab.value.total },
    dormantInsights: strip(dormant.meter),
    monthly: {
      assumption: "1000 位活跃用户 × 30 天 ×（列表 2 次／天、详情 3 次／天（按有洞察的上限）、洞察标签 0.5 次／天、机会标签待唤醒 1 次／天）",
      perUserDayBytes,
      mb: mb(perUserDayBytes * 1000 * 30),
      parts: {
        dormant: mb(dormant.meter.bytes * perUserDay.dormant * 1000 * 30),
        detail: mb(detailUpper * perUserDay.detail * 1000 * 30),
        list: mb(listDelta * perUserDay.list * 1000 * 30),
        tab: mb(tab.meter.bytes * perUserDay.tab * 1000 * 30),
      },
    },
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
