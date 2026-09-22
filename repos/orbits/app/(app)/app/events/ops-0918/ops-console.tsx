/**
 * 运营台客户端容器（任务 3）：`/app/events/[id]/operations` 与 `?tab=match` 共用一份 `useEventOperations` 会话
 * （同一份 GET / 轮询 / 自动重试），按 `tab` 渲染 概览 或 匹配与分组，套 `OpsConsoleShell`。
 * `tab` 由 page.tsx 从 `searchParams` 读出（页签是路由 `<a>`，切换即整页导航，与 events-0918/events-list 同法）。
 * 「更多 ⌄」菜单（审阅修订 5）：导出 CSV（`/operations/admin/export`）+ 管理角色（`roles.manage` 才出现，
 * `data-event-roles-entry`，进 `?drawer=roles`，抽屉本体任务 6）。
 */
"use client";

import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import { OpsMatch } from "./ops-match";
import { rolesDrawerHref, type OpsConsoleTab } from "./ops-model";
import { OpsOverview } from "./ops-overview";
import { OpsConsoleShell, type OpsMoreItem } from "./ops-shell";
import { useEventOperations } from "./use-event-operations";

export function OpsConsole({
  canManageRoles = false,
  event,
  tab = "ops",
}: {
  canManageRoles?: boolean;
  event: EventOperationsPageEvent;
  tab?: OpsConsoleTab;
}) {
  const session = useEventOperations(event);
  const more: OpsMoreItem[] = [
    { href: `${session.baseUrl}/export`, label: "导出 CSV" },
    ...(canManageRoles ? [{ href: rolesDrawerHref(event.id), label: "管理角色", marker: "data-event-roles-entry" }] : []),
  ];

  return (
    <OpsConsoleShell event={event} more={more} view={tab}>
      {tab === "match" ? <OpsMatch event={event} session={session} /> : <OpsOverview event={event} session={session} />}
    </OpsConsoleShell>
  );
}
