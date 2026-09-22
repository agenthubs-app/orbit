import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { requireEventCapability } from "../../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../../features/events/event-access/runtime";
import { createConfiguredEventCoreService } from "../../../../../../../features/events/core/runtime";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OpsBoundary } from "../../../ops-0918/ops-boundary";
import { OpsForm } from "../../../ops-0918/ops-form";
import { exportCsvHref } from "../../../ops-0918/ops-model";
import { OpsConsoleShell } from "../../../ops-0918/ops-shell";
import { loadEventOperationsPageEvent } from "../event-operations-page-event";

export const dynamic = "force-dynamic";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// 门禁（运营台 任务 5，「门禁不动」的例外，审阅修订 8）：本页原无 auth() / 能力检查（题集 API 自行校验），但壳现在经
// loadEventOperationsPageEvent → eventCore.getEvent 读标题，会把未发布活动的标题泄露给任意登录用户。故先 auth() 未登录重定向，
// 再按题集 API 同一能力 `experience.configure`（GET/PUT /experience 的 withEventCapabilityAccess）做 per-event 校验；未通过 → Boundary，不读活动。
export default async function AppEventExperiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  const pathname = `/app/events/${encodeURIComponent(eventId)}/operations/experience`;
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(pathname)}`);
  }

  const eventCore = createConfiguredEventCoreService();
  const accessService = createConfiguredEventAccessService();
  if (!eventCore || !accessService) {
    return <OpsBoundary description="活动核心或权限服务暂时不可用，报名设置入口暂时关闭。" eyebrow="EVENT OPERATIONS · EXPERIENCE" page="event-experience-boundary" retryHref={`/app/events/${encodeURIComponent(eventId)}/operations/experience`} title="报名设置暂时不可用" />;
  }

  try {
    await requireEventCapability({
      actorId: session.user.id,
      capability: "experience.configure",
      eventId,
      service: accessService,
    });
  } catch {
    return <OpsBoundary description="只有当前活动主办方或被授予运营角色的成员可以编辑报名设置。" eyebrow="EVENT OPERATIONS · EXPERIENCE" page="event-experience-boundary" retryHref={`/app/events/${encodeURIComponent(eventId)}/operations/experience`} title="没有报名设置权限" />;
  }

  // 门禁已过：壳（面包屑 / 标题 / 预览卡）读 canonical Event Core 标题与时间；读不到时退回 eventId（loadEventOperationsPageEvent 既有规则）。
  const pageEvent = await loadEventOperationsPageEvent(eventId, eventCore);

  return (
    <>
      <OrbitReferenceStyles />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="ops-0918">
        <AccountTopNav active="events" />
        {/* 「更多 ⌄」只放 导出 CSV（任务 5 决定；管理角色需 roles.manage，本页不解析） */}
        <OpsConsoleShell event={pageEvent} more={[{ href: exportCsvHref(eventId), label: "导出 CSV" }]} view="form">
          <OpsForm event={pageEvent} />
        </OpsConsoleShell>
      </div>
    </>
  );
}
