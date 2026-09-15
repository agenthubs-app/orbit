import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { normalizeProfileTagValues, updateProfileEditDraft } from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { ProfileNotice, ProfilePageFrame, ProfilePrimaryButton, ProfileSection, ProfileTextField } from "./ProfilePagePrimitives";
import { profileSeekingCandidates } from "./profile-page-model";
import { useProfileEditSessionScreen } from "./useProfileEditSessionScreen";

export function ProfileTagPickerScreen() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ field?: string | string[] }>();
  const field = (Array.isArray(params.field) ? params.field[0] : params.field) === "seeking" ? "seeking" : "offering";
  const state = useProfileEditSessionScreen();
  const session = state.session;
  const selected = session?.draft[field] ?? [];
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => {
    if (!state.baseProfile) return selected;
    return field === "seeking"
      ? profileSeekingCandidates(state.baseProfile)
      : normalizeProfileTagValues([...(state.baseProfile.offering ?? []), ...selected]);
  }, [field, selected.join("\u0000"), state.baseProfile]);
  const visible = candidates.filter(value => value.toLocaleLowerCase().includes(query.trim().normalize("NFKC").toLocaleLowerCase()));

  function setSelected(values: string[]) {
    if (!state.scope) return;
    updateProfileEditDraft(state.scope, { [field]: normalizeProfileTagValues(values).slice(0, 5) });
    state.syncSession();
  }
  function toggle(value: string) {
    const exists = selected.some(item => item.normalize("NFKC").toLocaleLowerCase() === value.normalize("NFKC").toLocaleLowerCase());
    if (exists) setSelected(selected.filter(item => item !== value));
    else if (selected.length < 5) setSelected([...selected, value]);
  }
  function addCustom() {
    const custom = normalizeProfileTagValues([query])[0];
    if (!custom || selected.length >= 5) return;
    setSelected([...selected, custom]);
    setQuery("");
  }

  return <ProfilePageFrame backLabel={locale.t("profile.editPageTitle")} onBack={() => router.back()} title={locale.t("profile.tagsTitle")} footer={<ProfilePrimaryButton label={locale.t("profile.done")} onPress={() => router.back()} />}>
    {!session ? <ProfileNotice error>{locale.t("profile.noEditSession")}</ProfileNotice> : <>
      <ProfileSection detail={locale.t("profile.selectedCount", { count: selected.length })} title={locale.t(field === "offering" ? "profile.offering" : "profile.seeking")}>
        <View accessibilityRole="list" style={styles.tags}>
          {selected.map(value => <Pressable accessibilityLabel={`${locale.t("common.close")} ${value}`} accessibilityRole="button" key={value} onPress={() => toggle(value)} style={({ pressed }) => [styles.tag, styles.selectedTag, pressed && styles.pressed]}>
            <Text style={styles.selectedTagText}>{value}</Text><Text style={styles.selectedTagText}>×</Text>
          </Pressable>)}
        </View>
      </ProfileSection>
      <ProfileSection title={locale.t("profile.addCustomTag")}>
        <ProfileTextField label={locale.t("profile.tagsTitle")} onChangeText={setQuery} onSubmitEditing={addCustom} returnKeyType="done" value={query} />
        <ProfilePrimaryButton disabled={!query.trim() || selected.length >= 5} label={locale.t("profile.addCustomTag")} onPress={addCustom} secondary />
      </ProfileSection>
      <ProfileSection title={locale.t("profile.suggestionsTitle")}>
        <View style={styles.tags}>
          {visible.map(value => {
            const active = selected.includes(value);
            return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled: !active && selected.length >= 5 }} disabled={!active && selected.length >= 5} key={value} onPress={() => toggle(value)} style={({ pressed }) => [styles.tag, active && styles.selectedTag, pressed && styles.pressed]}>
              <Text style={active ? styles.selectedTagText : styles.tagText}>{value}</Text>
            </Pressable>;
          })}
        </View>
      </ProfileSection>
      {selected.length >= 5 ? <ProfileNotice>{locale.t("profile.tagLimit")}</ProfileNotice> : null}
    </>}
  </ProfilePageFrame>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 12 },
  tag: { alignItems: "center", borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  selectedTag: { backgroundColor: colors.accent, borderColor: colors.accent },
  tagText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  selectedTagText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.68 },
}));
