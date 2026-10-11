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
            <View style={shared.softCard}>
              <View style={shared.row}>
                <UiText style={[shared.label, shared.grow]}>{t("plan.review.thisMonth")}</UiText>
                <UiText style={shared.bigNumber}>{t("plan.review.left", { count: left })}</UiText>
              </View>
              <QuotaBar left={left} limit={limit} />
              <UiText style={shared.caption}>{t("plan.review.entryRules", { ...dateParts(ready.quota.resetsAt), limit })}</UiText>
            </View>
            <View style={shared.softCard}>
              <UiText style={shared.label}>{t("plan.review.dataTitle")}</UiText>
              <UiText style={shared.body2}>{since ? t("plan.review.dataCounts", { events: since.events, steps: since.stepsCompleted, talked: since.talked }) : t("plan.review.dataKinds")}</UiText>
            </View>
            {failure ? <FailureNote failure={failure} onReload={() => void load()} /> : null}
            <View style={shared.footerRow}>
              <Button label={t("plan.review.cancel")} onPress={onClose} variant="secondary" />
              <View style={shared.grow}><Button block label={resume ? t("plan.review.resume") : t("plan.review.start")} loading={starting} onPress={() => void start()} variant="primary" /></View>
            </View>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles(() => StyleSheet.create({
  sheet: { gap: 12, paddingBottom: 8 },
}));
