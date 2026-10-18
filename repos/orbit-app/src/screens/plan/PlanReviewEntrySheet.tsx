// R25 「方案を見直す」 entry (b4 A4 ①, App BottomSheet): the 3-cell quota bar, when it
// comes back, the data this review reads, and 「iOrbit で見直す」 — which opens (or
// resumes) the review draft without using a review (only 「送る」 uses one). With none
// left it becomes the used-up note (A4 ②) with 「わかりました」 and no paid entry (Q6).
// Opening the sheet reads GET …/v2/quota and GET …/reviews/current only.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanQuotaResponse, PlanReviewView } from "../../api/contract/plan-v2";
import { planReviewHref } from "../../api/compute/plan-href";
import { BottomSheet, Button, Skeleton, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import type { SinceConfirmed } from "./plan-review-model";
import { dateParts, QuotaBar, ReviewUsedUpNote } from "./plan-review-ui";
import { FailureNote, usePlanStyles } from "./plan-ui";

type EntryState =
  | { kind: "loading" }
  | { kind: "failed"; failure: PlanFailure }
  | { kind: "ready"; quota: PlanQuotaResponse; current: PlanReviewView | null };

export function PlanReviewEntrySheet({ planId, visible, onClose, since: planSince = null }: { planId: string; visible: boolean; onClose: () => void; since?: SinceConfirmed | null }) {
  const api = usePlanApi();
  const router = useRouter();
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const [state, setState] = useState<EntryState>({ kind: "loading" });
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const run = (sequence.current += 1);
    setState({ kind: "loading" });
    const [quota, current] = await Promise.all([api.quota(), api.currentReview(planId)]);
    if (run !== sequence.current) return;
    if (!quota.ok) return setState({ failure: quota.failure, kind: "failed" });
    // No review in progress answers 404: that is the normal case, not a failure.
    if (!current.ok && current.failure.kind === "network") return setState({ failure: current.failure, kind: "failed" });
    setState({ current: current.ok ? current.data : null, kind: "ready", quota: quota.data });
  }, [api, planId]);

  useEffect(() => {
    if (!visible) return;
    setFailure(null);
    void load();
  }, [load, visible]);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setFailure(null);
    const result = await api.startReview(planId, newIdempotencyKey("review-start"));
    setStarting(false);
    if (!result.ok) return setFailure(result.failure);
    onClose();
    router.push(planReviewHref("app", planId) as Href);
  };

  const ready = state.kind === "ready" ? state : null;
  const left = ready?.quota.reviewLeftThisMonth ?? 0;
  const limit = ready?.quota.reviewMonthlyLimit ?? 0;
  // The review in progress knows the counts; else the overview's optional `sinceConfirmed`.
  const since = ready?.current?.sinceConfirmed ?? planSince;
  const resume = Boolean(ready?.current && ready.current.draft.turns.length > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("plan.review.entryTitle")}>
      <View style={styles.sheet} testID="review-entry">
        {state.kind === "loading" ? <Skeleton lines={4} /> : null}
        {state.kind === "failed" ? <FailureNote failure={state.failure} onReload={() => void load()} /> : null}
        {ready && left <= 0 ? (
          <>
            <ReviewUsedUpNote limit={limit} resetsAt={ready.quota.resetsAt} reason={ready.quota.reviewLimitReason} />
            {resume ? <Button block label={t("plan.review.resume")} onPress={() => { onClose(); router.push(planReviewHref("app", planId) as Href); }} variant="secondary" /> : null}
            <Button block label={t("plan.review.understood")} onPress={onClose} variant="primary" />
          </>
        ) : null}
        {ready && left > 0 ? (
          <>
            <UiText accessibilityRole="header" style={shared.heading}>{t("plan.review.entryTitle")}</UiText>
            <UiText style={shared.body2}>{t("plan.review.entryBody")}</UiText>
            <View style={styles.quotaCard}>
              <View style={styles.quotaHead}>
                <UiText style={styles.quotaTitle}>{t("plan.review.entryMonthTitle")}</UiText>
                <UiText style={styles.quotaLeft}>{t("plan.review.entryLeft", { count: left })}</UiText>
              </View>
              <View style={styles.quotaBar}><QuotaBar left={left} limit={limit} /></View>
              <UiText style={shared.caption}>{t("plan.review.entryRules", { ...dateParts(ready.quota.resetsAt), limit })}</UiText>
            </View>
            <View style={styles.dataBlock}>
              <UiText style={styles.dataTitle}>{t("plan.review.dataTitle")}</UiText>
              {since ? <View style={styles.dataChips}>
                <UiText style={styles.dataChip}>{t("plan.review.dataTalked", { count: since.talked })}</UiText>
                <UiText style={styles.dataChip}>{t("plan.review.dataEvents", { count: since.events })}</UiText>
                <UiText style={styles.dataChip}>{t("plan.review.dataSteps", { count: since.stepsCompleted })}</UiText>
              </View> : <UiText style={shared.body2}>{t("plan.review.dataKinds")}</UiText>}
            </View>
            {failure ? <FailureNote failure={failure} onReload={() => void load()} /> : null}
            <Button block label={resume ? t("plan.review.resume") : t("plan.review.start")} loading={starting} onPress={() => void start()} variant="primary" />
            <Button block label={t("plan.review.cancel")} onPress={onClose} variant="ghost" />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  sheet: { gap: 12, paddingBottom: 8 },
  quotaCard: { backgroundColor: colors.surface2, borderRadius: 18, gap: 9, padding: 13 },
  quotaHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  quotaTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  quotaLeft: { color: colors.plum700, fontSize: 11, fontWeight: "800" },
  quotaBar: { width: 88 },
  dataBlock: { gap: 8, paddingTop: 2 },
  dataTitle: { color: colors.ink3Text, fontSize: 11.5 },
  dataChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dataChip: { backgroundColor: colors.surface2, borderRadius: 999, color: colors.ink2, fontSize: 11, paddingHorizontal: 9, paddingVertical: 5 },
}));
