/**
 * 运营台客户端容器（任务 3）：`/app/events/[id]/operations` 与 `?tab=match` 共用一份 `useEventOperations` 会话
 * （同一份 GET / 轮询 / 自动重试），按 `tab` 渲染 概览 或 匹配与分组，套 `OpsConsoleShell`。
 * `tab` 由 page.tsx 从 `searchParams` 读出（页签是路由 `<a>`，切换即整页导航，与 events-0918/events-list 同法）。
 * 「更多 ⌄」菜单（审阅修订 5）：导出 CSV（`/operations/admin/export`，合并前终审修正 5：`attendees.export` 才出现，
 * 由 page.tsx 解析为 `canExport`）+ 管理角色（`roles.manage` 才出现，
 * `data-event-roles-entry`，进 `?drawer=roles`）。协作者抽屉（任务 6）：page.tsx 读 `searchParams.drawer`（`opsDrawer`），
 * `canManageRoles && drawer === "roles"` 才挂 `OpsRolesDrawer`（无权限时忽略参数）；关闭 = 整页导航回当前页签（去掉 `?drawer`）。
 */
"use client";

import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import { OpsMatch } from "./ops-match";
import { opsHref, rolesDrawerHref, type OpsConsoleTab, type OpsDrawer } from "./ops-model";
import { OpsOverview } from "./ops-overview";
import { OpsRolesDrawer } from "./ops-roles-drawer";
import { OpsConsoleShell, type OpsMoreItem } from "./ops-shell";
import { useEventOperations } from "./use-event-operations";

export function OpsConsole({
  canExport = false,
  canManageRoles = false,
  drawer = null,
  event,
  tab = "ops",
}: {
  /** page.tsx 解析的 `attendees.export`（导出接口同一能力）；缺省 false（fail-closed），菜单不含「导出 CSV」。 */
  canExport?: boolean;
  canManageRoles?: boolean;
  drawer?: OpsDrawer | null;
  event: EventOperationsPageEvent;
  tab?: OpsConsoleTab;
}) {
  const session = useEventOperations(event);
  const more: OpsMoreItem[] = [
    ...(canExport ? [{ href: `${session.baseUrl}/export`, label: "导出 CSV" }] : []),
    ...(canManageRoles ? [{ href: rolesDrawerHref(event.id), label: "管理角色", marker: "data-event-roles-entry" }] : []),
  ];

  const rolesDrawer = canManageRoles && drawer === "roles"
    ? <OpsRolesDrawer closeHref={opsHref(event.id, tab)} eventId={event.id} />
    : null;

  return (
    <OpsConsoleShell drawer={rolesDrawer} event={event} more={more} view={tab}>
      {tab === "match" ? <OpsMatch event={event} session={session} /> : <OpsOverview event={event} session={session} />}
    </OpsConsoleShell>
  );
}
