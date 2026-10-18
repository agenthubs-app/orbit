import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, IconButton, Skeleton, TextField, UiText } from "../../components/ui";
import { normalizeProfileTagValues } from "../../data/profile-edit-session";
import { spacing } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { accountDestination } from "./account-api";
import { useAccountEditor } from "./useAccountEditor";
import { AccountCopyNotice } from "./AccountCopyNotice";

export function AccountTagsScreen() {
  const params = useLocalSearchParams<{ kind?: string; field?: string }>();
  const field = (params.kind ?? params.field) === "seeking" ? "seeking" : "offering";
  const state = useAccountEditor(true); const { t, language } = useOrbitLocale(); const router = useRouter(); const [query, setQuery] = useState("");
  const selected = state.session?.draft[field] ?? [];
  function patch(values: string[]) { state.patch({ [field]: normalizeProfileTagValues(values) }); }
  function add() { if (selected.length < 5 && query.trim()) { patch([...selected, query]); setQuery(""); } }
  if (!state.session) return <AppScreen inset="kit" title={t(field === "offering" ? "me.offering" : "me.seeking")}>
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : <Card><UiText>{t(state.resource.kind === "offline" ? "sync.notOnDevice" : "me.loadError")}</UiText>
      <Button label={t("me.retry")} onPress={state.refresh} /></Card>}
  </AppScreen>;
  return <AppScreen inset="kit" title={t(field === "offering" ? "me.offering" : "me.seeking")} headerActions={
      <Button label={t("me.save")} size="sm" disabled={!state.canSave} onPress={() => void state.save().then(saved => { if (saved) router.replace(accountDestination("/profile", state.path) as Href); })} />}>
    <AccountCopyNotice copy={state.copy} language={language} t={t} />
    {state.feedback ? <UiText accessibilityRole="alert">{state.feedback}</UiText> : null}
    <Card><UiText>{t("profile.selectedCount", { count: selected.length })}</UiText><View style={styles.tags}>{selected.map(value => <View key={value} style={styles.row}><Chip label={value} tone={field === "offering" ? "lav" : "pink"} />
      <IconButton icon="x" accessibilityLabel={t("me.dismissCandidate", { label: value })} onPress={() => patch(selected.filter(item => item !== value))} /></View>)}</View></Card>
    <Card>
      <TextField label={t("profile.addCustomTag")} value={query} onChangeText={setQuery} onSubmitEditing={add} />
      <Button label={t("me.add")} variant="secondary" disabled={!state.session || !query.trim() || selected.length >= 5} onPress={add} />{selected.length >= 5 ? <UiText>{t("profile.tagLimit")}</UiText> : null}</Card>
  </AppScreen>;
}
const styles = StyleSheet.create({ tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, row: { flexDirection: "row", alignItems: "center" } });
