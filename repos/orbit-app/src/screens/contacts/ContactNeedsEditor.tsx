import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { layout, radius, spacing, textStyles } from "../../design/tokens";
import { useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { ContactNeedsErrorCode, ContactNeedsMessageCode } from "../../hooks/useContactNeeds";

export const contactNeedsErrorMessageKeys = {
  PROFILE_CONFLICT: "contacts.needError.PROFILE_CONFLICT",
  PROFILE_NOT_READY: "contacts.needError.PROFILE_NOT_READY",
  PROFILE_RECEIPT_INVALID: "contacts.needError.PROFILE_RECEIPT_INVALID",
  PROFILE_SAVE_FAILED: "contacts.needError.PROFILE_SAVE_FAILED",
} as const satisfies Record<ContactNeedsErrorCode, string>;

export const contactNeedsSuccessMessageKeys = {
  PROFILE_SAVED: "contacts.needMessage.PROFILE_SAVED",
  PROFILE_SAVED_OLDER_DRAFT: "contacts.needMessage.PROFILE_SAVED_OLDER_DRAFT",
} as const satisfies Record<ContactNeedsMessageCode, string>;

export function ContactNeedsHomeCard({
  unavailable = false,
  goal,
  loading,
  onEdit,
  onOpenMatches,
  onRetry,
}: {
  goal: string;
  loading: boolean;
  unavailable?: boolean;
  onEdit(): void;
  onOpenMatches(): void;
  onRetry?(): void;
}) {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const saved = goal.trim().length > 0;
  return (
    <View style={[styles.homeRoot, { borderBottomColor: colors.hairline }]}>
      <Pressable
        accessibilityLabel={saved ? locale.t("contacts.needEdit") : locale.t("contacts.needFill")}
        accessibilityRole="button"
        disabled={loading}
        onPress={onEdit}
        style={styles.homeCopy}
      >
        <Text style={[styles.label, { color: colors.text3 }]}>{locale.t("contacts.myNeed")}</Text>
        <Text numberOfLines={2} style={[styles.goal, { color: saved ? colors.ink : colors.text3 }]}>
          {loading ? locale.t("common.loading") : unavailable ? locale.t("contacts.needUnavailable") : saved ? goal : locale.t("contacts.needEmpty")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={saved ? locale.t("contacts.needSort") : locale.t("contacts.needFill")}
        accessibilityRole="button"
        disabled={loading}
        onPress={unavailable ? onRetry : saved ? onOpenMatches : onEdit}
        style={styles.action}
      >
        <Text style={[styles.actionText, { color: colors.accent }]}>
          {unavailable ? locale.t("common.retry") : saved ? locale.t("contacts.needSort") : locale.t("contacts.needFill")}
        </Text>
        <Ionicons color={colors.accent} name="chevron-forward" size={14} />
      </Pressable>
    </View>
  );
}

export function ContactNeedsEditor({
  draft,
  error,
  message,
  onCancel,
  onChange,
  onSave,
  saving,
  visible,
}: {
  draft: string;
  error: string | null;
  message: string | null;
  onCancel(): void;
  onChange(value: string): void;
  onSave(): void;
  saving: boolean;
  visible: boolean;
}) {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={visible}>
      <View style={[styles.editorRoot, { backgroundColor: colors.bg }]}>
        <View style={styles.editorHeader}>
          <Pressable accessibilityLabel={locale.t("common.cancel")} accessibilityRole="button" onPress={onCancel} style={styles.headerActionControl}>
            <Text style={[styles.headerAction, { color: colors.accent }]}>{locale.t("common.cancel")}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.editorTitle, { color: colors.ink }]}>{locale.t("contacts.myNeed")}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={[styles.editorHint, { color: colors.text2 }]}>{locale.t("contacts.needEditorHint")}</Text>
        <TextInput
          accessibilityLabel={locale.t("contacts.needInput")}
          autoFocus
          multiline
          onChangeText={onChange}
          placeholder={locale.t("contacts.needPlaceholder")}
          placeholderTextColor={colors.text4}
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.ink }]}
          value={draft}
        />
        {error ? <Text style={[styles.feedback, { color: colors.rose }]}>{error}</Text> : null}
        {message ? <Text style={[styles.feedback, { color: colors.live }]}>{message}</Text> : null}
        <Pressable
          accessibilityLabel={locale.t("contacts.needSave")}
          accessibilityRole="button"
          disabled={saving}
          onPress={onSave}
          style={({ pressed }) => [styles.save, { backgroundColor: colors.ink }, (pressed || saving) && styles.pressed]}
        >
          <Text style={[styles.saveText, { color: colors.bg }]}>{saving ? locale.t("contacts.needSaving") : locale.t("contacts.needSave")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  homeRoot: { minHeight: 67, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  homeCopy: { flex: 1, minWidth: 0, paddingRight: spacing.md },
  label: { ...textStyles.caption, fontWeight: "600" },
  goal: { ...textStyles.body, fontWeight: "600", marginTop: 1 },
  action: { minHeight: layout.control, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionText: { ...textStyles.small, fontWeight: "700" },
  editorRoot: { flex: 1, paddingHorizontal: layout.pageInset, paddingTop: spacing.lg },
  editorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.control },
  headerAction: { ...textStyles.small, fontWeight: "700" },
  headerActionControl: { minHeight: layout.control, minWidth: layout.control, justifyContent: "center" },
  headerSpacer: { width: 44 },
  editorTitle: { ...textStyles.title, fontWeight: "800" },
  editorHint: { ...textStyles.body, marginTop: spacing.xl },
  input: { ...textStyles.body, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.lg, minHeight: 132, padding: spacing.lg, textAlignVertical: "top" },
  feedback: { ...textStyles.small, marginTop: spacing.md },
  save: { minHeight: layout.primaryControl, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  saveText: { ...textStyles.body, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
