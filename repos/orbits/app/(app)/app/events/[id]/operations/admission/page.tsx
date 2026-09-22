import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { requireEventCapability } from "../../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../../features/events/event-access/runtime";
import { createConfiguredEventCoreService } from "../../../../../../../features/events/core/runtime";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OpsBoundary } from "../../../ops-0918/ops-boundary";
import { exportCsvHref } from "../../../ops-0918/ops-model";
import { OpsPeople } from "../../../ops-0918/ops-people";
import { OpsConsoleShell } from "../../../ops-0918/ops-shell";
import { loadEventOperationsPageEvent } from "../event-operations-page-event";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EventAdmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const routeIdValue = routeEventId(routeId);
  const pathname = `/app/events/${encodeURIComponent(routeIdValue)}/operations/admission`;
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(pathname)}`);
  }

  const eventCore = createConfiguredEventCoreService();
  const accessService = createConfiguredEventAccessService();
  if (!eventCore || !accessService) {
    return <OpsBoundary description="活动核心或权限服务暂时不可用；没有读取旧活动目录作为替代。" eyebrow="EVENT ADMISSION · REVIEW" page="event-admission-review-boundary" retryHref={`/app/events/${encodeURIComponent(routeIdValue)}/operations/admission`} title="报名审核暂时不可用" />;
  }

  let event;
  try {
    event = await eventCore.getPublishedEvent(routeIdValue);
  } catch {
    event = null;
  }
  if (!event) {
    return <OpsBoundary description="该活动尚未形成完整、已发布的 canonical Event Core 记录，因此审核入口保持关闭。" eyebrow="EVENT ADMISSION · REVIEW" page="event-admission-review-boundary" retryHref={`/app/events/${encodeURIComponent(routeIdValue)}/operations/admission`} title="活动尚未完成迁移" />;
  }

  try {
    await requireEventCapability({
      actorId: session.user.id,
      capability: "admission.read",
      eventId: event.eventId,
      service: accessService,
    });
  } catch {
    return <OpsBoundary description="只有当前活动负责人或被授予审核角色的成员可以查看报名画像并作出决定。" eyebrow="EVENT ADMISSION · REVIEW" page="event-admission-review-boundary" retryHref={`/app/events/${encodeURIComponent(event.eventId)}/operations/admission`} title="没有报名审核权限" />;
  }

  let canConfigurePolicy = false;
  try {
    await requireEventCapability({
      actorId: session.user.id,
      capability: "roles.manage",
      eventId: event.eventId,
      service: accessService,
    });
    canConfigurePolicy = true;
  } catch {
    // Reviewers retain read/decision access. Policy writes are reserved for
    // the Event Core owner through the owner-only roles.manage capability.
  }

  // 合并前终审修正 5：「导出 CSV」按导出接口同一能力 attendees.export 解析（fail-closed），无则菜单不含该项。
  let canExport = false;
  try {
    await requireEventCapability({
      actorId: session.user.id,
      capability: "attendees.export",
      eventId: event.eventId,
      service: accessService,
    });
    canExport = true;
  } catch {
    canExport = false;
  }
  // 审阅修订 8：壳（面包屑 / 标题）读 canonical Event Core；门禁已过，读取范围与 operations/page.tsx 一致。
  const pageEvent = await loadEventOperationsPageEvent(event.eventId, eventCore);

  return (
    <>
      <OrbitReferenceStyles />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="ops-0918">
        <AccountTopNav active="events" />
        {/* 「更多 ⌄」只放 导出 CSV（attendees.export 才出现，合并前终审修正 5）：管理角色需 roles.manage 页签级解析，本页不解析（任务 4 决定） */}
        <OpsConsoleShell event={pageEvent} more={canExport ? [{ href: exportCsvHref(event.eventId), label: "导出 CSV" }] : []} view="people">
          <OpsPeople canConfigurePolicy={canConfigurePolicy} event={pageEvent} />
        </OpsConsoleShell>
      </div>
    </>
  );
}
