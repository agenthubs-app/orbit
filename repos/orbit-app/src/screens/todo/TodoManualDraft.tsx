import { StyleSheet, TextInput, View } from "react-native";

import { Button, Card, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

/** Handoff only. This URI does not identify a recipient or send a message. */
export function todoManualMailto(value: string): string | null {
  const body = value.trim();
  return body ? `mailto:?body=${encodeURIComponent(body)}` : null;
}

/** A previous actor's in-memory text must disappear on the first new-scope render. */
export function todoManualDraftForScope<T extends { scopeKey: string }>(draft: T | null, scopeKey: string): T | null {
  return draft?.scopeKey === scopeKey ? draft : null;
}

export function TodoManualDraft({ title, value, onChange, onClose, onCopy, onMail }: {
  title: string; value: string; onChange: (value: string) => void; onClose: () => void;
  onCopy: () => void; onMail: () => void;
}) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const ready = Boolean(value.trim());
  return <Card style={styles.card}>
    <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
    <UiText style={styles.note}>{t("todo.manualAiUnavailable")}</UiText>
    <UiText style={styles.note}>{t("todo.manualNoSend")}</UiText>
    <UiText style={styles.note}>{t("todo.manualNotSaved")}</UiText>
    <TextInput accessibilityLabel={t("todo.manualBody")} multiline maxLength={1200} value={value} onChangeText={onChange}
      placeholder={t("todo.manualPlaceholder")} placeholderTextColor={colors.ink3Text} style={styles.input} textAlignVertical="top" />
    <View style={styles.actions}>
      <Button label={t("todo.manualCopy")} onPress={onCopy} disabled={!ready} size="sm" variant="secondary" />
      <Button label={t("todo.manualMail")} onPress={onMail} disabled={!ready} size="sm" variant="secondary" />
      <Button label={t("todo.manualClose")} onPress={onClose} size="sm" variant="ghost" />
    </View>
  </Card>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { gap: 10, marginHorizontal: 16, marginBottom: 16 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  note: { color: colors.ink2, fontSize: 12 },
  input: { backgroundColor: colors.surface2, borderColor: colors.line, borderRadius: 12, borderWidth: 1,
    color: colors.ink, fontSize: 14, minHeight: 128, padding: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
