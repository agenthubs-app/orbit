import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { profileSaveReceiptSchema, type ProfileSaveRequest } from "../../api/profile-detail-contract";
import {
  completeProfileEditSave,
  clearProfileEditSession,
  prepareProfileEditSave,
  profileVisibleCharacterCount,
  recordProfileEditSaveFailure,
  updateProfileEditDraft,
  validateProfileEditDraft,
} from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import {
  ProfileNavRow,
  ProfileNotice,
  ProfilePageFrame,
  ProfilePrimaryButton,
  ProfileSection,
  ProfileTags,
  ProfileTextField,
} from "./ProfilePagePrimitives";
import { useProfileEditSessionScreen } from "./useProfileEditSessionScreen";

export function EditProfileScreen() {
  const { colors, styles } = useStyles();
  const { fontScale, width } = useWindowDimensions();
  const locale = useOrbitLocale();
  const router = useRouter();
  const client = useOrbitApiClient();
  const state = useProfileEditSessionScreen();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const session = state.session;
  const completeness = state.resource.kind === "success" || state.resource.kind === "empty"
    ? state.resource.data.completeness.score
    : 0;

  function patch(fields: Parameters<typeof updateProfileEditDraft>[1]) {
    if (!state.scope) return;
    updateProfileEditDraft(state.scope, fields);
    state.syncSession();
    setFeedback(null);
  }

  async function save() {
    if (!state.scope || !session || !state.baseProfile || saving) return;
    const invalid = validateProfileEditDraft(session.draft);
    if (invalid.length > 0) {
      setFeedback(invalid.includes("displayName") ? locale.t("profile.nameRequired") : invalid.includes("bio") ? locale.t("profile.bioCount", { count: profileVisibleCharacterCount(session.draft.bio) }) : locale.t("profile.tagLimit"));
      return;
    }
    let attempt;
    try {
      attempt = prepareProfileEditSave(state.scope, () => Crypto.randomUUID());
    } catch {
      setFeedback(locale.t("profile.savePrepareFailed"));
      return;
    }
    if (!attempt) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, { body: attempt.body });
      if (result.status === 409) {
        recordProfileEditSaveFailure(state.scope, attempt.body.mutationId, 409, locale.t("profile.saveConflict"));
        setFeedback(locale.t("profile.saveConflict"));
        state.syncSession();
        return;
      }
      const receipt = result.success && result.status >= 200 && result.status < 300
        ? profileSaveReceiptSchema(state.baseProfile.id, attempt.body as ProfileSaveRequest).safeParse(result.data)
        : null;
      if (!receipt?.success) {
        recordProfileEditSaveFailure(state.scope, attempt.body.mutationId, result.status, locale.t("profile.saveUnconfirmed"));
        setFeedback(locale.t("profile.saveUnconfirmed"));
        state.syncSession();
        return;
      }
      completeProfileEditSave(state.scope, attempt.body.mutationId);
      router.replace("/profile" as Href);
    } catch {
      recordProfileEditSaveFailure(state.scope, attempt.body.mutationId, 503, locale.t("profile.saveUnconfirmed"));
      setFeedback(locale.t("profile.saveUnconfirmed"));
      state.syncSession();
    } finally {
      setSaving(false);
    }
  }

  function discardConflictAndReload() {
    if (!state.scope) return;
    clearProfileEditSession(state.scope);
    state.syncSession();
    state.refresh();
    setFeedback(null);
  }

  const saveAction = <Pressable accessibilityLabel={locale.t("profile.save")} accessibilityRole="button" disabled={!session || saving} onPress={() => void save()} style={({ pressed }) => [styles.saveAction, (!session || saving) && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.saveActionText}>{saving ? locale.t("profile.saving") : locale.t("common.save")}</Text>
  </Pressable>;

  return <ProfilePageFrame backLabel={locale.t("common.cancel")} onBack={() => router.back()} rightAction={saveAction} title={locale.t("profile.editPageTitle")}
    footer={session ? <ProfilePrimaryButton label={locale.t("profile.openPreview")} onPress={() => router.push("/profile/preview" as Href)} secondary /> : undefined}>
    {state.resource.kind === "loading" || !state.scope ? <ProfileNotice>{locale.t("profile.loading")}</ProfileNotice> : null}
    {(state.resource.kind === "failure" || state.resource.kind === "offline") ? <><ProfileNotice error>{locale.t("profile.readError")}</ProfileNotice><ProfilePrimaryButton label={locale.t("common.retry")} onPress={state.refresh} secondary /></> : null}
    {state.resource.kind !== "loading" && !session && state.resource.kind !== "failure" && state.resource.kind !== "offline" ? <ProfileNotice error>{locale.t("profile.noEditSession")}</ProfileNotice> : null}
    {session ? <>
      <View style={styles.avatarBlock}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{Array.from(session.draft.displayName.trim())[0] ?? "O"}</Text></View>
        <View style={styles.camera}><Ionicons color={colors.onAccent} name="camera-outline" size={16} /></View>
      </View>
      <ProfileSection title={locale.t("profile.basic")}>
        <ProfileTextField label={locale.t("profile.name")} onChangeText={value => patch({ displayName: value })} value={session.draft.displayName} />
        <View style={width >= 360 && fontScale <= 1.3 ? styles.basicPair : undefined}>
          <ProfileTextField containerStyle={width >= 360 && fontScale <= 1.3 ? styles.basicHalf : undefined} label={locale.t("profile.role")} onChangeText={value => patch({ role: value })} value={session.draft.role} />
          <ProfileTextField containerStyle={width >= 360 && fontScale <= 1.3 ? styles.basicHalf : undefined} label={locale.t("profile.organization")} onChangeText={value => patch({ organization: value })} value={session.draft.organization} />
        </View>
      </ProfileSection>
      <ProfileSection {...(state.baseProfile ? { detail: `${completeness}%` } : {})} title={locale.t("profile.completeness")}>
        <View accessibilityLabel={`${locale.t("profile.completeness")} ${completeness}%`} accessibilityRole="progressbar" style={styles.progressTrack}>
          <View style={[styles.progressValue, { width: `${completeness}%` }]} />
        </View>
        <ProfileTextField helper={locale.t("profile.bioCount", { count: profileVisibleCharacterCount(session.draft.bio) })} label={locale.t("profile.currentWork")} multiline maxLength={320} onChangeText={value => patch({ bio: value })} value={session.draft.bio} />
      </ProfileSection>
      <ProfileSection detail={locale.t("profile.selectedCount", { count: session.draft.offering.length })} title={locale.t("profile.offering")}>
        <ProfileTags values={session.draft.offering} />
        <ProfileNavRow label={locale.t("profile.tagsTitle")} onPress={() => router.push("/profile/tags?field=offering" as Href)} />
      </ProfileSection>
      <ProfileSection detail={locale.t("profile.selectedCount", { count: session.draft.seeking.length })} title={locale.t("profile.seeking")}>
        <ProfileTags values={session.draft.seeking} />
        <ProfileNavRow label={locale.t("profile.tagsTitle")} onPress={() => router.push("/profile/tags?field=seeking" as Href)} />
      </ProfileSection>
      <ProfileSection title={locale.t("profile.contactInformation")}>
        <ProfileNavRow label={locale.t("profile.openMore")} onPress={() => router.push("/profile/more" as Href)} value={session.draft.preferredIntroChannels.join("、")} />
        <ProfileNavRow label={locale.t("profile.openSuggestions")} onPress={() => router.push("/profile/suggestions" as Href)} />
      </ProfileSection>
      {feedback ? <ProfileNotice error>{feedback}</ProfileNotice> : null}
      {session.status === "conflict" ? <ProfilePrimaryButton label={locale.t("profile.discardDraft")} onPress={discardConflictAndReload} secondary /> : null}
    </> : null}
  </ProfilePageFrame>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  avatarBlock: { alignItems: "center", alignSelf: "center", height: 92, justifyContent: "center", width: 92 },
  avatar: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
  avatarText: { color: colors.onAccent, fontSize: 28, fontWeight: "800" },
  basicPair: { flexDirection: "row", gap: 14 },
  basicHalf: { flex: 1, minWidth: 0 },
  camera: { alignItems: "center", backgroundColor: colors.accent, borderColor: colors.surface, borderRadius: 16, borderWidth: 3, bottom: 0, height: 32, justifyContent: "center", position: "absolute", right: 0, width: 32 },
  progressTrack: { backgroundColor: colors.border, borderRadius: 3, height: 6, marginVertical: 12, overflow: "hidden" },
  progressValue: { backgroundColor: colors.ink, borderRadius: 3, height: 6 },
  saveAction: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 60 },
  saveActionText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.68 },
}));
