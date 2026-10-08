/**
 * W0049 SC-05：「结构」标签新增读取的单次返回字节与语句数（本机 live 库实测，D39 口径）。
 *
 * 只连本机 verify 库（`assertVerifyDatabaseTarget` 三重断言），账号默认 verify-plan（有快照、有计划），只读：
 * 走与页面相同的入口（`loadStructureTabExtras` 默认依赖 = 快照 readView、`PlanService.getCurrent()`、依据姓名），
 * 另测分布读模型（`readDistributionForAccount`）里 W0049 新维度带来的增量（新维度分组的 JSON 字节），
 * 以及图投影里三个新字段的字节（名单下钻／App 设备同步共用的投影）。不调用任何 AI。
 *
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：拦截 `pg.Client.prototype.query`，每条语句返回行的 JSON 字节之和。
 *
 * 运行：npx tsx scripts/measure-structure-tab-traffic.ts [verify-plan]
 */
import { Client } from "pg";

import { loadStructureTabExtras } from "../app/(app)/app/contacts/analysis/structure-tab-loader";
import { createDashboardReadModelPostgresReader } from "../features/dashboard/storage/dashboard-read-model-postgres-reader";
import { createPgLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
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

const NEW_DIMENSIONS = new Set(["seniority", "region", "industry_secondary"]);
const mb = (bytes: number) => Math.round((bytes / 1e6) * 100) / 100;

async function main() {
  loadLocalEnv();
  const account = process.argv[2] ?? "verify-plan";
  const target = assertVerifyDatabaseTarget();
  const actorId = `user_${account.replace("-", "_")}`;
  const sql = createPgLiveRecordSqlClient({ connectionString: target.connectionString, max: 1 });
  try {
    // 1) 页面新增的三类读取（与 dashboard/page.tsx 同一入口）。
    const extras = await measure(() => loadStructureTabExtras({ actorId, language: "zh", strengthState: null }));
    // 2) 分布读模型：整条语句字节（参考行）与其中新维度分组的字节（增量）。
    const reader = createDashboardReadModelPostgresReader({ client: sql, workspaceId: target.workspaceId });
    const distribution = await measure(() => reader.readDistributionForAccount(actorId));
    const added = distribution.value.structureGroups.filter((group) => NEW_DIMENSIONS.has(group.dimension));
    const addedBytes = Buffer.byteLength(JSON.stringify(added), "utf8") + Math.max(0, added.length - 1); // 数组逗号
    // 3) 图投影里三个新字段（名单下钻一次 / 设备同步的每位联系人）。
    const projection = await measure(() => sql.query<{ bytes: string; contacts: string }>(`
      select coalesce(sum(length(jsonb_build_object(
        'secondaryIndustryId', payload -> 'secondaryIndustryId',
        'seniorityLevel', payload -> 'publicProfile' -> 'seniorityLevel',
        'region', payload -> 'region')::text) - 2), 0)::text as bytes, count(*)::text as contacts
      from orbit_records where workspace_id = $1 and collection_name = 'contacts' and user_id = $2 and lifecycle_state <> 'deleted'`, [target.workspaceId, actorId]));
    const newBytesPerOpen = extras.meter.bytes + addedBytes;
    const perOpen = { extras: { bytes: extras.meter.bytes, statements: extras.meter.statements, top: extras.meter.labels }, distributionIncrement: { bytes: addedBytes, groups: added.length } };
    const result = {
      account, actorId,
      snapshot: { state: extras.value.snapshot.state, evidenceNames: extras.value.snapshot.state === "ready" ? [extras.value.snapshot.diagnosis, ...extras.value.snapshot.insights].reduce((n, block) => n + (block?.evidence.length ?? 0), 0) : 0 },
      highlights: extras.value.highlights,
      perOpen,
      newBytesPerOpen,
      reference: {
        distributionStatementBytes: distribution.meter.bytes,
        graphProjectionNewFields: { bytes: Number(projection.value.rows[0]?.bytes ?? 0), contacts: Number(projection.value.rows[0]?.contacts ?? 0) },
        strengthState: "30 天前人数在页面既有的 ensureRelationshipStrengthsForPage 那条来源戳+state 语句里（W0047 实测 542 B），W0049 不多读",
      },
      monthlyMb: {
        assumption: "1000 位活跃用户 × 每人每天 2 次打开分析子页 × 30 天",
        newReads: mb(newBytesPerOpen * 2 * 1000 * 30),
      },
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.close();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
