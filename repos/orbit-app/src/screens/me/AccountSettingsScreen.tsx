import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { presentConfirm, UiText } from "../../components/ui";
import { resetStackTo } from "../../components/shell-navigation";
import { clearProfileEditSession } from "../../data/profile-edit-session";
import { setAppearanceChoice, useAppearanceChoice } from "../../design/appearance";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { accountDestination } from "./account-api";
import { AccountSettingsContent } from "./AccountSettingsContent";
import { useAccountPermissions } from "./useAccountPermissions";
import { useAccountProfile } from "./useAccountProfile";

export function AccountSettingsScreen() {
  const router = useRouter(); const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl();
  const locale = useOrbitLocale(); const appearance = useAppearanceChoice(); const profile = useAccountProfile(); const permission = useAccountPermissions();
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy || !auth.actorId) return; setBusy(true); setError(null);
    const actorId = auth.actorId;
    const confirmed = await presentConfirm({ title: locale.t("me.logoutConfirm"), confirmLabel: locale.t("me.logout"), cancelLabel: locale.t("common.cancel"), destructive: true });
    if (!confirmed) { setBusy(false); return; }
    // AuthSessionProvider owns the pending-write action sheet and encrypted keep/discard choices.
    const result = await auth.signOut();
    if (result.success) {
      clearProfileEditSession({ actorId, apiOrigin: server.baseUrl });
      // Login becomes the only page: nothing of this account stays to go back to.
      resetStackTo(router, "/account/login");
    } else setError(result.message ?? locale.t("account.signOutFailure"));
    setBusy(false);
  }
  return <AppScreen inset="kit" title={locale.t("me.settings")}>
    {error ? <UiText accessibilityRole="alert">{error}</UiText> : null}
    {permission.failed ? <UiText accessibilityRole="alert">{locale.t("me.permissionsError")}</UiText> : null}
    <AccountSettingsContent t={locale.t} name={profile.data?.profile?.displayName ?? ""} email={profile.data?.profile?.handles?.email ?? ""} accountName={auth.user?.name ?? ""} accountEmail={auth.user?.email ?? ""} language={locale.language} appearance={appearance} development={typeof __DEV__ !== "undefined" && __DEV__} permissions={permission.rows}
      onOpen={path => router.push(accountDestination(path, profile.path) as Href)} onLanguage={language => void locale.setLanguage(language)} onAppearance={choice => void setAppearanceChoice(choice)} onSignOut={() => void signOut()} />
  </AppScreen>;
}
