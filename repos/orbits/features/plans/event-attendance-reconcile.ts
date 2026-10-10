/**
 * `plan-event-attendance` 维护任务（RW-11，Sprint W0015）：活动归属的计划写入对账。
 *
 * 名片确认时联系人先提交（联系人是主数据），随后尽力把计划里的这场活动标为已参加；那一步失败
 * 或计划服务当时未配置时，这里兜底：找出本人已有联系人记着 `metEventId`、但生效计划里对应活动
 * （同一 `linkedEventId`）还没「已参加」的 (actor, 活动)，逐个调用幂等的 `markEventAttended`
 * （一条进展记录；已参加后不再出现在查询里）。有上限，到截止时间就停。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import type { PlanService } from "./contract";
import type { PlanDailyBatch, PlanDailyGate } from "./maintenance-daily-gate";
import type { PlanMatchRepository } from "./matching-repository";

export const PLAN_EVENT_ATTENDANCE_TASK = "plan-event-attendance";
/** 每次维护最多处理的 (actor, 活动) 数。 */
export const PLAN_EVENT_ATTENDANCE_LIMIT = 50;

/** v2 计划服务里对账要用的部分。 */
export interface PlanEventAttendanceV2Service {
  recordEventAttendanceForPlans(input: { eventId: string; skipIfEverScored?: boolean }): Promise<ReadonlyArray<unknown>>;
}

export interface PlanEventAttendanceDeps {
  repository: Pick<PlanMatchRepository, "listUnattendedAttributedEvents" | "listUnscoredAttributedEventsV2">;
  planServiceFor: (actorId: string) => PlanService;
  /** R24 复核 M4：v2 计划的イベント枠对账；不给时按 actor 解析 live 的 v2 服务。 */
  planV2ServiceFor?: (actorId: string) => Promise<PlanEventAttendanceV2Service>;
}

async function liveV2ServiceFor(actorId: string): Promise<PlanEventAttendanceV2Service> {
  const { resolvePlanV2Service } = await import("./v2/service-factory");
  const resolution = resolvePlanV2Service({ actorId, mode: "live" });
  if (resolution.success === false) throw new Error(resolution.error.message);
  return resolution.service;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

/** 续批位置：本批最后处理的 (actor, 活动)，JSON 编码。 */
function encodeCursor(value: { actorId: string; eventId: string }): string {
  return JSON.stringify([value.actorId, value.eventId]);
}

function decodeCursor(cursor: string | null | undefined): { actorId: string; eventId: string } | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((part) => typeof part === "string")) {
      return { actorId: parsed[0] as string, eventId: parsed[1] as string };
    }
  } catch {
    // 无法识别的 cursor：从头扫，结果仍然幂等。
  }
  return null;
}

/** 一批：`hasMore` = 取满上限或到截止时间停下（同一东京日续批）。 */
export async function reconcileEventAttendanceBatch(
  deps: PlanEventAttendanceDeps,
  input: { limit: number; cursor?: string | null; deadline?: number; now?: () => number },
): Promise<PlanDailyBatch & { summary: { examined: number; marked: number; failed: number; v2Examined?: number; v2Marked?: number; v2Failed?: number } }> {
  const now = input.now ?? Date.now;
  const summary: { examined: number; marked: number; failed: number; v2Examined?: number; v2Marked?: number; v2Failed?: number } = { examined: 0, failed: 0, marked: 0 };
  const after = decodeCursor(input.cursor);
  const pending = await deps.repository.listUnattendedAttributedEvents({ after, limit: input.limit });
  let cursor = after ? encodeCursor(after) : null;
  let stopped = false;
  for (const { actorId, eventId } of pending) {
    if (input.deadline !== undefined && now() >= input.deadline) {
      stopped = true;
      break;
    }
    summary.examined += 1;
    cursor = encodeCursor({ actorId, eventId });
    try {
      const result = await deps.planServiceFor(actorId).markEventAttended({ eventId });
      if (result.logs.length > 0) summary.marked += 1;
    } catch {
      // 单个 actor 失败不挡住其他人，下次扫描再试。
      summary.failed += 1;
    }
  }
  // R24 复核 M4：v2 的イベント枠对账——每个东京日的第一批跑一次（查询只返回还没计过分的，自然推进；超过上限的留到明天）。
  // v1 的计划写入失败与 v2 互不影响：单个 actor 失败只记数。
  if (!input.cursor && deps.repository.listUnscoredAttributedEventsV2 && !stopped) {
    const v2Pending = await deps.repository.listUnscoredAttributedEventsV2({ limit: input.limit });
    const v2For = deps.planV2ServiceFor ?? liveV2ServiceFor;
    // 没有要补的 v2 时摘要形状不变（只在有事可做时出现 v2* 计数）。
    const v2 = { examined: 0, failed: 0, marked: 0 };
    for (const { actorId, eventId } of v2Pending) {
      if (input.deadline !== undefined && now() >= input.deadline) break;
      v2.examined += 1;
      try {
        const results = await (await v2For(actorId)).recordEventAttendanceForPlans({ eventId, skipIfEverScored: true });
        if (results.length > 0) v2.marked += 1;
      } catch {
        v2.failed += 1;
      }
    }
    if (v2.examined > 0) Object.assign(summary, { v2Examined: v2.examined, v2Failed: v2.failed, v2Marked: v2.marked });
  }
  return { cursor, hasMore: stopped || pending.length >= input.limit, summary };
}

export async function reconcileEventAttendance(
  deps: PlanEventAttendanceDeps,
  input: { limit: number; deadline?: number; now?: () => number },
): Promise<{ examined: number; marked: number; failed: number }> {
  return (await reconcileEventAttendanceBatch(deps, input)).summary;
}

/** `gate` 存在时（生产装配）每个东京自然日最多真正执行一次，见 `maintenance-daily-gate.ts`。 */
export function createPlanEventAttendanceMaintenanceTask(input: {
  resolve: () => PlanEventAttendanceDeps | null;
  limit?: number;
  gate?: PlanDailyGate;
}): MaintenanceTask {
  return {
    name: PLAN_EVENT_ATTENDANCE_TASK,
    async run(context) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const execute = async (cursor: string | null): Promise<PlanDailyBatch | { skipped: string }> => {
        try {
          return await reconcileEventAttendanceBatch(deps, {
            cursor,
            deadline: context.deadline,
            limit: input.limit ?? PLAN_EVENT_ATTENDANCE_LIMIT,
            now: () => context.now().getTime(),
          });
        } catch (error) {
          if (isUndefinedTable(error)) return { skipped: "schema_missing" };
          throw error;
        }
      };
      if (input.gate) return input.gate.run(PLAN_EVENT_ATTENDANCE_TASK, context, execute);
      const outcome = await execute(null);
      return "skipped" in outcome ? outcome : outcome.summary;
    },
  };
}
