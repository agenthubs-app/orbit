/**
 * 管理后台活动页 route adapter。
 *
 * 复用 admin view model，只把渲染目标切换到活动管理组件。
 */
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import type { OrbitLanguage } from "../../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { adminRecoveryText, adminRouteStateText } from "../../orbit-2026/copy/admin";
import { Card, ListRow, Orbit2026Scope } from "../../orbit-2026/ui";
import {
  loadAppAdminPlatformRouteViewModel,
  type AppAdminPlatformRouteStateViewModel,
} from "../compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model";
import { OrbitRealAdminEvents } from "../orbit-real-admin-events";
import styles from "../Admin.module.css";

async function getAdminEventsPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function AdminEventsRouteStateBoundary({
  routeState,
  language,
}: {
  routeState: AppAdminPlatformRouteStateViewModel;
  language: OrbitLanguage;
}) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <main className={styles.errorPage} data-orbit-route="app-admin-events-route-state" data-error-code={routeState.errorCode}>
        <Card className={styles.section} title={adminRouteStateText(routeState.scenario, language).title}>
          <p className={styles.body}>{adminRouteStateText(routeState.scenario, language).description}</p>
          {routeState.recoveryActions.map((action) => <ListRow key={action.id} title={adminRecoveryText(action.id, language).label} subtitle={adminRecoveryText(action.id, language).description} href={action.href} />)}
        </Card>
      </main>
    </Orbit2026Scope>
  );
}

export default async function AdminEventsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fadmin%2Fevents");
  }

  const routeModel = await loadAppAdminPlatformRouteViewModel({
    actor: {
      displayName:
        session.user.name?.trim() ||
        session.user.email?.trim() ||
        "Orbit admin",
      email: session.user.email,
      id: session.user.id,
    },
    surface: "admin",
  });
  const language = await getAdminEventsPageLanguage();

  return (
    routeModel.state === "success" ? (
        <div data-orbit-route="app-admin-events-route">
          <OrbitRealAdminEvents
            language={language}
            viewModel={localizeOrbitTree(routeModel.admin, language)}
          />
        </div>
      ) : (
        <AdminEventsRouteStateBoundary language={language} routeState={routeModel.routeState} />
      )
  );
}
