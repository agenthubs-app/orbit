/**
 * W0036 SC-06／SC-07：首页推荐活动池新增读取的本机实测（W0017／W0021 同一口径）。
 *
 * - 数据库：拦截 `pg.Client.prototype.query`，每条语句返回行的 JSON 字节之和（≈ Neon 出站，不含协议开销）
 *   与语句数。测推荐服务四种状态（success／no_match／needs_goal／读目标失败）与示例期「近期可报名」读取。
 *   改前的 needs_goal／读目标失败在读目录之前就返回（0 条数据库语句），所以这两条的「新增」即改后的全部读取。
 * - HTTP：`refreshHomeDashboardAction()` 应答里 `recommendations` 一段改前（无 `upcoming`）与改后的
 *   JSON 字节差（其余 facts 部分改前改后相同）；按目录可报名 5／13／20／50／100 场各测一次。
 *   `http_increment` 是全量 `upcoming` 的增量（判定用），`http_increment_capped12` 是启用备选约束后
 *   （前 12 场 + `upcomingTruncated`）的实际增量。字段长度贴近本机库已发布活动的均值。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库（非回环直接失败），在随机临时 schema 里建表、造活动，
 * 测完删除 schema；不读写库里已有的数据，不调用任何 AI。
 *
 * 运行（cwd repos/orbits）：ORBIT_EVENT_DATABASE_URL=postgres://…@localhost:5432/… npx tsx scripts/measure-home-event-pool-traffic.ts
 */
import { randomUUID } from "node:crypto";

import { Client, Pool } from "pg";

import { createCanonicalPublicEventCatalogue } from "../features/events/core/public-catalogue";
import { createEventCoreService } from "../features/events/core/service";
import { createPostgresEventCoreRepository } from "../features/events/core/storage/postgres-repository";
import { runEventOperationsMigrations } from "../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import {
  createPublicGoalRecommendationsService,
  readPublicUpcomingEvents,
  type PublicGoalRecommendationsDependencies,
} from "../features/events/public-goal-recommendations";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";

interface Meter {
  bytes: number;
  rows: number;
  statements: number;
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

const WORKSPACE = "workspace:w0036-measure";
const ACCOUNT = "account:w0036-measure";
const NOW = new Date("2026-10-01T03:00:00.000Z");
const SAMPLES = [5, 13, 20, 50, 100];

function databaseUrl(): string {
  const url = process.env.ORBIT_EVENT_DATABASE_URL;
  if (!url) throw new Error("ORBIT_EVENT_DATABASE_URL is required.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Refusing non-loopback database host: ${host}`);
  return url;
}

async function lockedWrite(pool: Pool, text: string, values: unknown[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await acquireSyncCommitOrderLock(client);
    await client.query(text, values);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertEvents(pool: Pool, from: number, to: number): Promise<void> {
  for (let index = from; index < to; index += 1) {
    const startsAt = new Date(Date.parse("2026-10-05T09:00:00.000Z") + index * 86_400_000);
    await lockedWrite(
      pool,
      `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, public_code, title,
         description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, registration_migration_state, source_payload)
       values ($1, $2, 'actor:organizer', now(), now(), $3, $4, $5, '东京·涩谷 Shibuya Stream Hall', 'Asia/Tokyo', $6, $7, 'published', 'canonical', $8::jsonb)`,
      [
        WORKSPACE,
        // 字段长度贴近本机库已发布活动的均值（标题 42 B、地点 34 B、公开码 22 B、id 28 B），HTTP 测算才不偏小。
        `event:measure-pool-sample-${String(index + 1).padStart(3, "0")}`,
        `ORBIT-MEASURE-POOL-${String(index + 1).padStart(3, "0")}`,
        index % 3 === 0
          ? `东京 AI 创业者交流会 第 ${String(index + 1).padStart(3, "0")} 场 Night`
          : `东京企业软件商务交流会 第 ${String(index + 1).padStart(3, "0")} 场`,
        "面向在日本拓展业务的创业者与企业开发负责人，分三轮交流。",
        startsAt,
        new Date(startsAt.getTime() + 3 * 3_600_000),
        JSON.stringify({ agenda: ["开场", "第一轮", "第二轮", "自由交流"], capacity: 80, evidenceIds: [`evidence:measure-${index + 1}`], language: "ja/en", organizer: "Orbit", tags: ["saas", "startup", "bd"] }),
      ],
    );
  }
}

function dependencies(pool: Pool, goal: () => Promise<string | null>): PublicGoalRecommendationsDependencies {
  const client = createEventOperationsPostgresClient({ connectionString: "postgres://measure@localhost/unused", pool: pool as never });
  const operations = createPostgresEventOperationsRepository({ client, workspaceId: WORKSPACE });
  const core = createEventCoreService(createPostgresEventCoreRepository({ client: client as never, workspaceId: WORKSPACE }));
  return {
    listMemberships: ({ accountId, eventIds }) => operations.listCanonicalRegistrationsForUser(accountId, eventIds),
    now: () => NOW,
    readPublicCatalogue: (now) =>
      createCanonicalPublicEventCatalogue({
        eventCoreService: core,
        now,
        readParticipantSummaries: (eventIds) => operations.listCatalogueSummaries(eventIds),
      }).readRecords(),
    readRelationshipGoal: () => goal(),
  };
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function main() {
  const url = databaseUrl();
  const schema = `w0036_measure_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  const rows: Array<Record<string, unknown>> = [];
  try {
    await admin.query(`create schema ${schema}`);
    await runEventOperationsMigrations(pool);
    let inserted = 0;
    for (const count of SAMPLES) {
      await insertEvents(pool, inserted, count);
      inserted = count;
      const cases: Array<[string, () => Promise<string | null>]> = [
        ["success", async () => "AI 创业"],
        ["no_match", async () => "quantum agriculture"],
        ["needs_goal", async () => null],
        ["goal_read_failure", async () => {
          throw new Error("profile down");
        }],
      ];
      for (const [label, goal] of cases) {
        const service = createPublicGoalRecommendationsService(dependencies(pool, goal));
        const { meter, value } = await measure(() => service.recommend({ accountId: ACCOUNT }));
        const before = { items: value.state === "success" ? value.items : [], state: value.state };
        // SC-07 备选约束（已启用）：snapshot 只带前 12 场 + `upcomingTruncated`。
        const capped = {
          ...before,
          upcoming: value.upcoming.slice(0, 12),
          upcomingTruncated: value.upcoming.length > 12,
        };
        rows.push({
          bookable: count,
          case: label,
          db_bytes: meter.bytes,
          db_rows: meter.rows,
          db_statements: meter.statements,
          http_recommendations_after: jsonBytes(value),
          http_recommendations_before: jsonBytes(before),
          http_increment: jsonBytes(value) - jsonBytes(before),
          http_increment_capped12: jsonBytes(capped) - jsonBytes(before),
          state: value.state,
          upcoming: value.upcoming.length,
        });
      }
      const demo = await measure(() => readPublicUpcomingEvents(dependencies(pool, async () => null), ACCOUNT, NOW));
      rows.push({
        bookable: count,
        case: "demo_upcoming",
        db_bytes: demo.meter.bytes,
        db_rows: demo.meter.rows,
        db_statements: demo.meter.statements,
        upcoming: demo.value.length,
      });
    }
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
  console.log(JSON.stringify(rows, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
