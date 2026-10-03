import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { contactDraftConfirmPath } from "../../api/endpoints";
import { layout, rowRoleStyles, spacing } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { acquisitionResultToSummary, type ContactAcquisitionFormState } from "../../view-models/contact-acquisition";
import {
  buildManualAddRequest,
  canReviewManual,
  emptyManualForm,
  manualRelationshipFilled,
  manualReviewRows,
  type ManualField
} from "../../view-models/contact-add";
import { ContactPage } from "./ContactPage";

// Sprint 0140 (selected design 2, name first): name, company and title are
// shown first; note, next step and tags sit under 「补充关系信息」 and keep
// their values while collapsed. 「下一步：核对信息」 only moves to a review of
// the exact values; the contact is created by the explicit 「保存到人脉」 there.
type Stage = "edit" | "review" | "saved";

export function ManualContactAddScreen() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [form, setForm] = useState<ContactAcquisitionFormState>(emptyManualForm);
  const [stage, setStage] = useState<Stage>("edit");
  const [expanded, setExpanded] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  // A draft created for the reviewed values is confirmed again on retry instead
  // of creating a second draft, so a failed save never yields two contacts.
  const pendingDraft = useRef<{ key: string; draftId: string } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function update(field: ManualField, value: string) {
    setForm(current => ({ ...current, [field]: value }));
    if (field === "displayName" && errorKey === "contactAdd.nameRequired") setErrorKey(null);
    if (field === "note" && errorKey === "contactAdd.noteRequired" && value.trim()) setErrorKey(null);
  }

  function next() {
    if (!canReviewManual(form)) {
      setErrorKey("contactAdd.nameRequired");
      return;
    }
    setErrorKey(null);
    setStage("review");
  }

  async function save() {
    if (busy.current) return;
    const request = buildManualAddRequest(form);
    if (!request.success) {
      setStage("edit");
      setErrorKey("contactAdd.nameRequired");
      return;
    }
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    try {
      const key = JSON.stringify(request.request.body);
      let draftId = pendingDraft.current?.key === key ? pendingDraft.current.draftId : "";
      if (!draftId) {
        const created = await client.post<unknown>(request.request.endpoint, { body: request.request.body });
        draftId = created.success ? acquisitionResultToSummary(created.data).draftId : "";
        if (!created.success && created.error.context?.manualContactCreationErrorCode === "MANUAL_CONTACT_NOTE_REQUIRED") {
          // The live service still requires a relationship note as the manual
          // source evidence; send the user back to add one instead of failing silently.
          if (mounted.current) {
            setExpanded(true);
            setStage("edit");
            setErrorKey("contactAdd.noteRequired");
          }
          return;
        }
        if (!draftId) {
          if (mounted.current) setErrorKey("contactAdd.saveFailed");
          return;
        }
        pendingDraft.current = { key, draftId };
      }
      const confirmed = await client.post<unknown>(contactDraftConfirmPath(draftId));
      if (!mounted.current) return;
      const summary = confirmed.success ? acquisitionResultToSummary(confirmed.data) : null;
      if (!summary?.contactId) {
        setErrorKey("contactAdd.saveFailed");
        return;
      }
      pendingDraft.current = null;
      setContactId(summary.contactId);
      setStage("saved");
    } catch {
      if (mounted.current) setErrorKey("contactAdd.saveFailed");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const error = errorKey ? <Text accessibilityRole="alert" style={styles.error}>{locale.t(errorKey)}</Text> : null;

  if (stage === "saved") {
    return <ContactPage detail backHref="/contacts" title={locale.t("contactAdd.manualTitle")}>
      <View style={styles.savedBlock}>
        <Ionicons color={colors.ink} name="checkmark-circle-outline" size={40} />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.savedTitle}>{locale.t("contactAdd.saved")}</Text>
        <Text style={styles.savedName}>{form.displayName.trim()}</Text>
      </View>
      {contactId ? <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/contacts/[id]", params: { id: contactId } })} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{locale.t("contactAdd.openContact")}</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.replace("/contacts" as Href)} style={({ pressed }) => [styles.secondaryButton, styles.stackGap, pressed && styles.pressed]}>
        <Text style={styles.secondaryButtonText}>{locale.t("contactAdd.backToContacts")}</Text>
      </Pressable>
    </ContactPage>;
  }

  if (stage === "review") {
    return <ContactPage detail backHref="/contacts" title={locale.t("contactAdd.reviewTitle")}>
      <Text style={styles.hint}>{locale.t("contactAdd.reviewHint")}</Text>
      <View style={styles.reviewList}>
        {manualReviewRows(form).map(row => <View key={row.field} style={styles.reviewRow}>
          <Text style={styles.fieldLabel}>{locale.t(row.labelKey)}</Text>
          <Text style={[styles.reviewValue, !row.value && styles.reviewEmpty]}>{row.value || locale.t("contactAdd.notFilled")}</Text>
        </View>)}
      </View>
      {error}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={save} style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{saving ? locale.t("contactAdd.saving") : locale.t("contactAdd.saveToContacts")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setErrorKey(null); setStage("edit"); }} style={({ pressed }) => [styles.secondaryButton, styles.stackGap, saving && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.secondaryButtonText}>{locale.t("contactAdd.editAgain")}</Text>
      </Pressable>
    </ContactPage>;
  }

  const filled = manualRelationshipFilled(form);
  return <ContactPage detail backHref="/contacts" title={locale.t("contactAdd.manualTitle")}>
    <Text style={styles.hint}>{locale.t("contactAdd.manualHint")}</Text>
    <Field
      emphasis
      label={locale.t("contactAdd.name")}
      onChangeText={value => update("displayName", value)}
      placeholder={locale.t("contactAdd.namePlaceholder")}
      required={locale.t("contactAdd.required")}
      value={form.displayName}
    />
    <Field label={locale.t("contactAdd.company")} onChangeText={value => update("organization", value)} placeholder={locale.t("contactAdd.companyPlaceholder")} value={form.organization} />
    <Field label={locale.t("contactAdd.role")} onChangeText={value => update("role", value)} placeholder={locale.t("contactAdd.rolePlaceholder")} value={form.role} />
    <Pressable
      accessibilityHint={locale.t("contactAdd.moreInfoDetail")}
      accessibilityLabel={locale.t("contactAdd.moreInfo")}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      aria-expanded={expanded}
      onPress={() => setExpanded(current => !current)}
      style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
    >
      <View style={styles.disclosureText}>
        <Text style={styles.disclosureTitle}>{locale.t("contactAdd.moreInfo")}</Text>
        <Text style={styles.disclosureDetail}>{filled && !expanded ? locale.t("contactAdd.moreInfoFilled", { count: filled }) : locale.t("contactAdd.moreInfoDetail")}</Text>
      </View>
      <Ionicons color={colors.text3} name={expanded ? "chevron-up" : "chevron-down"} size={22} />
    </Pressable>
    {expanded ? <View>
      {errorKey === "contactAdd.noteRequired" ? error : null}
      <Field label={locale.t("contactAdd.note")} multiline onChangeText={value => update("note", value)} placeholder={locale.t("contactAdd.notePlaceholder")} value={form.note} />
      <Field label={locale.t("contactAdd.nextStep")} onChangeText={value => update("followUpHint", value)} placeholder={locale.t("contactAdd.nextStepPlaceholder")} value={form.followUpHint} />
      <Field label={locale.t("contactAdd.tags")} onChangeText={value => update("tagsText", value)} placeholder={locale.t("contactAdd.tagsPlaceholder")} value={form.tagsText} />
    </View> : null}
    {errorKey === "contactAdd.noteRequired" ? null : error}
    <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.primaryButton, styles.primaryTop, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{locale.t("contactAdd.nextReview")}</Text>
    </Pressable>
    <Text style={styles.footer}>{locale.t("contactAdd.reviewBeforeSave")}</Text>
  </ContactPage>;
}

function Field({ emphasis, label, multiline, onChangeText, placeholder, required, value }: {
  emphasis?: boolean;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  required?: string;
  value: string;
}) {
  const { colors, styles } = useStyles();
  return <View style={styles.field}>
    <Text style={[styles.label, emphasis && styles.labelEmphasis]}>
      {label}{required ? <Text accessibilityLabel={required} style={styles.required}> *</Text> : null}
    </Text>
    <TextInput
      accessibilityLabel={label}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.text4}
      style={[styles.input, emphasis && styles.inputEmphasis, multiline && styles.inputMultiline]}
      textAlignVertical={multiline ? "top" : "center"}
      value={value}
    />
  </View>;
}

const useStyles = createThemedStyles(colors => {
  const controls = createControlStyles(colors);
  return StyleSheet.create({
    hint: { color: colors.text3, fontSize: 14, marginBottom: spacing.sm, marginTop: spacing.md, textAlign: "center" },
    field: { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingTop: spacing.xl },
    label: { color: colors.ink, fontSize: 16, fontWeight: "700" },
    labelEmphasis: { fontSize: 20, fontWeight: "800" },
    required: { color: colors.text3, fontSize: 14, fontWeight: "600" },
    input: { color: colors.ink, fontSize: 17, minHeight: layout.control, paddingVertical: spacing.sm },
    // iOS clips a large single-line input with vertical padding; use a fixed height instead.
    inputEmphasis: { fontSize: 22, height: 56, minHeight: 56, paddingVertical: 0 },
    inputMultiline: { minHeight: 88 },
    disclosure: { alignItems: "center", borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, marginTop: spacing.xl, minHeight: 72, paddingVertical: spacing.md },
    disclosureText: { flex: 1, gap: spacing.xxs },
    disclosureTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
    disclosureDetail: { color: colors.text3, fontSize: 14 },
    error: { color: colors.rose, fontSize: 15, marginTop: spacing.lg },
    primaryButton: { ...controls.primaryButton, marginTop: spacing.xl },
    primaryTop: { marginTop: spacing.xxl },
    primaryButtonText: controls.primaryButtonText,
    secondaryButton: controls.secondaryButton,
    secondaryButtonText: controls.secondaryButtonText,
    stackGap: { marginTop: spacing.md },
    footer: { color: colors.text3, fontSize: 14, marginTop: spacing.md, textAlign: "center" },
    reviewList: { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md },
    reviewRow: { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xxs, paddingVertical: spacing.md },
    fieldLabel: { ...rowRoleStyles.fieldLabel, color: colors.text3 },
    reviewValue: { ...rowRoleStyles.fieldValue, color: colors.ink },
    reviewEmpty: { color: colors.text4 },
    savedBlock: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xxl },
    savedTitle: { color: colors.ink, fontSize: 24, fontWeight: "900", textAlign: "center" },
    savedName: { color: colors.text2, fontSize: 16, textAlign: "center" },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.72 }
  });
});
