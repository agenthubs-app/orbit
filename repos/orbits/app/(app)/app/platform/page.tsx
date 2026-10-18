/**
 * 平台管理页 route adapter。
 *
 * 这里生成平台级 view model 并交给真实平台组件；route 本身不包含管理业务逻辑。
 */
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { getOrbitServerLanguage } from "../orbit-language-server";
import { adminText } from "../orbit-2026/copy/admin";
import { Card, ListRow, Orbit2026Scope } from "../orbit-2026/ui";
import {
  loadAppAdminPlatformRouteViewModel,
  type AppAdminPlatformRouteStateViewModel,
} from "../admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model";
import styles from "../admin/Admin.module.css";

function PlatformRouteStateBoundary({
  routeState,
  language,
}: {
  routeState: AppAdminPlatformRouteStateViewModel;
  language: "ja" | "zh" | "en";
}) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <main className={styles.errorPage} data-orbit-route="app-platform-route-state" data-error-code={routeState.errorCode}>
        <Card className={styles.section} title={adminText("platformTitle", language)}>
          <p className={styles.body}>{adminText("platformDescription", language)}</p>
          <ListRow title={adminText("backWorkspace", language)} href="/app" />
        </Card>
      </main>
    </Orbit2026Scope>
  );
}

export default async function PlatformPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fplatform");
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
    surface: "platform",
  });
  let language: "ja" | "zh" | "en" = "zh";
  try { language = await getOrbitServerLanguage(); } catch { /* requestless tests use zh */ }

  return <PlatformRouteStateBoundary language={language} routeState={routeModel.routeState} />;
}
