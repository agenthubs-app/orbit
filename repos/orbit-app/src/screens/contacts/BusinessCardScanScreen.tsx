import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { prepareBatchImage, readPreparedBatchImage } from "../../api/batch-images";
import { layout, radius, rowRoleStyles, spacing } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import {
  acquisitionResultToSummary,
  buildBusinessCardContactWriteRequest,
  businessCardContactWriteToView,
  contactDraftReviewFormFromSummary,
  type ContactAcquisitionSummary,
  type ContactDraftReviewFieldName,
  type ContactDraftReviewFormState
} from "../../view-models/contact-acquisition";
import {
  DIRECT_SCAN_MAX_IMAGE_BYTES,
  buildDirectScanRequest,
  scanFailureMessageKey,
  scanImageFailure,
  scanIssueMessageKey,
  scanResultReviewable
} from "../../view-models/contact-add";
import { ContactPage } from "./ContactPage";

// Sprint 0140 (selected design C, monochrome): only 「拍一张名片」 and
// 「从相册选择」. The camera permission is asked for only after the user picks
// the camera row. A picked photo over the upload limit is compressed on the
// phone first; the scan creates a review draft, and a contact is created only
// by the explicit 「保存到人脉」 on 「核对名片信息」.
// Original bytes, like the batch picker: only the fixed policy in
// batch-images.ts re-encodes, and only when the photo is over the limit.
const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  base64: false,
  mediaTypes: ["images"],
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  quality: 1
};

const fieldLabelKeys: Record<ContactDraftReviewFieldName, MessageKey> = {
  displayName: "businessCard.fieldName",
  organization: "businessCard.fieldOrganization",
  role: "businessCard.fieldRole",
  email: "businessCard.fieldEmail",
  phone: "businessCard.fieldPhone"
};

type Stage =
  | { kind: "choose" }
  | { kind: "working"; labelKey: MessageKey }
  | { kind: "review"; summary: ContactAcquisitionSummary; imageUri: string }
  | { kind: "saved"; contactId: string | null };

export function BusinessCardScanScreen() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [fields, setFields] = useState<ContactDraftReviewFormState | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function start(source: "camera" | "library") {
    if (busy.current) return;
    busy.current = true;
    setErrorKey(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setErrorKey(scanFailureMessageKey.cameraDenied);
          return;
        }
      }
      const picked = source === "camera"
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync({ ...pickerOptions, allowsMultipleSelection: false, selectionLimit: 1 });
      const asset = picked.canceled ? undefined : picked.assets?.[0];
      if (!asset || !mounted.current) return;
      setStage({ kind: "working", labelKey: "contactAdd.processing" });
      let request: ReturnType<typeof buildDirectScanRequest>;
      let imageUri: string;
      try {
        const prepared = await prepareBatchImage(asset, { maxBytes: DIRECT_SCAN_MAX_IMAGE_BYTES });
        const bytes = await readPreparedBatchImage(prepared, { maxBytes: DIRECT_SCAN_MAX_IMAGE_BYTES });
        request = buildDirectScanRequest(prepared, bytes);
        imageUri = prepared.uri;
      } catch (error) {
        const failure = scanImageFailure(error);
        if (mounted.current) {
          setStage({ kind: "choose" });
          if (failure !== "cancelled") setErrorKey(scanFailureMessageKey[failure]);
        }
        return;
      }
      if (!request.success || !mounted.current) {
        setStage({ kind: "choose" });
        setErrorKey("contactAdd.imageUnreadable");
        return;
      }
      setStage({ kind: "working", labelKey: "contactAdd.recognizing" });
      const response = await client.post<unknown>(request.request.endpoint, { body: request.request.body });
      if (!mounted.current) return;
      const summary = response.success ? acquisitionResultToSummary(response.data) : null;
      if (!summary || !scanResultReviewable(summary)) {
        setStage({ kind: "choose" });
        setErrorKey("contactAdd.scanFailed");
        return;
      }
      setFields(contactDraftReviewFormFromSummary(summary));
      setAcknowledged([]);
      setStage({ kind: "review", summary, imageUri });
    } catch {
      if (mounted.current) {
        setStage({ kind: "choose" });
        setErrorKey("contactAdd.scanFailed");
      }
    } finally {
      busy.current = false;
    }
  }

  async function save() {
    if (stage.kind !== "review" || !fields || busy.current) return;
    const issues = stage.summary.reviewIssues ?? [];
    if (!issues.every(issue => acknowledged.includes(issue.code))) {
      setErrorKey("contactAdd.issuesPending");
      return;
    }
    const request = buildBusinessCardContactWriteRequest(stage.summary, fields);
    if (!request.success) {
      setErrorKey("contactAdd.nameRequired");
      return;
    }
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    try {
      const response = await client.post<unknown>(request.request.endpoint, { body: request.request.body });
      if (!mounted.current) return;
      if (!response.success) {
        setErrorKey("contactAdd.saveFailed");
        return;
      }
      const view = businessCardContactWriteToView(response.data);
      if (view.contactId) setStage({ kind: "saved", contactId: view.contactId });
      else setErrorKey((response.data as { state?: string } | null)?.state === "duplicate_review" ? "contactAdd.duplicateReview" : "contactAdd.saveFailed");
    } catch {
      if (mounted.current) setErrorKey("contactAdd.saveFailed");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function backToChoose() {
    if (busy.current) return;
    setStage({ kind: "choose" });
    setFields(null);
    setAcknowledged([]);
    setErrorKey(null);
  }

  const title = stage.kind === "review" ? locale.t("contactAdd.reviewCardTitle") : locale.t("contactAdd.scanTitle");
  const error = errorKey ? <Text accessibilityRole="alert" style={styles.error}>{locale.t(errorKey)}</Text> : null;

  if (stage.kind === "saved") {
    return <ContactPage detail backHref="/contacts" title={locale.t("contactAdd.scanTitle")}>
      <View style={styles.savedBlock}>
        <Ionicons color={colors.ink} name="checkmark-circle-outline" size={40} />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.savedTitle}>{locale.t("contactAdd.saved")}</Text>
      </View>
      {stage.contactId ? <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/contacts/[id]", params: { id: stage.contactId! } })} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{locale.t("contactAdd.openContact")}</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.replace("/contacts" as Href)} style={({ pressed }) => [styles.secondaryButton, styles.stackGap, pressed && styles.pressed]}>
        <Text style={styles.secondaryButtonText}>{locale.t("contactAdd.backToContacts")}</Text>
      </Pressable>
    </ContactPage>;
  }

  if (stage.kind === "review" && fields) {
    const issues = stage.summary.reviewIssues ?? [];
    return <ContactPage detail backHref="/contacts" title={title}>
      <View style={styles.imageFrame}>
        <Image accessibilityLabel={locale.t("contactAdd.cardImage")} accessibilityRole="image" resizeMode="contain" source={{ uri: stage.imageUri }} style={styles.image} />
      </View>
      <Text style={styles.hint}>{locale.t("contactAdd.reviewCardHint")}</Text>
      <View style={styles.fieldList}>
        {(stage.summary.reviewFields ?? []).map(field => {
          const label = locale.t(fieldLabelKeys[field.field]);
          return <View key={field.field} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              accessibilityLabel={label}
              editable={!saving}
              onChangeText={value => setFields(current => current ? { ...current, [field.field]: value } : current)}
              placeholder={label}
              placeholderTextColor={colors.text4}
              style={styles.fieldInput}
              value={fields[field.field]}
            />
          </View>;
        })}
      </View>
      {issues.length ? <View style={styles.issues}>
        <Text style={styles.groupHeading}>{locale.t("contactAdd.issuesTitle")}</Text>
        {issues.map((issue, index) => {
          const checked = acknowledged.includes(issue.code);
          const message = locale.t(scanIssueMessageKey(issue.code));
          return <Pressable
            accessibilityLabel={message}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            aria-checked={checked}
            key={`${issue.code}:${index}`}
            onPress={() => setAcknowledged(current => checked ? current.filter(code => code !== issue.code) : [...current, issue.code])}
            style={styles.issueRow}
          >
            <Ionicons color={colors.ink} name={checked ? "checkbox" : "square-outline"} size={20} />
            <Text style={styles.issueText}>{message}</Text>
          </Pressable>;
        })}
      </View> : null}
      {error}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={save} style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{saving ? locale.t("contactAdd.saving") : locale.t("contactAdd.saveToContacts")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={backToChoose} style={({ pressed }) => [styles.secondaryButton, styles.stackGap, saving && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.secondaryButtonText}>{locale.t("contactAdd.rescan")}</Text>
      </Pressable>
    </ContactPage>;
  }

  const working = stage.kind === "working";
  return <ContactPage detail backHref="/contacts" title={title}>
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("contactAdd.chooseMethod")}</Text>
    <CardIllustration />
    {working ? <View accessibilityLiveRegion="polite" style={styles.working}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.workingText}>{locale.t(stage.labelKey)}</Text>
    </View> : null}
    <View style={styles.methods}>
      <MethodRow
        detail={locale.t("contactAdd.takePhotoDetail")}
        disabled={working}
        icon="camera-outline"
        onPress={() => void start("camera")}
        title={locale.t("contactAdd.takePhoto")}
      />
      <MethodRow
        detail={locale.t("contactAdd.pickPhotoDetail")}
        disabled={working}
        icon="image-outline"
        onPress={() => void start("library")}
        title={locale.t("contactAdd.pickPhoto")}
      />
    </View>
    {error}
    <Text style={styles.footer}>{locale.t("contactAdd.scanFooter")}</Text>
  </ContactPage>;
}

function MethodRow({ detail, disabled, icon, onPress, title }: {
  detail: string;
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  title: string;
}) {
  const { colors, styles } = useStyles();
  return <Pressable
    accessibilityHint={detail}
    accessibilityLabel={title}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.methodRow, disabled && styles.disabled, pressed && styles.pressed]}
  >
    <Ionicons color={colors.ink} name={icon} size={30} />
    <View style={styles.methodText}>
      <Text style={styles.methodTitle}>{title}</Text>
      <Text style={styles.methodDetail}>{detail}</Text>
    </View>
    <Ionicons color={colors.text3} name="chevron-forward" size={20} />
  </Pressable>;
}

/** Monochrome card-on-desk sketch; decorative, so hidden from assistive tech. */
function CardIllustration() {
  const { styles } = useStyles();
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.illustration}>
    <View style={styles.illustrationCard}>
      <View style={[styles.illustrationLine, styles.illustrationName]} />
      <View style={[styles.illustrationLine, styles.illustrationShort]} />
      <View style={[styles.illustrationLine, styles.illustrationRule]} />
      <View style={[styles.illustrationLine, styles.illustrationMid]} />
      <View style={[styles.illustrationLine, styles.illustrationLong]} />
      <View style={[styles.illustrationLine, styles.illustrationMid]} />
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => {
  const controls = createControlStyles(colors);
  return StyleSheet.create({
    heading: { color: colors.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.4, marginTop: spacing.xl, textAlign: "center" },
    illustration: { alignSelf: "center", aspectRatio: 1.42, backgroundColor: colors.bgSunken, borderRadius: radius.card, justifyContent: "center", marginTop: spacing.xl, maxWidth: 300, padding: "9%", width: "72%" },
    illustrationCard: { aspectRatio: 1.75, backgroundColor: colors.surface, borderRadius: 3, gap: 7, justifyContent: "center", paddingHorizontal: "12%", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, width: "100%" },
    illustrationLine: { backgroundColor: colors.text3, borderRadius: 2, height: 4, opacity: 0.55 },
    illustrationName: { backgroundColor: colors.ink, height: 7, opacity: 0.8, width: "34%" },
    illustrationShort: { width: "44%" },
    illustrationRule: { height: 2, width: "8%" },
    illustrationMid: { width: "40%" },
    illustrationLong: { width: "62%" },
    methods: { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xxl },
    methodRow: { alignItems: "center", borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.lg, minHeight: 84, paddingHorizontal: spacing.sm, paddingVertical: spacing.lg },
    methodText: { flex: 1, gap: spacing.xs },
    methodTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
    methodDetail: { color: colors.text3, fontSize: 15 },
    footer: { color: colors.text3, fontSize: 14, marginTop: spacing.xl, textAlign: "center" },
    working: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.lg },
    workingText: { color: colors.text2, fontSize: 15 },
    error: { color: colors.rose, fontSize: 15, marginTop: spacing.lg },
    hint: { color: colors.text3, fontSize: 14, marginTop: spacing.md },
    imageFrame: { alignItems: "center", aspectRatio: 1.6, backgroundColor: colors.bgSunken, borderRadius: radius.card, justifyContent: "center", overflow: "hidden", width: "100%" },
    image: { height: "100%", width: "100%" },
    fieldList: { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md },
    fieldRow: { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xxs, paddingVertical: spacing.sm },
    fieldLabel: { ...rowRoleStyles.fieldLabel, color: colors.text3 },
    fieldInput: { ...rowRoleStyles.fieldValue, color: colors.ink, minHeight: layout.control, paddingVertical: spacing.xs },
    groupHeading: { ...rowRoleStyles.groupHeading, color: colors.text3, marginBottom: spacing.xs },
    issues: { marginTop: spacing.xl },
    issueRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, minHeight: layout.control, paddingVertical: spacing.sm },
    issueText: { color: colors.ink, flex: 1, fontSize: 15 },
    primaryButton: { ...controls.primaryButton, marginTop: spacing.xl },
    primaryButtonText: controls.primaryButtonText,
    secondaryButton: controls.secondaryButton,
    secondaryButtonText: controls.secondaryButtonText,
    stackGap: { marginTop: spacing.md },
    savedBlock: { alignItems: "center", gap: spacing.md, marginTop: spacing.xxl },
    savedTitle: { color: colors.ink, fontSize: 24, fontWeight: "900", textAlign: "center" },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.72 }
  });
});
