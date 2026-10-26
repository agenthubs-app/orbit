import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { radius, rowRoleStyles, spacing, textStyles } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { AiEntityDraftCardView } from "../../../view-models/ai-entity-draft";
import { PersonalScheduleDateTimePicker } from "../../schedule/PersonalScheduleDateTimePicker";

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

const DATE_FIELDS = new Set(["dueAt", "endsAt", "startsAt"]);

/** QA-A: "2026-10-27T10:00:00+09:00" → "10月27日 周二 10:00" once the card is settled (the raw ISO string was shown). */
function displayValue(field: string | undefined, value: string, language: string): string {
  if (!field || !DATE_FIELDS.has(field) || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", weekday: "short", ...(dateOnly ? { timeZone: "UTC" } : { hour: "2-digit", minute: "2-digit" }) }).format(at);
}

/** QA-A2: "2026-10-27" or "2026-10-27T10:00[:00][+09:00]" split into the parts the pickers edit (the value's own clock, no zone math). */
const DATE_VALUE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
function dateValueParts(value: string): { date: string; time: string | null; offset: string } | null {
  const match = DATE_VALUE.exec(value.trim());
  return match ? { date: match[1]!, offset: match[3] ?? "", time: match[2] ?? null } : null;
}
const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo"; } catch { return "Asia/Tokyo"; } };

/** QA-A2: a pending card's date/time is picked (calendar + hour/minute), not typed as an ISO string. */
function DateFieldEditor({ busy, label, language, onChange, value }: { busy: boolean; label: string; language: string; onChange: (value: string) => void; value: string }) {
  const { styles } = useStyles();
  const [picking, setPicking] = useState<"date" | "time" | null>(null);
  const parts = dateValueParts(value)!;
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
  const dateLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" }).format(new Date(`${parts.date}T00:00:00Z`));
  const compose = (date: string, time: string | null) => (time ? `${date}T${time}:00${parts.offset}` : date);
  return (
    <View style={styles.dateParts}>
      <Pressable accessibilityLabel={`${label} ${dateLabel}`} accessibilityRole="button" disabled={busy} onPress={() => setPicking("date")} style={({ pressed }) => [styles.datePill, pressed && styles.pressed]}>
        <Text style={styles.datePillText}>{dateLabel}</Text>
      </Pressable>
      {parts.time ? (
        <Pressable accessibilityLabel={`${label} ${parts.time}`} accessibilityRole="button" disabled={busy} onPress={() => setPicking("time")} style={({ pressed }) => [styles.datePill, pressed && styles.pressed]}>
          <Text style={styles.datePillText}>{parts.time}</Text>
        </Pressable>
      ) : null}
      {picking ? (
        <PersonalScheduleDateTimePicker
          disabled={busy}
          kind={picking}
          onCancel={() => setPicking(null)}
          onConfirm={(next) => { setPicking(null); onChange(picking === "date" ? compose(next, parts.time) : compose(parts.date, next)); }}
          title={label}
          value={picking === "date" ? parts.date : parts.time ?? ""}
          zone={deviceZone()}
        />
      ) : null}
    </View>
  );
}

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
          color={created ? colors.okText : colors.accentText}
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
            {row.editable && row.field && view.confirmable && onEditField && DATE_FIELDS.has(row.field) && dateValueParts(row.value) ? (
              <DateFieldEditor busy={busy} label={row.label} language={locale.language} onChange={(next) => onEditField(row.field!, next)} value={row.value} />
            ) : row.editable && row.field && view.confirmable && onEditField ? (
              <TextInput
                accessibilityLabel={row.label}
                editable={!busy}
                onChangeText={(next) => onEditField(row.field!, next)}
                style={styles.rowInput}
                value={row.value}
              />
            ) : (
              <Text style={styles.rowValue}>{displayValue(row.field, row.value, locale.language)}</Text>
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
    borderColor: colors.accentText,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  cardCreated: { borderColor: colors.line },
  cardSettled: { borderColor: colors.line, opacity: 0.7 },
  header: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  headerCreated: { backgroundColor: colors.okSoft },
  headerText: { ...rowRoleStyles.groupHeading, color: colors.accentText },
  headerTextCreated: { color: colors.okText },
  body: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { ...textStyles.listTitle, color: colors.ink },
  row: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  rowLabel: { ...rowRoleStyles.fieldLabel, color: colors.ink3Text, minWidth: 48 },
  rowValue: { ...rowRoleStyles.fieldValue, color: colors.ink, flex: 1, textAlign: "right" },
  rowInput: {
    ...rowRoleStyles.fieldValue,
    color: colors.ink,
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
    textAlign: "right",
  },
  failure: { ...textStyles.small, color: colors.coralText },
  dateParts: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, justifyContent: "flex-end" },
  datePill: { backgroundColor: colors.surface2, borderRadius: radius.md, justifyContent: "center", minHeight: 36, paddingHorizontal: spacing.sm },
  datePillText: { ...rowRoleStyles.fieldValue, color: colors.ink },
  actions: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.md },
  primary: {
    alignItems: "center",
    backgroundColor: colors.accentText,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  primaryText: { ...textStyles.body, color: colors.onAccent, fontWeight: "600" },
  secondary: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  secondaryText: { ...textStyles.body, color: colors.ink3Text },
  footnote: {
    ...textStyles.caption,
    color: colors.ink3Text,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
}));
