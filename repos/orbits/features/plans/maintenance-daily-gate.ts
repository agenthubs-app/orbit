/**
 * 计划维护日任务的「每个东京自然日最多真正执行一次」把关（Sprint W0017，RV-03）。
 *
 * 适用：`plan-phase`、`plan-event-attendance`、`plan-event-registration`。这三个任务都是幂等兜底，
 * 过去每轮维护（生产上是 600 秒一次的队列心跳 + 每日 cron）都会完整扫描一遍，读取量随轮次线性增长。
 * `plan-match` 不经过这里：它服务「关掉审阅页后的补跑」，保留每轮执行（空闲时只有一次 due-claim 查询）。
 *
 * 规则（持久、跨进程、跨实例，不用内存变量判断「今天跑过没有」）：
 * - 领取记录：`plan_maintenance_daily_runs`，一行 = (workspace, 东京日, 任务)。领取是一条
 *   `insert … on conflict do update … where` 语句：没有行、`pending`、或 `running` 且租约已过期才能领到；
 *   两个实例（cron 与队列心跳）同时触发只有一个领到。
 * - 租约 `PLAN_DAILY_RUN_LEASE_SECONDS`：执行中进程崩溃，租约过期后下一轮可重新领取。
 * - 结束：处理完 → `completed`（当天不再执行）；到达上限或截止时间（`hasMore`）→ `pending` + cursor，
 *   下一轮从 cursor 续批；抛错 → `pending`、failure_count+1，下一轮重试，当天满
 *   `PLAN_DAILY_RUN_MAX_FAILURES` 次记 `failed`（不再重试，第二天重新开始）。释放都带租约令牌做 CAS，
 *   租约已被别人接手时什么也不改。
 * - 单个 actor 的失败由任务自己隔离（计入 summary.failed，维护结果标 partial_failure），不阻挡当天的进度，
 *   第二天的扫描会再遇到它们。
 * - 一轮 pass 内三个任务共用一次当日状态读取（`readDay`，按 pass 的 deadline 记忆）：当天都已完成时，
 *   三个任务合计只有这一次轻查询。
 * - 领取表还没建（迁移未执行，42P01）：不把关，按旧行为直接执行（不因流量优化丢掉业务兜底），
 *   summary 带 `ungated: 1` 以便在维护日志里发现。
 */
import { randomUUID } from "node:crypto";

import type { MaintenanceTaskContext, MaintenanceTaskOutcome } from "../operations/maintenance/pass";
import type { PlanMatchQueryClient } from "./matching-repository";

export const PLAN_DAILY_RUN_LEASE_SECONDS = 300;
export const PLAN_DAILY_RUN_MAX_FAILURES = 3;

export type PlanDailyRunStatus = "pending" | "running" | "completed" | "failed";

export interface PlanDailyRunState {
  status: PlanDailyRunStatus;
  /** running 且租约还没过期。 */
  leaseActive: boolean;
}

export type PlanDailyRunRelease =
  | { kind: "completed" }
  | { kind: "continue"; cursor: string | null }
  | { kind: "failed" };

export interface PlanDailyRunStore {
  /** 当天这些任务的状态（一次轻查询）。没有行的任务不在返回的 Map 里。 */
  readDay(input: { day: string; taskNames: readonly string[] }): Promise<Map<string, PlanDailyRunState>>;
  /** 领取；领到返回续批 cursor（首次为 null），没领到返回 null。 */
  claim(input: { day: string; taskName: string; leaseToken: string; leaseSeconds: number }): Promise<{ cursor: string | null } | null>;
  /** 按租约令牌释放；租约已被别人接手时返回 false、什么也不改。 */
  release(input: { day: string; taskName: string; leaseToken: string; result: PlanDailyRunRelease; maxFailures: number }): Promise<boolean>;
}

/** 一次有上限的执行结果：`hasMore` = 还没处理完（到达上限或截止时间），cursor 是续批位置。 */
export interface PlanDailyBatch {
  summary: Record<string, number>;
  hasMore: boolean;
  cursor: string | null;
}

export type PlanDailyExecute = (cursor: string | null) => Promise<PlanDailyBatch | { skipped: string }>;

export interface PlanDailyGate {
  run(taskName: string, context: MaintenanceTaskContext, execute: PlanDailyExecute): Promise<MaintenanceTaskOutcome>;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

function isSkip(value: PlanDailyBatch | { skipped: string }): value is { skipped: string } {
  return typeof (value as { skipped?: unknown }).skipped === "string";
}

export function createPlanDailyRunGate(input: {
  resolveStore: () => PlanDailyRunStore | null;
  taskNames: readonly string[];
  tokyoDate: (at: Date) => string;
  leaseSeconds?: number;
  maxFailures?: number;
  id?: () => string;
}): PlanDailyGate {
  const leaseSeconds = input.leaseSeconds ?? PLAN_DAILY_RUN_LEASE_SECONDS;
  const maxFailures = input.maxFailures ?? PLAN_DAILY_RUN_MAX_FAILURES;
  const id = input.id ?? randomUUID;
  // 同一轮 pass（同一个 deadline、同一个东京日）只读一次当日状态。
  let snapshot: { key: string; value: Promise<Map<string, PlanDailyRunState> | "ungated"> } | null = null;

  function readSnapshot(store: PlanDailyRunStore, day: string, deadline: number) {
    const key = `${deadline}|${day}`;
    if (snapshot?.key !== key) {
      snapshot = {
        key,
        value: store.readDay({ day, taskNames: input.taskNames }).catch((error: unknown) => {
          if (isUndefinedTable(error)) return "ungated" as const;
          throw error;
        }),
      };
    }
    return snapshot.value;
  }

  async function runUngated(execute: PlanDailyExecute): Promise<MaintenanceTaskOutcome> {
    const outcome = await execute(null);
    return isSkip(outcome) ? outcome : { ...outcome.summary, ungated: 1 };
  }

  return {
    async run(taskName, context, execute) {
      const store = input.resolveStore();
      if (!store) return runUngated(execute);
      const day = input.tokyoDate(context.now());
      const states = await readSnapshot(store, day, context.deadline);
      if (states === "ungated") return runUngated(execute);
      const state = states.get(taskName);
      if (state?.status === "completed") return { skipped: "done_today" };
      if (state?.status === "failed") return { skipped: "failed_today" };
      if (state?.status === "running" && state.leaseActive) return { skipped: "claimed_elsewhere" };

      const leaseToken = id();
      let claimed: { cursor: string | null } | null;
      try {
        claimed = await store.claim({ day, leaseSeconds, leaseToken, taskName });
      } catch (error) {
        if (isUndefinedTable(error)) return runUngated(execute);
        throw error;
      }
      if (!claimed) return { skipped: "claimed_elsewhere" };

      let outcome: PlanDailyBatch | { skipped: string };
      try {
        outcome = await execute(claimed.cursor);
      } catch (error) {
        // 运行失败不记为完成：放回 pending（满上限记 failed），下一轮重试。
        await store
          .release({ day, leaseToken, maxFailures, result: { kind: "failed" }, taskName })
          .catch(() => undefined);
        throw error;
      }
      if (isSkip(outcome)) {
        // 任务自己的表缺失等：按失败计，当天最多重试到上限，不会每轮都来。
        await store.release({ day, leaseToken, maxFailures, result: { kind: "failed" }, taskName });
        return outcome;
      }
      await store.release({
        day,
        leaseToken,
        maxFailures,
        result: outcome.hasMore ? { cursor: outcome.cursor, kind: "continue" } : { kind: "completed" },
        taskName,
      });
      return { ...outcome.summary, hasMore: outcome.hasMore ? 1 : 0 };
    },
  };
}

/* ------------------------------------------------------------------ */
/* PostgreSQL 存储                                                      */
/* ------------------------------------------------------------------ */

export function createPostgresPlanDailyRunStore(options: { pool: PlanMatchQueryClient; workspaceId: string }): PlanDailyRunStore {
  const { pool, workspaceId } = options;
  return {
    async readDay({ day, taskNames }) {
      const result = await pool.query(
        `select task_name, status, (status = 'running' and lease_expires_at > now()) as lease_active
           from plan_maintenance_daily_runs
          where workspace_id = $1 and run_day = $2::date and task_name = any($3::text[])`,
        [workspaceId, day, [...taskNames]],
      );
      return new Map(
        result.rows.map((row) => [
          String(row.task_name),
          { leaseActive: row.lease_active === true, status: String(row.status) as PlanDailyRunStatus },
        ]),
      );
    },

    async claim({ day, leaseSeconds, leaseToken, taskName }) {
      const result = await pool.query(
        `insert into plan_maintenance_daily_runs as r
           (workspace_id, run_day, task_name, status, lease_token, lease_expires_at, run_count)
         values ($1, $2::date, $3, 'running', $4, now() + make_interval(secs => $5), 1)
         on conflict (workspace_id, run_day, task_name) do update
            set status = 'running', lease_token = excluded.lease_token, lease_expires_at = excluded.lease_expires_at,
                run_count = r.run_count + 1, updated_at = now()
          where r.status = 'pending' or (r.status = 'running' and r.lease_expires_at <= now())
         returning r.cursor`,
        [workspaceId, day, taskName, leaseToken, leaseSeconds],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { cursor: typeof row.cursor === "string" ? row.cursor : null };
    },

    async release({ day, leaseToken, maxFailures, result, taskName }) {
      const where = `where workspace_id = $1 and run_day = $2::date and task_name = $3 and status = 'running' and lease_token = $4`;
      let update;
      if (result.kind === "completed") {
        update = await pool.query(
          `update plan_maintenance_daily_runs
              set status = 'completed', lease_token = null, lease_expires_at = null, cursor = null,
                  completed_at = now(), updated_at = now()
            ${where}`,
          [workspaceId, day, taskName, leaseToken],
        );
      } else if (result.kind === "continue") {
        update = await pool.query(
          `update plan_maintenance_daily_runs
              set status = 'pending', lease_token = null, lease_expires_at = null, cursor = $5, updated_at = now()
            ${where}`,
          [workspaceId, day, taskName, leaseToken, result.cursor],
        );
      } else {
        update = await pool.query(
          `update plan_maintenance_daily_runs
              set status = case when failure_count + 1 >= $5 then 'failed' else 'pending' end,
                  failure_count = failure_count + 1, lease_token = null, lease_expires_at = null, updated_at = now()
            ${where}`,
          [workspaceId, day, taskName, leaseToken, Math.max(1, maxFailures)],
        );
      }
      return (update.rowCount ?? 0) > 0;
    },
  };
}
