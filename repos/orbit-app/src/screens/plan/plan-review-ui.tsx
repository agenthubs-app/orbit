// R25 small pieces shared by the 見直し entry sheet, the review page and the done page:
// the 3-cell quota bar, the review page's 3-step progress, the used-up note (A4 ②,
// never a paid entry) and the Tokyo date text. Built from src/components/ui and
// theme tokens only.
import { StyleSheet, View } from "react-native";

import type { PlanReviewLimitReason } from "../../api/contract/plan-v2";
import { UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { daysUntil, quotaCells, tokyoDate, type ReviewStage } from "./plan-review-model";

/** The Tokyo calendar parts of an instant for the dictionary's date placeholders. */
export function dateParts(iso: string): { year: number; month: number; day: number } {
  return tokyoDate(iso) ?? { day: 0, month: 0, year: 0 };
}

/** Three cells: used ones grey, the ones left deep plum (b4 A4 ①). */
export function QuotaBar({ left, limit }: { left: number; limit: number }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t("plan.review.quotaA11y", { left, limit })} style={styles.bar} testID="quota-bar">
      {quotaCells(left, limit).map((cell, index) => <View key={index} style={[styles.cell, cell === "left" ? styles.cellLeft : styles.cellUsed]} testID={`quota-${cell}`} />)}
    </View>
  );
}

const STAGES = ["plan.review.stagePremise", "plan.review.stageFix", "plan.review.stageManual"] as const;

/** 前提 / AI 修正 / 手動編集 — the current one dark, the ones before it soft. */
export function ReviewProgress({ stage }: { stage: ReviewStage }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t("plan.stage.label", { stage: t(STAGES[stage]) })} style={styles.progress}>
      {STAGES.map((key, index) => (
        <View key={key} style={styles.progressItem}>
          <View style={[styles.progressBar, index < stage && styles.progressDone, index === stage && styles.progressNow]} />
          <UiText numberOfLines={1} style={[styles.progressLabel, index === stage && styles.progressLabelNow]}>{t(key)}</UiText>
        </View>
      ))}
    </View>
  );
}

/**
 * This month's reviews are used up (b4 A4 ②): what still works, when it comes back.
 * Deliberately no plan / pricing entry (Q6).
 */
export function ReviewUsedUpNote({ limit, resetsAt, reason, now = new Date() }: { limit: number; resetsAt: string; reason?: PlanReviewLimitReason | undefined; now?: Date }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const reset = dateParts(resetsAt);
  return (
    <View accessibilityRole="text" style={styles.usedUp} testID="review-used-up">
      <UiText style={styles.usedUpTitle}>{t(reason === "ai_budget" ? "plan.review.aiBudgetTitle" : "plan.review.usedUpTitle")}</UiText>
      <UiText style={styles.usedUpMeta}>{t(reason === "ai_budget" ? "plan.review.aiBudgetMeta" : "plan.review.usedUpMeta", { day: reset.day, days: daysUntil(resetsAt, now), limit, month: reset.month })}</UiText>
      <UiText style={styles.usedUpBody}>{t("plan.review.usedUpBody")}</UiText>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bar: { flexDirection: "row", gap: 6 },
  cell: { flex: 1, height: 8, borderRadius: 4 },
  cellUsed: { backgroundColor: colors.surface3 },
  cellLeft: { backgroundColor: colors.plum700 },
  progress: { flexDirection: "row", gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
  progressItem: { flex: 1, gap: 4, minWidth: 0 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: colors.surface3 },
  progressDone: { backgroundColor: colors.plum300 },
  progressNow: { backgroundColor: colors.plum900 },
  progressLabel: { color: colors.ink3Text, fontSize: 10.5, textAlign: "center" },
  progressLabelNow: { color: colors.ink, fontWeight: "800" },
  usedUp: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 14, gap: 6 },
  usedUpTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  usedUpMeta: { color: colors.ink2, fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  usedUpBody: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
}));
