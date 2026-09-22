import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { requireEventCapability } from "../../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../../features/events/event-access/runtime";
import { createConfiguredEventCoreService } from "../../../../../../../features/events/core/runtime";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OpsBoundary } from "../../../ops-0918/ops-boundary";
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

// 门禁（任务 4 评审修正，「门禁不动」的例外）：本页原只有 auth()，但壳现在经 loadEventOperationsPageEvent →
// eventCore.getEvent 读标题，会把未发布活动的标题泄露给任意登录用户。故在读取活动前按名单 API 同一能力
// `check_in.roster.read_limited`（GET /operations/admin/check-ins）做 per-event 校验；未通过 → Boundary，不读活动。
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

  const eventCore = createConfiguredEventCoreService();
  const accessService = createConfiguredEventAccessService();
  if (!eventCore || !accessService) {
    return <OpsBoundary description="活动核心或权限服务暂时不可用，签到名单入口暂时关闭。" eyebrow="EVENT OPERATIONS · CHECK-IN" page="event-check-in-boundary" retryHref={`/app/events/${encodeURIComponent(eventId)}/operations/check-in`} title="签到名单暂时不可用" />;
  }

  try {
    await requireEventCapability({
      actorId: session.user.id,
      capability: "check_in.roster.read_limited",
      eventId,
      service: accessService,
    });
  } catch {
    return <OpsBoundary description="只有当前活动主办方或被授予签到角色的成员可以打开签到名单。" eyebrow="EVENT OPERATIONS · CHECK-IN" page="event-check-in-boundary" retryHref={`/app/events/${encodeURIComponent(eventId)}/operations/check-in`} title="没有签到权限" />;
  }

  // 门禁已过：壳（面包屑 / 标题）读 canonical Event Core 标题；读不到时退回 eventId（loadEventOperationsPageEvent 既有规则）。
  const pageEvent = await loadEventOperationsPageEvent(eventId, eventCore);

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
