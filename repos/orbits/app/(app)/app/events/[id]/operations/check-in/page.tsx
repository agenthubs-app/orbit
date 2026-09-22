import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { createConfiguredEventCoreService } from "../../../../../../../features/events/core/runtime";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OpsCheckin } from "../../../ops-0918/ops-checkin";
import { exportCsvHref } from "../../../ops-0918/ops-model";
import { OpsConsoleShell } from "../../../ops-0918/ops-shell";
import { loadEventOperationsPageEvent } from "../event-operations-page-event";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// 门禁现状（审阅修订 8 记录）：本页只有 auth()，签到能力由 `GET|POST /operations/admin/check-ins` 按请求校验；保持不动。
export default async function EventOperationsCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  const pathname = `/app/events/${encodeURIComponent(eventId)}/operations/check-in`;
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(pathname)}`);
  }

  // 壳（面包屑 / 标题）读 canonical Event Core 标题；读不到时退回 eventId（loadEventOperationsPageEvent 既有规则）。
  const pageEvent = await loadEventOperationsPageEvent(eventId, createConfiguredEventCoreService());

  return (
    <>
      <OrbitReferenceStyles />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="ops-0918">
        <AccountTopNav active="events" />
        {/* 「更多 ⌄」只放 导出 CSV：管理角色需 roles.manage，本页不解析（任务 4 决定） */}
        <OpsConsoleShell event={pageEvent} more={[{ href: exportCsvHref(eventId), label: "导出 CSV" }]} view="checkin">
          <OpsCheckin event={pageEvent} />
        </OpsConsoleShell>
      </div>
    </>
  );
}
