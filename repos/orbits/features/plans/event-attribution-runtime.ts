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
