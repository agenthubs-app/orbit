import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { requireEventCapability } from "../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../features/events/event-access/runtime";
import { createConfiguredEventCoreService } from "../../../../../../features/events/core/runtime";
import type { EventOperationsPageEvent } from "../operations/event-operations-page-event";
import { AccountTopNav } from "../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { exportCsvHref } from "../../ops-0918/ops-model";
import { OpsReport } from "../../ops-0918/ops-report";
import { OpsConsoleShell, OpsReportFrame } from "../../ops-0918/ops-shell";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 门禁不动（运营台 任务 5）：本页只有 auth()，分析接口本身按角色返回 403（报告屏显示空态）。壳需要活动标题，
 * 但无能力门禁下不得调 getEvent（未发布活动标题会泄露）→ 只读 getPublishedEvent（已发布标题非机密），失败则以 id 作标题。
 * 合并前终审修正 4：壳的选择按 `operations.read_sensitive` 解析（fail-closed：权限服务缺失 / 校验抛错一律视为无）——
 * 有 → 主办方壳 `OpsConsoleShell`（「更多 ⌄」按 `attendees.export` 决定是否含「导出 CSV」）；无 → `OpsReportFrame`
 * 报告专用最小框架（同一 `op-main`，面包屑「活动中心 / 数据报告」，无六页签 / 无「更多 ⌄」）。两种情况都不改门禁本身。
 */
async function loadPublishedPageEvent(eventId: string): Promise<EventOperationsPageEvent> {
  const eventCore = createConfiguredEventCoreService();
  let event = null;
  try {
    event = eventCore ? await eventCore.getPublishedEvent(eventId) : null;
  } catch {
    event = null;
  }
  return Object.freeze({
    endsAt: event?.endsAt ?? "",
    id: eventId,
    startsAt: event?.startsAt ?? "",
    title: event?.title?.trim() || eventId,
  });
}

export default async function EventAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(
        `/app/events/${eventId}/analytics`,
      )}`,
    );
  }

  const pageEvent = await loadPublishedPageEvent(eventId);
  const accessService = createConfiguredEventAccessService();
  const hasCapability = async (capability: "attendees.export" | "operations.read_sensitive"): Promise<boolean> => {
    if (!accessService) return false;
    try {
      await requireEventCapability({ actorId: session.user.id, capability, eventId, service: accessService });
      return true;
    } catch {
      return false;
    }
  };
  const organizerShell = await hasCapability("operations.read_sensitive");
  const canExport = organizerShell && await hasCapability("attendees.export");

  return (
    <>
      <OrbitReferenceStyles />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="ops-0918">
        <AccountTopNav active="events" />
        {organizerShell ? (
          /* 「更多 ⌄」只放 导出 CSV（任务 5 决定；attendees.export 才出现，导出接口自行按能力校验） */
          <OpsConsoleShell event={pageEvent} more={canExport ? [{ href: exportCsvHref(eventId), label: "导出 CSV" }] : []} view="report">
            <OpsReport event={pageEvent} />
          </OpsConsoleShell>
        ) : (
          <OpsReportFrame event={pageEvent}>
            <OpsReport event={pageEvent} />
          </OpsReportFrame>
        )}
      </div>
    </>
  );
}
