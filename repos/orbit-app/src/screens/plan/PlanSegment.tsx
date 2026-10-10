// R23 / R24: the Task › プラン segment. With an active v2 plan it shows the overview
// (R24 プラン概要; the R23 minimal 「確定しました」 card stays only as the fallback while
// the overview endpoint is 「尚未実装」); without one it shows the goal input (目標入力).
// Reads GET /api/agent/plans/v2/summary and GET …/intakes when the segment is shown,
// then GET /api/agent/plans/v2/[planId] for the current goal; nothing is written until
// the user acts.
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanIntakeListResponse, PlanV2Detail, PlanV2HomeSummary } from "../../api/contract/plan-v2";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button, Chip, EmptyState, RetryCard, Skeleton, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi } from "./plan-api";
import { goalKindLabel } from "./plan-model";
import { PlanGoalInput } from "./PlanGoalInput";
import { PlanOverview } from "./PlanOverview";

type SegmentState =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "ready"; current: PlanV2HomeSummary | null; intakes: PlanIntakeListResponse | null; overview: PlanV2Detail | null };

export function PlanSegment() {
  const api = usePlanApi();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const focused = useIsFocused();
  const copy = useStandardCopy();
  const { t } = useOrbitLocale();
  const [state, setState] = useState<SegmentState>({ kind: "loading" });
  const [reloading, setReloading] = useState(false);
  const sequence = useRef(0);
  const ready = auth.ready && server.ready;

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
    if (current) {
      const detail = await api.overview(current.planId);
      if (run !== sequence.current) return;
      if (!detail.ok && detail.failure.kind === "network") return setState({ kind: "offline" });
      if (!detail.ok && detail.failure.kind !== "notImplemented") return setState({ kind: "failed" });
      overview = detail.ok ? detail.data : null;
    }
    setState({ current, intakes: intakes.ok ? intakes.data : null, kind: "ready", overview });
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
      {state.kind === "ready" && state.current && state.overview ? <PlanOverview plan={state.overview} reload={load} /> : null}
      {state.kind === "ready" && state.current && !state.overview ? <ConfirmedPlanCard plan={state.current} /> : null}
      {state.kind === "ready" && !state.current && state.intakes ? <PlanGoalInput intakes={state.intakes} /> : null}
      {state.kind === "ready" && !state.current && !state.intakes ? <EmptyState title={t("shell.task.planEmptyTitle")} message={t("shell.task.planEmptyBody")} /> : null}
    </AppScreen>
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
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18, gap: 10 },
  eyebrow: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" },
  goal: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  score: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  body: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
}));
