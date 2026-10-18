// R24 プラン概要 (Task › プラン with an active v2 plan; b10 ⑦, UI-SPEC「Task › プラン」).
// Score head (count-up; fade only with 「減らす動き」), composition bar, the confirmed
// plan card with its four buttons, 今日のチャンス, pending cards, steps with progress
// and the user-confirmed completion, person-type cards with three cells, the event
// block and the footnote. Every number comes from GET /api/agent/plans/v2/[planId].
// R25: the goal name opens the goal switcher (▾); 方案を見直す / ↻ open the review
// entry sheet; 手動で編集 opens a review draft in the manual editor (greyed with
// 「見直すと 1回つきます」 once used); 目標を達成した asks, achieves and opens 完了.
import { useRouter, type Href } from "expo-router";
import { useRef, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanGoalListItem, PlanPendingItem, PlanV2Detail, PlanV2PersonType } from "../../api/contract/plan-v2";
import { planDoneHref, planDraftEditHref, planTypeHref } from "../../api/compute/plan-href";
import {
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Icon,
  UiPressable,
  UiText,
  useToast,
} from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { canConfirmManualMemo, groupPending, pendingPoints } from "./plan-overview-model";
import { ScoreNumber, Section, usePlanOverviewStyles } from "./plan-overview-ui";
import { DiagCard, EventsCard, GoalRow, HeroCard, StepsCard, TodayCard, TypesCard, typeCards } from "./plan-overview-kit";
import { PlanGoalEditSheet, PlanGoalSwitcher } from "./PlanGoalSwitcher";
import { PlanReviewEntrySheet } from "./PlanReviewEntrySheet";
import { sinceConfirmedOf } from "./plan-review-model";
import { InlineProblem, useFailureText } from "./plan-ui";
import { usePlanAwardToast } from "./usePlanAwardToast";

export function PlanOverview({ plan, reload, goals = [], onAddGoal, design = null }: { plan: PlanV2Detail; reload: () => Promise<void>; goals?: readonly PlanGoalListItem[]; onAddGoal?: () => void; design?: string | null }) {
  const shared = usePlanOverviewStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const router = useRouter();
  const api = usePlanApi();
  const failureText = useFailureText();
  const showAward = usePlanAwardToast(plan.planId, () => void reload());
  const [premiseOpen, setPremiseOpen] = useState(false);
  const [reopen, setReopen] = useState<{ key: string; number: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [cardProblem, setCardProblem] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [achieveOpen, setAchieveOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // R31a (RD-28) dev-only gate states (b12 #198 前提 / b4 A3 #19 見直し / A5 #24 達成 / A6 #29 編集). `design` is null
  // outside a dev build with open-path (PlanSegment → designState).
  useEffect(() => {
    if (design === "premise") setPremiseOpen(true);
    else if (design === "review") setReviewOpen(true);
    else if (design === "achieve") setAchieveOpen(true);
    else if (design === "edit") setEditOpen(true);
  }, [design]);
  const score = plan.score;
  const pending = groupPending(plan.pending ?? []);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const goalIndex = activeGoals.findIndex((goal) => goal.planId === plan.planId);
  const talkedPeople = goals.find((goal) => goal.planId === plan.planId)?.talkedPeople ?? 0;
  const openType = (itemId: string) => router.push(planTypeHref("app", plan.planId, itemId) as Href);

  // One write at a time (R24 review m11: a second tap while a request runs does nothing).
  const running = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProblem(null);
    try { await work(); } finally { running.current = false; setBusy(false); }
  };
  const decidePending = (item: PlanPendingItem, accept: boolean, answered?: readonly number[]) => void run(async () => {
    const key = newIdempotencyKey(accept ? "pending-accept" : "pending-dismiss");
    const result = accept ? await api.acceptPending(item.id, key, answered) : await api.dismissPending(item.id, key);
    if (!result.ok) { setProblem(failureText(result.failure)); return; }
    // R24 review M6-2: only a counted award says 「+X 点」; none / no award says 「加点はありません」 (+ the reason).
    if (item.kind === "memo_coverage" && accept && result.data.award) showAward([result.data.award], item.title, item.contactId && item.detail ? item.detail : t("plan.type.anonymous"));
    else if (item.kind === "memo_coverage" && accept) toast.info(t("plan.award.noPoints"));
    else if (item.kind === "memo_coverage") toast.info(t("plan.pending.dismissed"));
    else if (item.kind === "step_suggestion" && accept) toast.success(copy.toast.completed, { undo: () => void reopenStep(item.id.split(":").slice(2).join(":")) });
    await reload();
  });
  // R25: 手動で編集 opens a review draft (no AI, no review used) in the R23 editor.
  const openManualEdit = () => void run(async () => {
    setCardProblem(null);
    const result = await api.openManualEdit(plan.planId, newIdempotencyKey("manual-open"));
    if (!result.ok) { setCardProblem(result.failure.kind === "used" ? t("plan.overview.manualUsed") : failureText(result.failure)); return; }
    router.push(planDraftEditHref("app", result.data.draftId) as Href);
  });
  const achieve = () => void run(async () => {
    setAchieveOpen(false);
    setCardProblem(null);
    const result = await api.achieve(plan.planId, plan.revision, newIdempotencyKey("achieve"));
    if (!result.ok) {
      setCardProblem(result.failure.kind === "stale" ? t("plan.error.stale") : failureText(result.failure));
      if (result.failure.kind === "stale" || result.failure.kind === "achieved") await reload();
      return;
    }
    router.push(planDoneHref("app", plan.planId) as Href);
  });
  const reopenStep = (stepKey: string) => run(async () => {
    setReopen(null);
    const result = await api.reopenStep(plan.planId, stepKey, newIdempotencyKey("step-reopen"));
    if (!result.ok) { setProblem(failureText(result.failure)); return; }
    toast.info(t("plan.step.reopened"));
    await reload();
  });

  const cards = typeCards(plan);
  const suggestionFor = (step: { key: string; completedAt?: string | null }) => (step.completedAt ? undefined : pending.steps.get(step.key));
  return (
    <View style={styles.page} testID="plan-overview">
      <GoalRow plan={plan} index={goalIndex + 1} count={goalIndex >= 0 ? plan.quota.activeGoalLimit : 0} onOpen={() => setSwitcherOpen(true)} />
      <HeroCard plan={plan} onOpenType={openType} score={<ScoreNumber value={score.total} accessibilityLabel={t("plan.overview.scoreA11y", { total: score.total })} />} />
      <DiagCard
        plan={plan}
        busy={busy}
        onPremise={() => setPremiseOpen(true)}
        onReview={() => setReviewOpen(true)}
        onManual={openManualEdit}
        onAchieve={() => setAchieveOpen(true)}
        onConversation={() => router.push("/agent" as Href)}
        problem={cardProblem ? <InlineProblem text={cardProblem} /> : null}
      />
      <TodayCard plan={plan} cards={cards} onGo={() => router.push(plan.todayChance!.href as Href)} />
      {pending.memo.length > 0 || pending.candidates.length > 0 || pending.steps.size > 0 ? (
        <Section title={t("plan.overview.pendingTitle")}>
          {pending.memo.map((item) => (
            <MemoCard key={item.id} item={item} plan={plan} busy={busy} onDecide={(accept, answered) => decidePending(item, accept, answered)} />
          ))}
          {plan.content.steps.map((step) => {
            const suggestion = suggestionFor(step);
            return suggestion ? (
              <View key={step.key} style={shared.dashedCard} testID="step-suggestion">
                <UiText style={shared.strong}>{t("plan.step.suggestion", { title: step.title })}</UiText>
                <View style={shared.between}>
                  <UiText style={[shared.meta, shared.grow]}>{t("plan.step.suggestionNote")}</UiText>
                  <Button size="sm" label={t("plan.step.notYet")} onPress={() => decidePending(suggestion, false)} variant="ghost" disabled={busy} />
                  <Button size="sm" label={copy.action.complete} onPress={() => decidePending(suggestion, true)} variant="primary" disabled={busy} />
                </View>
              </View>
            ) : null;
          })}
          {pending.candidates.map((item) => (
            <UiPressable key={item.id} accessibilityRole="button" accessibilityLabel={t("plan.pending.candidateOpen", { name: item.detail ?? "", type: item.title })} onPress={() => item.itemId && openType(item.itemId)} style={[shared.cardSoft, shared.between]} testID="pending-candidate">
              <UiText style={[shared.body, shared.grow]}>{t("plan.pending.candidate", { name: item.detail ?? "", type: item.title })}</UiText>
              <Icon name="right" size={16} color={styles.muted.color} />
            </UiPressable>
          ))}
        </Section>
      ) : null}
      {problem ? <InlineProblem text={problem} /> : null}
      <StepsCard plan={plan} cards={cards} onOpenType={openType} onOpenEvents={() => router.push("/events" as Href)} onDoneMark={(step, number) => setReopen({ key: step.key, number })} />
      <TypesCard plan={plan} cards={cards} onOpenType={openType} />
      <EventsCard plan={plan} onOpenEvent={(event) => router.push((event.assessmentHref ?? `/events/${encodeURIComponent(event.eventId)}`) as Href)} />

      <BottomSheet visible={premiseOpen} onClose={() => setPremiseOpen(false)} accessibilityLabel={t("plan.overview.premiseTitle")}>
        <View style={styles.sheet} testID="premise-sheet">
          <UiText accessibilityRole="header" style={shared.heading}>{t("plan.overview.premiseTitle")}</UiText>
          <UiText style={shared.meta}>{t("plan.overview.premiseNote")}</UiText>
          {plan.premise.map((row) => (
            <View key={row.key} style={styles.premiseRow}>
              <View style={shared.row}>
                <UiText style={shared.eyebrow}>{row.label}</UiText>
                {row.guessed ? <Chip label={t("plan.overview.premiseGuessed")} tone="apricot" /> : null}
              </View>
              <UiText style={shared.body}>{row.value}</UiText>
            </View>
          ))}
          <Button block icon="refresh" label={t("plan.overview.premiseChange")} onPress={() => { setPremiseOpen(false); setReviewOpen(true); }} variant="secondary" />
        </View>
      </BottomSheet>
      <ConfirmDialog
        visible={reopen !== null}
        title={t("plan.step.reopenTitle")}
        message={t("plan.step.reopenBody")}
        confirmLabel={copy.action.withdraw}
        onConfirm={() => reopen && void reopenStep(reopen.key)}
        onCancel={() => setReopen(null)}
      />
      <ConfirmDialog
        visible={achieveOpen}
        title={t("plan.achieve.title")}
        message={t("plan.achieve.body", { people: talkedPeople, total: score.total })}
        confirmLabel={t("plan.achieve.confirm")}
        icon={{ emoji: "\u{1F3C1}" }}
        onConfirm={achieve}
        onCancel={() => setAchieveOpen(false)}
      />
      <PlanReviewEntrySheet planId={plan.planId} visible={reviewOpen} onClose={() => setReviewOpen(false)} since={sinceConfirmedOf(plan)} />
      <PlanGoalSwitcher
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        goals={goals}
        currentPlanId={plan.planId}
        activeGoalLimit={plan.quota.activeGoalLimit}
        onSwitched={() => void reload()}
        onAdd={() => onAddGoal?.()}
        onEdit={() => setEditOpen(true)}
      />
      <PlanGoalEditSheet visible={editOpen} onClose={() => setEditOpen(false)} plan={plan} reviewLeft={plan.quota.reviewLeftThisMonth} onSaved={() => void reload()} />
    </View>
  );
}

/**
 * 「〇〇さんとの面談で 3 問中 N 問を話せました · +X 点にしますか？」, or the manual tick card (≥2 to confirm).
 * R24 review m9: +X is the server's `points` (it knows already-counted people and skipped
 * types); without it the card asks without a number. No contact → no 「〇〇さんとの」.
 */
function MemoCard({ item, plan, busy, onDecide }: { item: PlanPendingItem; plan: PlanV2Detail; busy: boolean; onDecide: (accept: boolean, answered?: readonly number[]) => void }) {
  const shared = usePlanOverviewStyles().styles;
  const { t } = useOrbitLocale();
  const [ticked, setTicked] = useState<number[]>([]);
  const type = plan.content.personTypes.find((entry) => entry.itemId === item.itemId);
  const points = pendingPoints(item);
  const name = item.contactId && item.detail ? item.detail : null;
  const count = item.answered?.length ?? 0;
  const text = (base: "plan.pending.memo" | "plan.pending.memoManual") => {
    const key = `${base}${name ? "" : "NoName"}${points === null ? "NoPoints" : ""}` as `${typeof base}${"" | "NoName"}${"" | "NoPoints"}`;
    return t(key, { count, name: name ?? "", points: points ?? 0 });
  };
  if (item.manual) {
    return (
      <View style={shared.dashedCard} testID="memo-manual">
        <UiText style={shared.strong}>{text("plan.pending.memoManual")}</UiText>
        <UiText style={shared.meta}>{t("plan.pending.memoManualNote")}</UiText>
        {(type?.questions ?? []).map((question, index) => {
          const checked = ticked.includes(index);
          return (
            <View key={index} style={shared.rowTop}>
              <Checkbox checked={checked} onChange={() => setTicked((list) => (checked ? list.filter((value) => value !== index) : [...list, index]))} accessibilityLabel={t("plan.pending.questionA11y", { number: index + 1, text: question })} />
              <UiText style={[shared.body, shared.grow]}>{question}</UiText>
            </View>
          );
        })}
        <View style={shared.row}>
          <Button size="sm" label={t("plan.pending.dismiss")} onPress={() => onDecide(false)} variant="ghost" disabled={busy} />
          <Button size="sm" label={t("plan.pending.accept")} onPress={() => onDecide(true, [...ticked].sort())} variant="primary" disabled={busy || !canConfirmManualMemo(ticked)} />
        </View>
      </View>
    );
  }
  return (
    <View style={shared.dashedCard} testID="memo-card">
      <UiText style={shared.strong}>{text("plan.pending.memo")}</UiText>
      <View style={shared.row}>
        <Button size="sm" icon="x" label={t("plan.pending.dismiss")} onPress={() => onDecide(false)} variant="ghost" disabled={busy} />
        <Button size="sm" icon="check" label={t("plan.pending.accept")} onPress={() => onDecide(true)} variant="primary" disabled={busy} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  // 嵌在 Task 段里的 AppScreen：顶部多了 spacing.md（12，与 kit .tswipe 的 margin-bottom 12 重复），
  // 左右是 layout.pageInset 16（kit .scroll 是 18）。壳归乙（热点文件），已提请改 AppScreen embedded，在那之前计划页先抵消。
  page: { gap: 14, marginTop: -12, marginHorizontal: 2 },
  toFull: { color: colors.macLavText, fontSize: 12, fontWeight: "700" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  accent: { color: colors.accentText },
  muted: { color: colors.ink3Text },
  link: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
  linkText: { color: colors.accentText, fontSize: 12, fontWeight: "700" },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  buttonCell: { flexBasis: "47%", flexGrow: 1 },
  chance: { borderWidth: 1.5, borderColor: colors.plum300 },
  step: { gap: 8, paddingBottom: 6 },
  typeChip: { backgroundColor: colors.macLav, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  typeChipText: { color: colors.macLavText, fontSize: 12, fontWeight: "700" },
  typePoints: { alignItems: "flex-end", gap: 4 },
  footnote: { color: colors.ink3Text, fontSize: 12, textAlign: "center", paddingVertical: 8 },
  sheet: { gap: 12, paddingBottom: 8 },
  premiseRow: { gap: 4, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
}));
