import { NextResponse } from "next/server";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { resolveSharedReadBudgetGate } from "../../../../features/sync/read-budget-gate";

export type MemoEventOption = { eventId: string; title: string; startsAt: string };

/**
 * 「记一笔交流」：GET /api/contacts/memo-event-options（只读、要登录）。
 * 人脉抽屉的弹层选「活动上遇到」时才读一次：本人近 30 天到明天报名的活动（至多 20 条，只取 id／标题／开始时间，
 * 与旧版「写 memo」弹窗同一读取 readMemoEventOptions）。浏览器按所选日期筛当天的活动。读失败返回空数组。
 */
export function createMemoEventOptionsGetHandler(options: {
  resolveActor?: ResolveAuthenticatedApiActor;
  read?: (input: { actorId: string; now: Date }) => Promise<MemoEventOption[]>;
  now?: () => Date;
} = {}) {
  return async function GET(): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const headers = { "Cache-Control": "private, no-store" };
    try {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "personal_schedule_items" });
      const read = options.read ?? (async (input: { actorId: string; now: Date }) => (await import("../../../../features/relationship-timeline/reader")).readMemoEventOptions(input));
      const items = await read({ actorId: actor.id, now: (options.now ?? (() => new Date()))() });
      return NextResponse.json(success({ options: items }), { headers });
    } catch (error) {
      const safe = error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "Event options are temporarily unavailable.");
      return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
