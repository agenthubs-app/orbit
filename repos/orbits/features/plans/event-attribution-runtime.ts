/**
 * 活动归属的 live 数据来源（Sprint W0015）：活动取 canonical 已发布目录，报名状态与活动页／iOrbit
 * 同一个读取入口（`listRuntimeEventRegistrationsForUser`，只认 rsvped）。目录不可用时返回 null，
 * 调用方按「没有候选」处理（不询问，也不接受提交的活动 id）。
 */
import { createConfiguredEventCoreService } from "../events/core/runtime";
import { listRuntimeEventRegistrationsForUser } from "../events/registration/runtime";
import type { AttributionEvent, EventAttributionSource } from "./event-attribution";

export function createConfiguredEventAttributionSource(): EventAttributionSource | null {
  const core = createConfiguredEventCoreService();
  if (!core) return null;
  return {
    async listEventsStartingBetween(fromIso, toIso) {
      const from = Date.parse(fromIso);
      const to = Date.parse(toIso);
      const events = await core.listPublishedEvents();
      return events
        .filter((event) => {
          const start = Date.parse(event.startsAt);
          return start >= from && start < to;
        })
        .map((event): AttributionEvent => ({ eventId: event.eventId, startsAt: event.startsAt, title: event.title }));
    },
    async registeredEventIds({ eventIds, userId }) {
      const registrations = await listRuntimeEventRegistrationsForUser({ eventIds, userId });
      return new Set(
        registrations.filter((registration) => registration.status === "rsvped").map((registration) => registration.eventId),
      );
    },
  };
}

/** 名片确认核实归属后：把本人生效计划里的这场活动标为已参加（幂等；计划服务未配置时什么都不做，读写出错时抛出——两种情况都由 `plan-event-attendance` 维护任务对账补上）。 */
export async function markPlanEventAttendedForActor(input: { actorId: string; eventId: string }): Promise<void> {
  const { resolvePlanService } = await import("./service-factory");
  const resolution = resolvePlanService({ actorId: input.actorId });
  if (resolution.success === false) return;
  await resolution.service.markEventAttended({ eventId: input.eventId });
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
