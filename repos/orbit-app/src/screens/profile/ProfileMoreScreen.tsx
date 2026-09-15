import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { profileExtractionReceiptSchema, type ProfileExtraction } from "../../api/profile-detail-contract";
import { normalizeProfileTagValues, updateProfileEditDraft } from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { buildProfileDocumentExtractionRequest, type ProfileDocumentExtractionKind } from "../../view-models/profile";
import { ProfileNotice, ProfilePageFrame, ProfilePrimaryButton, ProfileSection, ProfileTextField } from "./ProfilePagePrimitives";
import { useProfileEditSessionScreen } from "./useProfileEditSessionScreen";

function splitValues(value: string): string[] {
  return normalizeProfileTagValues(value.split(/\n|,|，|、/u));
}

export function ProfileMoreScreen() {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const client = useOrbitApiClient();
  const state = useProfileEditSessionScreen();
  const session = state.session;
  const [sourceText, setSourceText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ fileName: string; kind: ProfileDocumentExtractionKind; mimeType: string } | null>(null);
  const [extraction, setExtraction] = useState<ProfileExtraction | null>(null);
  const [extractionError, setExtractionError] = useState("");
  const [busy, setBusy] = useState(false);
  function patch(fields: Parameters<typeof updateProfileEditDraft>[1]) {
    if (!state.scope) return;
    updateProfileEditDraft(state.scope, fields);
    state.syncSession();
  }
  async function pickImage(kind: ProfileDocumentExtractionKind) {
    if (busy) return;
    setExtractionError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, mediaTypes: ["images"], quality: 0.86 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) { setExtractionError(locale.t("profile.imageMissing")); return; }
      setSelectedFile({ fileName: asset.fileName || (kind === "business-card" ? "business-card.jpg" : "resume.jpg"), kind, mimeType: asset.mimeType || "image/jpeg" });
    } catch { setExtractionError(locale.t("profile.imageReadFailure")); }
  }
  async function pickResumeFile() {
    if (busy) return;
    setExtractionError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false, multiple: false, type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"] });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) { setExtractionError(locale.t("profile.fileMissing")); return; }
      setSelectedFile({ fileName: asset.name || "resume.pdf", kind: "resume", mimeType: asset.mimeType || "application/pdf" });
    } catch { setExtractionError(locale.t("profile.fileReadFailure")); }
  }
  async function extract(kind: ProfileDocumentExtractionKind) {
    if (busy) return;
    const request = buildProfileDocumentExtractionRequest(kind, { text: sourceText, ...(selectedFile?.kind === kind ? selectedFile : {}) });
    if (!request) { setExtractionError(locale.t("profile.extractionPasteFirst")); return; }
    setBusy(true); setExtractionError(""); setExtraction(null);
    try {
      const result = await client.post<unknown>(request.endpoint, { body: request.body });
      const receipt = result.success && result.status >= 200 && result.status < 300 ? profileExtractionReceiptSchema(kind).safeParse(result.data) : null;
      if (!receipt?.success) { setExtractionError(locale.t("profile.extractionUnconfirmed")); return; }
      setExtraction(receipt.data);
    } catch { setExtractionError(locale.t("profile.extractionUnconfirmed")); }
    finally { setBusy(false); }
  }
  function applyExtraction() {
    const draft = extraction?.state === "success" ? extraction.draft : null;
    if (!draft || !state.scope) return;
    const suggested = draft.suggestedProfileFields;
    updateProfileEditDraft(state.scope, {
      ...(draft.displayName ? { displayName: draft.displayName } : {}),
      ...(draft.organization ? { organization: draft.organization } : {}),
      ...(draft.role ? { role: draft.role } : {}),
      ...((suggested.headline || draft.headline) ? { headline: suggested.headline || draft.headline } : {}),
      ...((suggested.homeMarket || draft.homeMarket) ? { homeMarket: suggested.homeMarket || draft.homeMarket } : {}),
      ...((suggested.relationshipGoal || draft.relationshipGoal) ? { relationshipGoal: suggested.relationshipGoal || draft.relationshipGoal } : {}),
      ...(suggested.targetRelationshipTypes?.length ? { targetRelationshipTypes: [...suggested.targetRelationshipTypes] } : {}),
      ...(suggested.preferredFollowUpWindow ? { preferredFollowUpWindow: suggested.preferredFollowUpWindow } : {}),
      ...(suggested.preferredIntroChannels?.length ? { preferredIntroChannels: [...suggested.preferredIntroChannels] } : {}),
      ...(suggested.bio !== undefined ? { bio: suggested.bio } : {}),
      ...(suggested.offering !== undefined ? { offering: [...suggested.offering] } : {}),
      ...(suggested.seeking !== undefined ? { seeking: [...suggested.seeking] } : {}),
    });
    state.syncSession();
  }
  const done = <Pressable accessibilityLabel={locale.t("profile.done")} accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.done, pressed && styles.pressed]}><Text style={styles.doneText}>{locale.t("profile.done")}</Text></Pressable>;
  return <ProfilePageFrame backLabel={locale.t("profile.editPageTitle")} onBack={() => router.back()} rightAction={done} title={locale.t("profile.moreTitle")}>
    {!session ? <ProfileNotice error>{locale.t("profile.noEditSession")}</ProfileNotice> : <>
      <ProfileSection title={locale.t("profile.publicInformation")}>
        <ProfileTextField label={locale.t("profile.location")} onChangeText={value => patch({ homeMarket: value })} value={session.draft.homeMarket} />
        <ProfileTextField label={locale.t("profile.industry")} onChangeText={value => patch({ industry: value })} value={session.draft.industry ?? ""} />
        <ProfileTextField label={locale.t("profile.spokenLanguages")} onChangeText={value => patch({ spokenLanguages: splitValues(value) })} placeholder="中文、日本語、English" value={session.draft.spokenLanguages.join("、")} />
      </ProfileSection>
      <ProfileSection title={locale.t("profile.contactInformation")}>
        <ProfileTextField label={locale.t("profile.introChannels")} onChangeText={value => patch({ preferredIntroChannels: splitValues(value) })} value={session.draft.preferredIntroChannels.join("、")} />
        <ProfileTextField keyboardType="email-address" label={locale.t("profile.email")} onChangeText={value => patch({ handles: { ...session.draft.handles, email: value } })} value={session.draft.handles.email ?? ""} />
        <ProfileTextField keyboardType="phone-pad" label={locale.t("profile.phone")} onChangeText={value => patch({ handles: { ...session.draft.handles, phone: value } })} value={session.draft.handles.phone ?? ""} />
      </ProfileSection>
      <ProfileSection title={locale.t("profile.links")}>
        <ProfileTextField autoCapitalize="none" keyboardType="url" label={locale.t("profile.website")} onChangeText={value => patch({ handles: { ...session.draft.handles, website: value } })} value={session.draft.handles.website ?? ""} />
        <ProfileTextField autoCapitalize="none" keyboardType="url" label={locale.t("profile.linkedin")} onChangeText={value => patch({ handles: { ...session.draft.handles, linkedinUrl: value } })} value={session.draft.handles.linkedinUrl ?? ""} />
        <ProfileTextField autoCapitalize="none" label={locale.t("profile.xHandle")} onChangeText={value => patch({ handles: { ...session.draft.handles, xHandle: value } })} value={session.draft.handles.xHandle ?? ""} />
      </ProfileSection>
      <ProfileSection title={locale.t("profile.privateInformation")}>
        <ProfileTextField label={locale.t("profile.birthDatePrivate")} onChangeText={value => patch({ birthDate: value || null })} placeholder={locale.t("profile.birthDatePlaceholder")} value={session.draft.birthDate ?? ""} />
        <ProfileTextField label={locale.t("profile.followUpWindow")} onChangeText={value => patch({ preferredFollowUpWindow: value })} value={session.draft.preferredFollowUpWindow} />
      </ProfileSection>
      <ProfileSection detail={locale.t("profile.extractionDetail")} title={locale.t("profile.extractionTitle")}>
        <ProfileNotice>{locale.t("profile.extractionGuidance")}</ProfileNotice>
        <ProfileTextField label={locale.t("profile.extractionInput")} multiline onChangeText={setSourceText} placeholder={locale.t("profile.extractionPlaceholder")} value={sourceText} />
        {selectedFile ? <ProfileNotice>{locale.t(sourceText.trim() ? "profile.selectedWithText" : "profile.selectedNeedsText", { name: selectedFile.fileName })}</ProfileNotice> : null}
        <View style={styles.extractionActions}>
          <ProfilePrimaryButton disabled={busy} label={locale.t("profile.chooseCardImage")} onPress={() => void pickImage("business-card")} secondary />
          <ProfilePrimaryButton disabled={busy} label={locale.t("profile.chooseResumeImage")} onPress={() => void pickImage("resume")} secondary />
          <ProfilePrimaryButton disabled={busy} label={locale.t("profile.chooseResumeFile")} onPress={() => void pickResumeFile()} secondary />
          <ProfilePrimaryButton disabled={busy} label={busy ? locale.t("profile.extracting") : locale.t("profile.extractCard")} onPress={() => void extract("business-card")} />
          <ProfilePrimaryButton disabled={busy} label={busy ? locale.t("profile.extracting") : locale.t("profile.extractResume")} onPress={() => void extract("resume")} />
        </View>
        {extractionError ? <ProfileNotice error>{extractionError}</ProfileNotice> : null}
        {extraction?.draft ? <View style={styles.extractionResult}>
          <Text style={styles.extractionName}>{extraction.draft.displayName || locale.t("profile.unrecognizedName")}</Text>
          <Text style={styles.extractionDetail}>{[extraction.draft.role, extraction.draft.organization].filter(Boolean).join(" · ")}</Text>
          <ProfileNotice>{extraction.confidenceSummary}</ProfileNotice>
          <ProfilePrimaryButton label={locale.t("profile.applyExtraction")} onPress={applyExtraction} secondary />
        </View> : null}
      </ProfileSection>
      <ProfileNotice>{locale.t("profile.editDetail")}</ProfileNotice>
    </>}
  </ProfilePageFrame>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  done: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 60 },
  doneText: { color: colors.accent, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  pressed: { opacity: 0.68 },
  extractionActions: { gap: 8, paddingVertical: 12 },
  extractionResult: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 6, marginVertical: 12, padding: 12 },
  extractionName: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 23 },
  extractionDetail: { color: colors.text3, fontSize: 13, lineHeight: 20 },
}));
