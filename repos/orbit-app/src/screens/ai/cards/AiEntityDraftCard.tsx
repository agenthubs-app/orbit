import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { radius, rowRoleStyles, spacing, textStyles } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { AiEntityDraftCardView } from "../../../view-models/ai-entity-draft";

/**
 * Sprint 0085: the card that replaces a paragraph promising a confirmation.
 *
 * Its whole job is to make the write visible before it happens: what will be
 * created, which fields you can still change, and a button that is the only
 * thing in the system able to commit it.
 */

const KIND_GLYPH: Readonly<Record<AiEntityDraftCardView["kind"], keyof typeof Ionicons.glyphMap>> = {
  event: "calendar-outline",
  note: "document-text-outline",
  schedule: "time-outline",
  task: "checkbox-outline",
};

export function AiEntityDraftCard({
  busy = false,
  onCancel,
  onConfirm,
  onEditField,
  onOpenRecord,
  view,
}: {
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onEditField?: (field: string, value: string) => void;
  onOpenRecord?: (href: string) => void;
  view: AiEntityDraftCardView;
}) {
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const created = view.state === "created";
  const settled = view.state === "cancelled" || view.state === "superseded";

  const stateLabel = created
    ? locale.t("aiEntityDraft.stateCreated")
    : view.state === "cancelled"
      ? locale.t("aiEntityDraft.stateCancelled")
      : view.state === "superseded"
        ? locale.t("aiEntityDraft.stateSuperseded")
        : locale.t("aiEntityDraft.statePending");

  return (
    <View
      accessibilityLabel={`${stateLabel} ${view.kindLabel} ${view.title}`}
      style={[styles.card, created && styles.cardCreated, settled && styles.cardSettled]}
    >
      <View style={[styles.header, created && styles.headerCreated]}>
        <Ionicons
          color={created ? colors.live : colors.accent}
          name={KIND_GLYPH[view.kind]}
          size={16}
        />
        <Text style={[styles.headerText, created && styles.headerTextCreated]}>
          {`${stateLabel} · ${view.kindLabel}`}
        </Text>
      </View>

      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>{view.title}</Text>

        {view.rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            {row.editable && row.field && view.confirmable && onEditField ? (
              <TextInput
                accessibilityLabel={row.label}
                editable={!busy}
                onChangeText={(next) => onEditField(row.field!, next)}
                style={styles.rowInput}
                value={row.value}
              />
            ) : (
              <Text style={styles.rowValue}>{row.value}</Text>
            )}
          </View>
        ))}

        {view.failureReason ? (
          <Text accessibilityRole="alert" style={styles.failure}>{view.failureReason}</Text>
        ) : null}
      </View>

      {view.confirmable ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={locale.t("aiEntityDraft.confirmNamed", { title: view.title })}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onConfirm}
            style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>
              {busy
                ? locale.t("aiEntityDraft.confirming")
                : view.failureReason
                  ? locale.t("aiEntityDraft.retry")
                  : locale.t("aiEntityDraft.confirm")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={locale.t("aiEntityDraft.cancelNamed", { title: view.title })}
            accessibilityRole="button"
            disabled={busy}
            onPress={onCancel}
            style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{locale.t("aiEntityDraft.cancel")}</Text>
          </Pressable>
        </View>
      ) : null}

      {created && view.createdHref && onOpenRecord ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={locale.t("aiEntityDraft.openRecord")}
            accessibilityRole="button"
            onPress={() => onOpenRecord(view.createdHref!)}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{locale.t("aiEntityDraft.openRecord")}</Text>
          </Pressable>
        </View>
      ) : null}

      {settled ? null : <Text style={styles.footnote}>{view.footnote}</Text>}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: {
    borderColor: colors.accent,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  cardCreated: { borderColor: colors.border },
  cardSettled: { borderColor: colors.border, opacity: 0.7 },
  header: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  headerCreated: { backgroundColor: colors.liveSoft },
  headerText: { ...rowRoleStyles.groupHeading, color: colors.accent },
  headerTextCreated: { color: colors.live },
  body: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { ...textStyles.listTitle, color: colors.ink },
  row: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  rowLabel: { ...rowRoleStyles.fieldLabel, color: colors.text3, minWidth: 48 },
  rowValue: { ...rowRoleStyles.fieldValue, color: colors.ink, flex: 1, textAlign: "right" },
  rowInput: {
    ...rowRoleStyles.fieldValue,
    color: colors.ink,
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
    textAlign: "right",
  },
  failure: { ...textStyles.small, color: colors.rose },
  actions: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.md },
  primary: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  primaryText: { ...textStyles.body, color: colors.onAccent, fontWeight: "600" },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  secondaryText: { ...textStyles.body, color: colors.text3 },
  footnote: {
    ...textStyles.caption,
    color: colors.text3,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
}));
