/**
 * 活动归属的 live 数据来源（Sprint W0015）：活动取 canonical 已发布目录，报名状态与活动页／iOrbit
 * 同一个读取入口（`listRuntimeEventRegistrationsForUser`，只认 rsvped）。目录不可用时返回 null，
 * 调用方按「没有候选」处理（不询问，也不接受提交的活动 id）。
 *
 * W0021：活动改为数据库层按开始时间窗口粗筛（`EventStartWindowReader`，只取 id／标题／开始时间三列），
 * 不再读整个 workspace 的活动目录后在内存里过滤；逐卡判定与平局规则不变。
 */
import { createConfiguredEventStartWindowReader } from "../events/core/runtime";
import type { EventStartWindowReader } from "../events/core/start-window";
import { listRuntimeEventRegistrationsForUser } from "../events/registration/runtime";
import type { AttributionEvent, EventAttributionSource } from "./event-attribution";

export function createConfiguredEventAttributionSource(): EventAttributionSource | null {
  const startWindow = createConfiguredEventStartWindowReader();
  if (!startWindow) return null;
  return createEventAttributionSource({
    readRegistrations: listRuntimeEventRegistrationsForUser,
    window: startWindow,
  });
}

/** 由窗口读取与报名读取组成的来源（live 装配与 PG 测试共用）。 */
export function createEventAttributionSource(deps: {
  window: EventStartWindowReader;
  readRegistrations: (input: { eventIds: readonly string[]; userId: string }) => Promise<ReadonlyArray<{ eventId: string; status: string }>>;
}): EventAttributionSource {
  return {
    async listEventsStartingBetween(fromIso, toIso) {
      const events = await deps.window.listPublishedStartingBetween(fromIso, toIso);
      return events.map((event): AttributionEvent => ({ eventId: event.eventId, startsAt: event.startsAt, title: event.title }));
    },
    async registeredEventIds({ eventIds, userId }) {
      const registrations = await deps.readRegistrations({ eventIds, userId });
      return new Set(
        registrations.filter((registration) => registration.status === "rsvped").map((registration) => registration.eventId),
      );
    },
  };
}

/**
 * 名片确认核实归属后：把本人生效计划里的这场活动标为已参加（幂等；计划服务未配置时什么都不做，读写出错时抛出——
 * 两种情况都由 `plan-event-attendance` 维护任务对账补上）。
 *
 * 复核 M4：v1（`markEventAttended`）与 v2（イベント枠计分 `recordEventAttendanceForPlans`）各自 try、互不挡：
 * 一边失败另一边照常写；两边都跑完后，有失败就抛出第一个错误（调用方记录后吞掉，对账任务补）。
 */
export async function markPlanEventAttendedForActor(
  input: { actorId: string; eventId: string },
  deps: {
    v1?: () => Promise<{ markEventAttended(input: { eventId: string }): Promise<unknown> } | null>;
    v2?: () => Promise<{ hasActivePlan(): Promise<boolean>; recordEventAttendanceForPlans(input: { eventId: string }): Promise<unknown> } | null>;
  } = {},
): Promise<void> {
  const failures: unknown[] = [];
  try {
    const v1 = await (deps.v1 ?? (async () => {
      const { resolvePlanService } = await import("./service-factory");
      const resolution = resolvePlanService({ actorId: input.actorId });
      return resolution.success === false ? null : resolution.service;
    }))();
    if (v1) await v1.markEventAttended({ eventId: input.eventId });
  } catch (error) {
    failures.push(error);
  }
  try {
    // R24：v2 计划的イベント枠——每个有イベント枠的生效目标各记一次（重复不记，已达成不记）。
    const v2 = await (deps.v2 ?? (async () => {
      const { resolvePlanV2Service } = await import("./v2/service-factory");
      const resolution = resolvePlanV2Service({ actorId: input.actorId });
      return resolution.success === false ? null : resolution.service;
    }))();
    if (v2 && (await v2.hasActivePlan())) await v2.recordEventAttendanceForPlans({ eventId: input.eventId });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) throw failures[0];
}

/**
 * W0012：活动报名／取消报名成功后，把本人生效计划里的这场活动跟着改成「已报名」／「推荐」，并写一条
 * 幂等的进展记录（`PlanService.markEventRegistration`）。报名是主数据：计划服务未配置时什么都不做；
 * 读写出错时抛出，由路由记录后吞掉（不影响报名结果）。
 */
export async function syncPlanEventRegistrationForActor(input: {
  actorId: string;
  eventId: string;
  registered: boolean;
  registrationVersion: string;
}): Promise<void> {
  const { resolvePlanService } = await import("./service-factory");
  const resolution = resolvePlanService({ actorId: input.actorId });
  if (resolution.success === false) return;
  await resolution.service.markEventRegistration({
    eventId: input.eventId,
    registered: input.registered,
    registrationVersion: input.registrationVersion,
  });
}

/**
 * W0012 对账：本人在这些活动上的当前报名（与活动页、iOrbit 同一个读取入口）。报名路由用计划同一个
 * actor id 作为报名的 userId，所以这里同样按计划的 actorId 读。
 */
export async function readRuntimeRegistrationsForPlanActor(input: {
  actorId: string;
  eventIds: readonly string[];
}): Promise<Array<{ eventId: string; status: "rsvped" | "cancelled"; updatedAt: string }>> {
  const registrations = await listRuntimeEventRegistrationsForUser({ eventIds: input.eventIds, userId: input.actorId });
  return registrations.map((registration) => ({
    eventId: registration.eventId,
    status: registration.status,
    updatedAt: registration.updatedAt,
  }));
}
