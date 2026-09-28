/**
 * W0017 SC-04：改版新增读取路径的单次返回字节（本机实测）。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库（非回环直接失败），在一个随机临时 schema 里建表、
 * 造一个测试账号（30 位联系人、1 份计划、5 场活动、两批各 5 张名片），测完删除 schema；不读写库里已有的数据，
 * 不调用任何 AI（匹配 worker 不配模型）。
 *
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：每条语句返回行的 JSON 字节之和（近似 Neon 出站，
 * 不含协议开销）。拦截 `pg.Client.prototype.query`，所以事务里的语句也算在内。
 *
 * 运行：ORBIT_EVENT_DATABASE_URL=postgres://…@localhost:5432/orbit_test npx tsx scripts/measure-plan-read-traffic.ts
 */
import { Client } from "pg";

import { createPostgresEventCoreRepository } from "../features/events/core/storage/postgres-repository";
import { runEventOperationsMigrations } from "../features/events/event-operations/storage/migrations";
import { runMaintenancePass, type MaintenanceTask } from "../features/operations/maintenance/pass";
import { createPlanEventAttendanceMaintenanceTask } from "../features/plans/event-attendance-reconcile";
import { createPlanEventRegistrationMaintenanceTask } from "../features/plans/event-registration-reconcile";
import { createPlanDailyRunGate, createPostgresPlanDailyRunStore } from "../features/plans/maintenance-daily-gate";
import { createPlanMatchMaintenanceTask } from "../features/plans/match-maintenance-task";
import { runDueMatchJobs } from "../features/plans/match-worker";
import { createPlanMatchingService } from "../features/plans/matching-service";
import { createPlanPhaseMaintenanceTask } from "../features/plans/phase-refinement";
import { createAllowListPlanReferenceValidator } from "../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../features/plans/repository";
import { createPlanService } from "../features/plans/service";
import { planTokyoDate } from "../features/plans/week";
import { planInput } from "../tests/support/plan-fixture";
import { ALICE, confirmItem, extractedBatch, withMatchingDatabase, WORKSPACE } from "../tests/support/plan-matching-harness";

interface Meter {
  statements: number;
  rows: number;
  bytes: number;
}

let active: Meter | null = null;

function rowBytes(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const row of rows) total += Buffer.byteLength(JSON.stringify(row) ?? "", "utf8");
  return total;
}

function record(result: unknown) {
  if (!active || !result || typeof result !== "object") return;
  const results = Array.isArray(result) ? result : [result];
  for (const entry of results) {
    const rows = (entry as { rows?: unknown }).rows;
    active.statements += 1;
    active.rows += Array.isArray(rows) ? rows.length : 0;
    active.bytes += rowBytes(rows);
  }
}

// 计量所有经过 pg 的语句（promise 与 callback 两种调用）。
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

const EVENT_IDS = ["event:tokyo-saas-night", "event:mixer", "event:founders", "event:ai-meetup", "event:vc-office-hours"];
const NOW = "2026-10-26T01:00:00.000Z"; // 周一 10:00 JST，计划第 5 周（第 2 阶段）

async function main() {
  const results: Array<{ path: string; statements: number; rows: number; bytes: number; note: string }> = [];
  const push = (path: string, meter: Meter, note = "") => results.push({ ...meter, note, path });

  await withMatchingDatabase(async ({ ingest, matches, pool }) => {
    // ── 测试账号：30 位联系人（夹具已有 5 位 alice 的），1 份计划（含 5 场活动），5 场已发布活动 ──
    for (let index = 0; index < 25; index += 1) {
      const payload = {
        displayName: `联系人 ${index + 1}`,
        email: `person${index + 1}@example.test`,
        id: `contact:extra-${index + 1}`,
        notes: "在展会上交换过名片，关注企业 SaaS 采购与渠道合作，约了下个月再聊。",
        organization: `Example Corp ${index + 1}`,
        phone: "+81-3-0000-0000",
        primaryIndustryId: index < 5 ? "trade_logistics" : "technology_internet",
        role: index < 5 ? "渠道 BD 经理" : "事业开发部 部长",
        secondaryIndustryId: index < 5 ? null : "technology_internet.enterprise_software",
      };
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id,
           lifecycle_state, payload, created_at, updated_at)
         values ($1, 'contacts', $2, $3, 'manual', 'traffic-measure', 'active', $4::jsonb, now(), now())`,
        [WORKSPACE, payload.id, ALICE, JSON.stringify(payload)],
      );
    }
    const plans = createPlanService({
      now: () => NOW,
      references: createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository: createPostgresPlanRepository({ pool }),
      scope: { actorId: ALICE, workspaceId: WORKSPACE },
    });
    const base = planInput();
    await plans.createVersion(
      planInput({
        items: [
          ...(base.items ?? []),
          ...EVENT_IDS.slice(1).map((eventId, index) => ({
            kind: "event" as const,
            linkedEventId: eventId,
            phaseKey: index % 2 ? "p2" : "p3",
            title: `活动 ${index + 2}`,
          })),
        ],
      }),
    );
    await runEventOperationsMigrations(pool);
    for (const [index, eventId] of EVENT_IDS.entries()) {
      const startsAt = new Date(Date.parse("2026-10-20T09:00:00.000Z") + index * 86_400_000);
      await pool.query(
        `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, public_code, title,
           description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload)
         values ($1, $2, 'actor:organizer', now(), now(), $3, $4, $5, 'Shibuya, Tokyo', 'Asia/Tokyo', $6, $7, 'published', $8::jsonb)`,
        [
          WORKSPACE,
          eventId,
          `CODE${index}`,
          `活动 ${index + 1}`,
          "面向在日本拓展业务的创业者与企业开发负责人，分三轮交流。",
          startsAt,
          new Date(startsAt.getTime() + 3 * 3_600_000),
          JSON.stringify({ agenda: ["开场", "第一轮", "第二轮", "自由交流"], capacity: 80, language: "ja/en", organizer: "Orbit", tags: ["saas", "startup", "bd"] }),
        ],
      );
    }

    // 一批已确认的名片（产生匹配任务与候选），一批待确认的名片（首页「确认 N 张新名片」读它）。
    const confirmed = await extractedBatch(ingest, ALICE, 5);
    // 这 5 位（渠道 BD、物流贸易）会命中计划里「日本市场的渠道伙伴」这条需求，产生 5 条待确认候选。
    const contactIds = [1, 2, 3, 4, 5].map((index) => `contact:extra-${index}`);
    for (const [index, item] of confirmed.items.entries()) {
      await confirmItem(ingest, { actorId: ALICE, batchId: confirmed.batch.id, contactId: contactIds[index]!, itemId: item.id });
    }
    await pool.query(`update plan_match_jobs set not_before = now() - interval '1 second'`);
    await runDueMatchJobs({ aiMatcher: null, repository: matches }, { deadline: Date.now() + 30_000, limit: 5 });
    const pending = await extractedBatch(ingest, ALICE, 5);
    await pool.query(
      `update orbit_records set payload = payload || '{"metEventId":"event:tokyo-saas-night"}'::jsonb where record_id = 'contact:saas'`,
    );

    // ── 用户路径 ──
    push(
      "计划 GET（/api/agent/plans/current，含阶段判定）",
      (
        await measure(async () => {
          await plans.enterCurrentPhase().catch(() => undefined);
          return plans.getCurrent();
        })
      ).meter,
      "首次读取当周会写一次「进入新阶段」；这里是写过之后的稳定读取",
    );
    push(
      "计划 GET（/api/agent/plans/current，含阶段判定）",
      (
        await measure(async () => {
          await plans.enterCurrentPhase().catch(() => undefined);
          return plans.getCurrent();
        })
      ).meter,
      "稳定读取（第二次）",
    );
    push("周一小结（/api/agent/plans/weekly-summary）", (await measure(() => plans.weeklySummary())).meter);
    push(
      "待确认名片读取（GET /api/contact-drafts/business-card/batches/v2/:id，每个本机进行中批次一次）",
      (await measure(() => ingest.getBatch({ actorId: ALICE, batchId: pending.batch.id }))).meter,
      "5 张名片的批次",
    );
    const eventCore = createPostgresEventCoreRepository({ client: pool as never, workspaceId: WORKSPACE });
    push(
      "活动归属候选（/api/agent/event-attribution/candidates）：批次 + 活动目录",
      (
        await measure(async () => {
          await ingest.getBatch({ actorId: ALICE, batchId: pending.batch.id });
          return eventCore.listEvents();
        })
      ).meter,
      "活动目录按整个 workspace 读取（5 场）；报名状态读取未计入，见说明",
    );
    push("  └ 其中活动目录（listEvents，5 场）", (await measure(() => eventCore.listEvents())).meter);
    const matching = createPlanMatchingService({
      planServiceFor: () => plans,
      repository: matches,
      worker: { aiMatcher: null, repository: matches },
    });
    const listed = await measure(() => matching.listPending({ actorId: ALICE }));
    push("匹配候选（GET /api/agent/plans/candidates）", listed.meter, `待确认 ${(listed.value as { candidates?: unknown[] }).candidates?.length ?? "?"} 条`);

    // ── 4 个维护任务 ──
    const gate = createPlanDailyRunGate({
      resolveStore: () => createPostgresPlanDailyRunStore({ pool, workspaceId: WORKSPACE }),
      taskNames: ["plan-event-attendance", "plan-phase", "plan-event-registration"],
      tokyoDate: planTokyoDate,
    });
    const planServiceFor = () => plans;
    const tasks: Record<string, MaintenanceTask> = {
      "plan-match": createPlanMatchMaintenanceTask({ resolveWorker: () => ({ aiMatcher: null, repository: matches }) }),
      "plan-event-attendance": createPlanEventAttendanceMaintenanceTask({ gate, resolve: () => ({ planServiceFor, repository: matches }) }),
      "plan-phase": createPlanPhaseMaintenanceTask({
        gate,
        resolve: () => ({ listActorsEnteringPhase: (input) => matches.listActorsEnteringPhase(input), planServiceFor }),
        tokyoDate: planTokyoDate,
      }),
      "plan-event-registration": createPlanEventRegistrationMaintenanceTask({
        gate,
        resolve: () => ({
          listActiveEventItems: (input) => matches.listActiveEventItems(input),
          planServiceFor,
          readRegistrations: async () => [],
        }),
      }),
    };
    const at = new Date(NOW);
    for (const [name, task] of Object.entries(tasks)) {
      const run = await measure(() => runMaintenancePass({ log: () => undefined, now: () => at, tasks: [task] }));
      push(`维护任务 ${name}：当天第一次真正执行`, run.meter, JSON.stringify(run.value.tasks[0]?.summary ?? run.value.tasks[0]?.reason));
    }
    const later = new Date(at.getTime() + 600_000);
    const idle = await measure(() => runMaintenancePass({ log: () => undefined, now: () => later, tasks: Object.values(tasks) }));
    push("一轮 pass（当天已完成）：plan-match 空闲 + 3 个日任务", idle.meter, idle.value.tasks.map((task) => `${task.name}=${task.reason ?? task.status}`).join(" "));
    const matchIdle = await measure(() => runMaintenancePass({ log: () => undefined, now: () => later, tasks: [tasks["plan-match"]!] }));
    push("  └ 其中 plan-match 空闲（一条 due-claim）", matchIdle.meter);
    const explain = await pool.query(
      `explain select workspace_id, id from plan_match_jobs
        where workspace_id = $1 and not_before <= now() and attempt_count < 3
          and (status = 'pending' or (status = 'running' and lease_expires_at < now()))
        order by not_before, created_at limit 5`,
      [WORKSPACE],
    );
    await pool.query("set enable_seqscan = off");
    const explainNoSeq = await pool.query(
      `explain select workspace_id, id from plan_match_jobs
        where workspace_id = $1 and not_before <= now() and attempt_count < 3
          and (status = 'pending' or (status = 'running' and lease_expires_at < now()))
        order by not_before, created_at limit 5`,
      [WORKSPACE],
    );
    console.log(JSON.stringify({
      explain: explain.rows.map((row) => row["QUERY PLAN"]),
      explainWithoutSeqscan: explainNoSeq.rows.map((row) => row["QUERY PLAN"]),
    }, null, 2));
  });

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
