/**
 * `plan-event-registration` 维护任务（RW-12，Sprint W0012）：报名状态的计划写入对账。
 *
 * 报名／取消是主数据：路由在报名成功后尽力调用 `markEventRegistration`，那一步失败（计划库不可用、
 * 进程中断）时计划里的活动会停在旧状态。这里兜底：取生效计划里还没「已参加」的活动条目
 * （`listActiveEventItems`，按 actor，有上限），按本人读当前的报名状态（与活动页同一个读取入口），
 * 状态不一致的逐个用报名记录的版本重放幂等的 `markEventRegistration`：
 * - 报名有效（rsvped）而条目是「推荐」→ 已报名；
 * - 报名已取消而条目是「已报名」→ 推荐；
 * - 没有报名记录：不动（没有证据说明取消过）；已参加是终态，查询里就不出现。
 * 版本比较在服务里做，重放的是当前真实状态，不会被更早的请求覆盖。每次最多重放 50 条，
 * 单个 actor 失败不影响其他人，到截止时间就停。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import type { PlanService } from "./contract";
import type { PlanDailyBatch, PlanDailyGate } from "./maintenance-daily-gate";

export const PLAN_EVENT_REGISTRATION_TASK = "plan-event-registration";
/** 每次维护最多重放的 (actor, 活动) 数。 */
export const PLAN_EVENT_REGISTRATION_LIMIT = 50;
/** 每批最多检查的计划活动条目数（按固定顺序分批，同一东京日续批直到扫完）。 */
export const PLAN_EVENT_REGISTRATION_SCAN = 200;

export interface PlanEventItemState {
  actorId: string;
  eventId: string;
  /** 计划条目 id（续批排序的最后一键）；内存实现可以不给。 */
  itemId?: string;
  status: "recommended" | "registered";
}

type ItemCursor = { actorId: string; eventId: string; itemId: string };

export interface CurrentRegistration {
  eventId: string;
  status: "rsvped" | "cancelled";
  updatedAt: string;
}

export interface PlanEventRegistrationDeps {
  listActiveEventItems(input: { limit: number; after?: ItemCursor | null }): Promise<PlanEventItemState[]>;
  /** 本人在这些活动上的当前报名（只读本人）。 */
  readRegistrations(input: { actorId: string; eventIds: readonly string[] }): Promise<CurrentRegistration[]>;
  planServiceFor: (actorId: string) => PlanService;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

function encodeCursor(item: PlanEventItemState): string {
  return JSON.stringify([item.actorId, item.eventId, item.itemId ?? ""]);
}

function decodeCursor(cursor: string | null | undefined): ItemCursor | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((part) => typeof part === "string")) {
      return { actorId: parsed[0] as string, eventId: parsed[1] as string, itemId: parsed[2] as string };
    }
  } catch {
    // 无法识别的 cursor：从头扫，重放按版本比较，结果仍然幂等。
  }
  return null;
}

/**
 * 一批：按 (actor, 活动, 条目) 顺序从 cursor 之后取最多 `scan` 条，重放最多 `limit` 条。
 * `hasMore` = 取满 `scan`、重放到上限或到截止时间停下；cursor 是最后检查过的条目（同一东京日续批）。
 */
export async function reconcileEventRegistrationsBatch(
  deps: PlanEventRegistrationDeps,
  input: { limit: number; scan?: number; cursor?: string | null; deadline?: number; now?: () => number },
): Promise<PlanDailyBatch & { summary: { examined: number; replayed: number; failed: number } }> {
  const now = input.now ?? Date.now;
  const scan = input.scan ?? PLAN_EVENT_REGISTRATION_SCAN;
  const summary = { examined: 0, failed: 0, replayed: 0 };
  const after = decodeCursor(input.cursor);
  const items = await deps.listActiveEventItems({ after, limit: scan });
  const byActor = new Map<string, PlanEventItemState[]>();
  for (const item of items) byActor.set(item.actorId, [...(byActor.get(item.actorId) ?? []), item]);
  let cursor = input.cursor && after ? input.cursor : null;
  let stopped = false;
  outer: for (const [actorId, actorItems] of byActor) {
    if (summary.replayed + summary.failed >= input.limit || (input.deadline !== undefined && now() >= input.deadline)) {
      stopped = true;
      break;
    }
    let registrations: CurrentRegistration[];
    try {
      registrations = await deps.readRegistrations({ actorId, eventIds: actorItems.map((item) => item.eventId) });
    } catch {
      summary.failed += 1;
      // 这个人的条目算检查过（第二天的扫描再遇到）；不挡住其他人。
      cursor = encodeCursor(actorItems[actorItems.length - 1]!);
      continue;
    }
    const current = new Map(registrations.map((registration) => [registration.eventId, registration]));
    for (const item of actorItems) {
      if (summary.replayed + summary.failed >= input.limit) {
        stopped = true;
        break outer;
      }
      summary.examined += 1;
      cursor = encodeCursor(item);
      const registration = current.get(item.eventId);
      if (!registration) continue;
      const registered = registration.status === "rsvped";
      if (registered === (item.status === "registered")) continue;
      try {
        const result = await deps.planServiceFor(actorId).markEventRegistration({
          eventId: item.eventId,
          registered,
          registrationVersion: registration.updatedAt,
        });
        if (result.log) summary.replayed += 1;
      } catch {
        summary.failed += 1;
      }
    }
  }
  return { cursor, hasMore: stopped || items.length >= scan, summary };
}

export async function reconcileEventRegistrations(
  deps: PlanEventRegistrationDeps,
  input: { limit: number; scan?: number; deadline?: number; now?: () => number },
): Promise<{ examined: number; replayed: number; failed: number }> {
  return (await reconcileEventRegistrationsBatch(deps, input)).summary;
}

/** `gate` 存在时（生产装配）每个东京自然日最多真正执行一次、同一天续批扫完，见 `maintenance-daily-gate.ts`。 */
export function createPlanEventRegistrationMaintenanceTask(input: {
  resolve: () => PlanEventRegistrationDeps | null;
  limit?: number;
  scan?: number;
  gate?: PlanDailyGate;
}): MaintenanceTask {
  return {
    name: PLAN_EVENT_REGISTRATION_TASK,
    async run(context) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const execute = async (cursor: string | null): Promise<PlanDailyBatch | { skipped: string }> => {
        try {
          return await reconcileEventRegistrationsBatch(deps, {
            cursor,
            deadline: context.deadline,
            limit: input.limit ?? PLAN_EVENT_REGISTRATION_LIMIT,
            now: () => context.now().getTime(),
            scan: input.scan,
          });
        } catch (error) {
          if (isUndefinedTable(error)) return { skipped: "schema_missing" };
          throw error;
        }
      };
      if (input.gate) return input.gate.run(PLAN_EVENT_REGISTRATION_TASK, context, execute);
      const outcome = await execute(null);
      return "skipped" in outcome ? outcome : outcome.summary;
    },
  };
}
