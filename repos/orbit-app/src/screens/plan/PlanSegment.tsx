// R23 / R24: the Task › プラン segment. With an active v2 plan it shows the overview
// (R24 プラン概要; the R23 minimal 「確定しました」 card stays only as the fallback while
// the overview endpoint is 「尚未実装」); without one it shows the goal input (目標入力).
// Reads GET /api/agent/plans/v2/summary and GET …/intakes when the segment is shown,
// then GET /api/agent/plans/v2/[planId] for the current goal; nothing is written until
// the user acts.
// R25: `new=1` (planNewGoalHref) opens the goal input directly — with two active goals
// it explains the limit instead; without a v2 goal but with a v1 plan the segment shows
// the read-only 「以前のプラン」 card and 「新しいプランを作る」; the overview gets the goal
// list for the switcher, and achieved goals stay reachable when no goal is active.
import { useIsFocused, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanGoalListItem, PlanIntakeListResponse, PlanLegacyItem, PlanV2Detail, PlanV2HomeSummary } from "../../api/contract/plan-v2";
import { planDoneHref } from "../../api/compute/plan-href";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button, Chip, EmptyState, Icon, RetryCard, Skeleton, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi } from "./plan-api";
import { goalKindLabel } from "./plan-model";
import { PlanGoalInput } from "./PlanGoalInput";
import { PlanLegacyCard } from "./PlanLegacy";
import { PlanOverview } from "./PlanOverview";
import { LimitNote } from "./plan-ui";

type SegmentState =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "ready"; current: PlanV2HomeSummary | null; goals: readonly PlanGoalListItem[]; intakes: PlanIntakeListResponse | null; overview: PlanV2Detail | null; legacy: readonly PlanLegacyItem[] };

export function PlanSegment() {
  const api = usePlanApi();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const focused = useIsFocused();
  const copy = useStandardCopy();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const [state, setState] = useState<SegmentState>({ kind: "loading" });
  const [reloading, setReloading] = useState(false);
  const params = useLocalSearchParams<{ new?: string | string[] }>();
  const newParam = Array.isArray(params.new) ? params.new[0] : params.new;
  const [adding, setAdding] = useState(newParam === "1");
  const sequence = useRef(0);
  const ready = auth.ready && server.ready;

  useEffect(() => {
    if (newParam === "1") setAdding(true);
  }, [newParam]);

  const load = useCallback(async () => {
    const run = (sequence.current += 1);
    const [summary, intakes] = await Promise.all([api.summary(), api.listIntakes()]);
    if (run !== sequence.current) return;
    if ((!summary.ok && summary.failure.kind === "network") || (!intakes.ok && intakes.failure.kind === "network")) return setState({ kind: "offline" });
    // 「尚未実装」 hides the block that needs it (HOW-TO §4): no plan card, no goal input.
    const current = summary.ok ? summary.data.current : null;
    if (!summary.ok && summary.failure.kind !== "notImplemented") return setState({ kind: "failed" });
    if (!intakes.ok && intakes.failure.kind !== "notImplemented") return setState({ kind: "failed" });
    // R24: the overview of the current goal (same score as the summary: both come from summarizePlanScore).
    let overview: PlanV2Detail | null = null;
    let legacy: readonly PlanLegacyItem[] = [];
    if (current) {
      const detail = await api.overview(current.planId);
      if (run !== sequence.current) return;
      if (!detail.ok && detail.failure.kind === "network") return setState({ kind: "offline" });
      if (!detail.ok && detail.failure.kind !== "notImplemented") return setState({ kind: "failed" });
      overview = detail.ok ? detail.data : null;
    } else {
      // R25: a v1 plan (read only) replaces the goal input until the user starts a new one.
      const list = await api.legacyList();
      if (run !== sequence.current) return;
      legacy = list.ok ? list.data.plans : [];
    }
    setState({ current, goals: summary.ok ? summary.data.goals : [], intakes: intakes.ok ? intakes.data : null, kind: "ready", legacy, overview });
  }, [api]);

  // Read again each time the segment comes back into view (a plan may have been confirmed meanwhile).
  useEffect(() => {
    if (!ready || !focused) return;
    void load();
  }, [focused, load, ready]);

  const retry = async () => {
    setReloading(true);
    await load();
    setReloading(false);
  };

  return (
    <AppScreen title={copy.taskSegments.plan}>
      {state.kind === "loading" ? <Skeleton lines={4} /> : null}
      {state.kind === "offline" ? <EmptyState title={t("plan.segment.offlineTitle")} message={t("plan.segment.offlineBody")} action={{ label: copy.action.retry, onPress: () => void retry() }} /> : null}
      {state.kind === "failed" ? <RetryCard title={fillCopy(copy.error.loadFailed, { item: copy.taskSegments.plan })} onRetry={() => void retry()} retrying={reloading} /> : null}
      {state.kind === "ready" && adding ? <NewGoal intakes={state.intakes} onCancel={state.current || state.legacy.length ? () => { setAdding(false); router.setParams({ new: undefined }); } : null} /> : null}
      {state.kind === "ready" && !adding && state.current && state.overview ? <PlanOverview plan={state.overview} reload={load} goals={state.goals} onAddGoal={() => setAdding(true)} /> : null}
      {state.kind === "ready" && !adding && state.current && !state.overview ? <ConfirmedPlanCard plan={state.current} /> : null}
      {state.kind === "ready" && !adding && !state.current && state.legacy.length > 0 ? <PlanLegacyCard plans={state.legacy} onCreate={() => setAdding(true)} /> : null}
      {state.kind === "ready" && !adding && !state.current && state.legacy.length === 0 && state.intakes ? <PlanGoalInput intakes={state.intakes} /> : null}
      {state.kind === "ready" && !adding && !state.current && state.legacy.length === 0 && !state.intakes ? <EmptyState title={t("shell.task.planEmptyTitle")} message={t("shell.task.planEmptyBody")} /> : null}
      {state.kind === "ready" && !state.current ? <AchievedGoals goals={state.goals} /> : null}
    </AppScreen>
  );
}

/** R25 `new=1` / 「＋ 目標を追加」: the R23 goal input, or the limit explained with two active goals. */
function NewGoal({ intakes, onCancel }: { intakes: PlanIntakeListResponse | null; onCancel: (() => void) | null }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const full = Boolean(intakes && intakes.activeGoals >= intakes.activeGoalLimit);
  return (
    <View style={styles.page} testID="new-goal">
      {full ? (
        <View style={styles.card} testID="new-goal-full">
          <UiText accessibilityRole="header" style={styles.goal}>{t("plan.goals.addTitle")}</UiText>
          <LimitNote failure={{ kind: "goalLimit" }} />
          <UiText style={styles.body}>{t("plan.goals.fullBody")}</UiText>
        </View>
      ) : intakes ? <PlanGoalInput intakes={intakes} /> : <EmptyState title={t("shell.task.planEmptyTitle")} message={t("shell.task.planEmptyBody")} />}
      {onCancel ? <Button label={t("plan.goals.backToPlan")} onPress={onCancel} variant="ghost" /> : null}
    </View>
  );
}

/** Achieved goals stay reachable (their 完了 page) when no goal is active. */
function AchievedGoals({ goals }: { goals: readonly PlanGoalListItem[] }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const achieved = goals.filter((goal) => goal.status === "achieved");
  if (!achieved.length) return null;
  return (
    <View style={styles.card} testID="achieved-goals">
      <UiText style={styles.eyebrow}>{t("plan.goals.achievedTitle", { count: achieved.length })}</UiText>
      {achieved.map((goal) => (
        <UiPressable key={goal.planId} accessibilityRole="link" accessibilityLabel={t("plan.goals.achievedOpen", { goal: goal.goal })} onPress={() => router.push(planDoneHref("app", goal.planId) as Href)} style={styles.row}>
          <UiText style={styles.body}>🏁</UiText>
          <UiText numberOfLines={2} style={[styles.body, styles.grow]}>{goal.goal}</UiText>
          <Icon name="right" size={16} color={colors.ink3Text} />
        </UiPressable>
      ))}
    </View>
  );
}

/** The R23 minimal confirmed card: only shown while the R24 overview endpoint is 「尚未実装」. */
export function ConfirmedPlanCard({ plan }: { plan: PlanV2HomeSummary }) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const kind = goalKindLabel(plan.goalKind, language);
  return (
    <View style={styles.card}>
      <UiText style={styles.eyebrow}>{t("plan.confirmed.title")}</UiText>
      <UiText accessibilityRole="header" style={styles.goal}>{plan.goal}</UiText>
      <View style={styles.row}>
        {kind ? <Chip label={kind} tone="lav" /> : null}
        <UiText style={styles.score}>{t("plan.confirmed.score", { total: plan.score.total })}</UiText>
      </View>
      <UiText style={styles.body}>{t("plan.confirmed.body")}</UiText>
      <Button label={t("plan.confirmed.open")} onPress={() => toast.info(copy.homeEdit.comingSoon)} variant="secondary" />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18, gap: 10 },
  eyebrow: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" },
  goal: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  score: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  body: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
}));
