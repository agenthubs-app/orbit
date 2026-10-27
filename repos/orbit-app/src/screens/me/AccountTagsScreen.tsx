import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, IconButton, Skeleton, TextField, UiPressable, UiText } from "../../components/ui";
import { normalizeProfileTagValues } from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { OFFER_OPTIONS, optionMatches, SEEK_OPTIONS } from "../../view-models/profile-onboarding";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { accountDestination } from "./account-api";
import { useAccountEditor } from "./useAccountEditor";
import { AccountCopyNotice } from "./AccountCopyNotice";

export function AccountTagsScreen() {
  const params = useLocalSearchParams<{ kind?: string; field?: string }>();
  const field = (params.kind ?? params.field) === "seeking" ? "seeking" : "offering";
  const { styles } = useStyles();
  const state = useAccountEditor(true); const { t, language } = useOrbitLocale(); const router = useRouter(); const [query, setQuery] = useState("");
  const selected = state.session?.draft[field] ?? [];
  function patch(values: string[]) { state.patch({ [field]: normalizeProfileTagValues(values) }); }
  // QA-D: the same choices onboarding offers, so editing later is not a blank text box.
  const suggestions = (field === "offering" ? OFFER_OPTIONS : SEEK_OPTIONS).filter(option => !selected.some(value => optionMatches(option, value))).map(option => option[language]);
  function add() { if (selected.length < 5 && query.trim()) { patch([...selected, query]); setQuery(""); } }
  if (!state.session) return <AppScreen inset="kit" title={t(field === "offering" ? "me.offering" : "me.seeking")}>
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : <Card><UiText style={styles.body}>{t(state.resource.kind === "offline" ? "sync.notOnDevice" : "me.loadError")}</UiText>
      <Button label={t("me.retry")} onPress={state.refresh} /></Card>}
  </AppScreen>;
  return <AppScreen inset="kit" title={t(field === "offering" ? "me.offering" : "me.seeking")} headerActions={
      <Button label={t("me.save")} size="sm" disabled={!state.canSave} onPress={() => void state.save().then(saved => { if (saved) router.replace(accountDestination("/profile", state.path) as Href); })} />}>
    <AccountCopyNotice copy={state.copy} language={language} t={t} />
    {state.feedback ? <UiText accessibilityRole="alert" style={styles.body}>{state.feedback}</UiText> : null}
    <Card><UiText style={styles.label}>{t("profile.selectedCount", { count: selected.length })}</UiText><View style={styles.tags}>{selected.map(value => <View key={value} style={styles.row}><Chip label={value} tone={field === "offering" ? "lav" : "pink"} />
      <IconButton icon="x" accessibilityLabel={t("onboarding.removeNamed", { name: value })} onPress={() => patch(selected.filter(item => item !== value))} /></View>)}</View></Card>
    <Card>
      <TextField label={t("profile.addCustomTag")} value={query} onChangeText={setQuery} onSubmitEditing={add} />
      <Button label={t("me.add")} variant="secondary" disabled={!state.session || !query.trim() || selected.length >= 5} onPress={add} />{selected.length >= 5 ? <UiText style={styles.label}>{t("profile.tagLimit")}</UiText> : null}</Card>
    {suggestions.length && selected.length < 5 ? <Card><UiText style={styles.label}>{t("profile.tagSuggestions")}</UiText><View style={styles.tags}>
      {suggestions.map(label => <UiPressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => patch([...selected, label])} style={styles.suggestion}><UiText style={styles.suggestionText}>{`＋ ${label}`}</UiText></UiPressable>)}</View></Card> : null}
  </AppScreen>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }, row: { flexDirection: "row", alignItems: "center" },
  body: { color: colors.ink, fontSize: typography.body }, label: { color: colors.ink2, fontSize: typography.label },
  suggestion: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4 },
  suggestionText: { color: colors.ink, fontSize: 15 } }));
