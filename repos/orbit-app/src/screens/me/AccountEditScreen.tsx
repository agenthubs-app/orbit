import { useRouter, type Href } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, OfflineBar, Skeleton, UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountEditorContent } from "./AccountEditorContent";
import { accountDestination } from "./account-api";
import { useAccountEditor } from "./useAccountEditor";

export function AccountEditScreen() {
  const state = useAccountEditor(); const { t } = useOrbitLocale(); const router = useRouter();
  return <AppScreen inset="kit" title={t("profile.editPageTitle")} backIcon="x" headerActions={
      <Button size="sm" label={t("me.save")} disabled={!state.canSave} onPress={() => void state.save().then(saved => { if (saved) router.replace(accountDestination("/profile", state.path) as Href); })} />}>
    <OfflineBar offline={state.offline} pending={0} />
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : null}
    {state.feedback ? <Card><UiText accessibilityRole="alert">{state.feedback}</UiText>{state.session?.status === "conflict" ?
      <Button label={t("me.retry")} onPress={state.reload} /> : null}</Card> : null}
    {!state.session && state.resource.kind !== "loading" ? <Card><UiText>{t("me.loadError")}</UiText>
      <Button label={t("me.retry")} onPress={state.refresh} /></Card> : null}
    {state.session ? <AccountEditorContent draft={state.session.draft} t={t} patch={state.patch} onTags={field => router.push(accountDestination(`/profile/tags?kind=${field}`, state.path) as Href)} /> : null}
    {state.session ?
      <Button label={t("me.preview")} variant="secondary" onPress={() => router.push(accountDestination("/profile/preview", state.path) as Href)} /> : null}
  </AppScreen>;
}
