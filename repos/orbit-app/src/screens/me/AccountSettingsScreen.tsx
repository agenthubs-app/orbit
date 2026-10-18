import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { UiText } from "../../components/ui";
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
    // AuthSessionProvider owns the pending-write action sheet and encrypted keep/discard choices.
    const result = await auth.signOut();
    if (result.success) clearProfileEditSession({ actorId, apiOrigin: server.baseUrl });
    else setError(result.message ?? locale.t("account.signOutFailure"));
    setBusy(false);
  }
  return <AppScreen inset="kit" title={locale.t("me.settings")}>
    {error ? <UiText accessibilityRole="alert">{error}</UiText> : null}
    {permission.failed ? <UiText accessibilityRole="alert">{locale.t("me.permissionsError")}</UiText> : null}
    <AccountSettingsContent t={locale.t} name={profile.data?.profile?.displayName ?? locale.t("settings.account")} email={profile.data?.profile?.handles?.email ?? ""} language={locale.language} appearance={appearance} development={typeof __DEV__ !== "undefined" && __DEV__} permissions={permission.rows}
      onOpen={path => router.push(accountDestination(path, profile.path) as Href)} onLanguage={language => void locale.setLanguage(language)} onAppearance={choice => void setAppearanceChoice(choice)} onSignOut={() => void signOut()} />
  </AppScreen>;
}
