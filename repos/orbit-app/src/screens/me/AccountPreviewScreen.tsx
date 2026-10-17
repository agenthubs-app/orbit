import { useRouter, type Href } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { Button, OfflineBar, Skeleton, UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountPreviewContent } from "./AccountPreviewContent";
import { accountDestination } from "./account-api";
import { useAccountEditor } from "./useAccountEditor";

export function AccountPreviewScreen() {
  const state = useAccountEditor(true); const { t } = useOrbitLocale(); const router = useRouter();
  const profile = state.baseProfile && state.session ? { ...state.baseProfile, ...state.session.draft } : state.baseProfile;
  return <AppScreen title={t("me.preview")} headerActions={<Button label={t("me.edit")} size="sm" variant="ghost" onPress={() => router.push(accountDestination("/profile/edit", state.path) as Href)} />}>
    <OfflineBar offline={state.offline} pending={0} />
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : null}
    {profile ? <AccountPreviewContent profile={profile} t={t} /> : state.resource.kind !== "loading" ? <><UiText>{t("me.loadError")}</UiText><Button label={t("me.retry")} onPress={state.refresh} /></> : null}
  </AppScreen>;
}
