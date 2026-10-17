import { useRouter, type Href } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { Button, Skeleton, UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountPreviewContent } from "./AccountPreviewContent";
import { accountDestination } from "./account-api";
import { useAccountEditor } from "./useAccountEditor";
import { profilePreviewFromSession } from "../profile/profile-page-model";
import { AccountCopyNotice } from "./AccountCopyNotice";

export function AccountPreviewScreen() {
  const state = useAccountEditor(true); const { t, language } = useOrbitLocale(); const router = useRouter();
  const profile = state.baseProfile;
  return <AppScreen title={t("me.preview")} headerActions={
      <Button label={t("me.edit")} size="sm" variant="ghost" onPress={() => router.push(accountDestination("/profile/edit", state.path) as Href)} />}>
    <AccountCopyNotice copy={state.copy} language={language} t={t} />
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : null}
    {profile ? <AccountPreviewContent profile={profile} {...(state.session ? { preview: profilePreviewFromSession(state.session, profile) } : {})} t={t} /> : state.resource.kind !== "loading" ? <><UiText>{t(state.resource.kind === "offline" ? "sync.notOnDevice" : "me.loadError")}</UiText>
      <Button label={t("me.retry")} onPress={state.refresh} /></> : null}
  </AppScreen>;
}
