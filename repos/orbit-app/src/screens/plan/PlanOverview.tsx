// R24 プラン概要 (Task › プラン with an active v2 plan; b10 ⑦, UI-SPEC「Task › プラン」).
// Score head (count-up; fade only with 「減らす動き」), composition bar, the confirmed
// plan card with its four buttons (前提を見る read-only; 見直し / 手動編集 / 達成 say
// 「まもなく使えます」 until R25), 今日のチャンス, pending cards, steps with progress
// and the user-confirmed completion, person-type cards with three cells, the event
// block and the footnote. Every number comes from GET /api/agent/plans/v2/[planId].
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanPendingItem, PlanV2Detail, PlanV2PersonType } from "../../api/contract/plan-v2";
import { planTypeHref } from "../../api/compute/plan-href";
import {
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Icon,
  IconButton,
  SampleTag,
  UiPressable,
  UiText,
  useToast,
  WhyDisclosure,
} from "../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi } from "./plan-api";
import { goalKindLabel, newIdempotencyKey, PLAN_EVENT_EMOJI } from "./plan-model";
import { canConfirmManualMemo, groupPending, segmentKinds, stepNumbers, typeLetterOf, typePace } from "./plan-overview-model";
import { LegendItem, ScoreBar, ScoreNumber, Section, StatCells, Stripes, usePlanOverviewStyles } from "./plan-overview-ui";
import { InlineProblem, useFailureText } from "./plan-ui";
import { usePlanAwardToast } from "./usePlanAwardToast";

export function PlanOverview({ plan, reload }: { plan: PlanV2Detail; reload: () => Promise<void> }) {
  const shared = usePlanOverviewStyles().styles;
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const router = useRouter();
  const api = usePlanApi();
  const failureText = useFailureText();
  const showAward = usePlanAwardToast(plan.planId, () => void reload());
  const [premiseOpen, setPremiseOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [reopen, setReopen] = useState<{ key: string; number: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const kind = goalKindLabel(plan.goalKind, language);
  const score = plan.score;
  const kinds = segmentKinds(score.segments);
  const pending = groupPending(plan.pending ?? []);
  const soon = () => toast.info(t("plan.overview.soon"));
  const openType = (itemId: string) => router.push(planTypeHref("app", plan.planId, itemId) as Href);
  const typeByKey = new Map(plan.content.personTypes.map((type) => [type.key, type]));
  const segmentLabel = (key: string) => (key === "event" ? t("plan.event.title") : typeByKey.get(key)?.shortLabel ?? key);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    await work();
    setBusy(false);
  };
  const decidePending = (item: PlanPendingItem, accept: boolean, answered?: readonly number[]) => void run(async () => {
    const key = newIdempotencyKey(accept ? "pending-accept" : "pending-dismiss");
    const result = accept ? await api.acceptPending(item.id, key, answered) : await api.dismissPending(item.id, key);
    if (!result.ok) { setProblem(failureText(result.failure)); return; }
    if (item.kind === "memo_coverage" && accept && result.data.award) showAward([result.data.award], item.title, item.detail ?? t("plan.type.anonymous"));
    else if (item.kind === "memo_coverage") toast.info(t(accept ? "plan.pending.accepted" : "plan.pending.dismissed"));
    else if (item.kind === "step_suggestion" && accept) toast.success(copy.toast.completed, { undo: () => void reopenStep(item.id.split(":").slice(2).join(":")) });
    await reload();
  });
  const reopenStep = (stepKey: string) => run(async () => {
    setReopen(null);
    const result = await api.reopenStep(plan.planId, stepKey, newIdempotencyKey("step-reopen"));
    if (!result.ok) { setProblem(failureText(result.failure)); return; }
    toast.info(t("plan.step.reopened"));
    await reload();
  });

  return (
    <View style={styles.page} testID="plan-overview">
      <View style={shared.between}>
        <View style={[shared.row, shared.grow]}>
          <UiText accessibilityRole="header" style={shared.title}>{plan.goal}</UiText>
          {kind ? <Chip label={kind} tone="lav" /> : null}
        </View>
        {plan.sample ? <SampleTag /> : null}
      </View>

      <View style={shared.card} testID="score-head">
        <View style={shared.between}>
          <UiText style={shared.eyebrow}>{t("plan.overview.scoreLabel")}</UiText>
          <View style={shared.row}>
            {score.todayDelta > 0 ? <Chip label={t("plan.overview.today", { points: score.todayDelta })} tone="ok" /> : null}
            {score.remainingToFull > 0 ? <UiText style={styles.toFull}>{t("plan.overview.toFull", { points: score.remainingToFull })}</UiText> : null}
          </View>
        </View>
        <View style={shared.between}>
          <ScoreNumber value={score.total} accessibilityLabel={t("plan.overview.scoreA11y", { total: score.total })} />
          <UiText style={shared.meta}>{t("plan.overview.breakdown", { skipped: score.skipped, talked: score.talked })}</UiText>
        </View>
        <UiText style={shared.meta}>{t("plan.overview.scoreOf")}</UiText>
        <ScoreBar
          segments={score.segments}
          label={(segment) => t("plan.overview.segmentA11y", { allocation: segment.allocation, earned: segment.earned + segment.overflow, label: segmentLabel(segment.key) })}
          onOpen={(key) => { const type = typeByKey.get(key); if (type) openType(type.itemId); }}
        />
        <View style={styles.legend}>
          <LegendItem kind="solid" label={t("plan.overview.legendTalked")} />
          <LegendItem kind="striped" label={t("plan.overview.legendSkipped")} />
          {kinds.overflow ? <LegendItem kind="overflow" label={t("plan.overview.legendOverflow")} /> : null}
          <LegendItem kind="rest" label={t("plan.overview.legendRest")} />
        </View>
      </View>

      <View style={shared.card} testID="plan-card">
        <View style={shared.between}>
          <View style={shared.row}>
            <Icon name="target" size={20} color={styles.accent.color} />
            <UiText style={shared.title}>{t("plan.overview.planTitle")}</UiText>
          </View>
          {plan.content.basis.length > 0 ? <WhyDisclosure reason={plan.content.basis.map((item) => item.label).join(" · ")} /> : null}
        </View>
        <UiText style={shared.eyebrow}>{t("plan.overview.diagnosis")}</UiText>
        <UiText numberOfLines={diagnosisOpen ? undefined : 2} style={shared.body}>{plan.content.diagnosis}</UiText>
        <UiPressable accessibilityRole="button" accessibilityState={{ expanded: diagnosisOpen }} hitSlop={8} onPress={() => setDiagnosisOpen((value) => !value)} style={styles.link}>
          <UiText style={styles.linkText}>{diagnosisOpen ? t("plan.overview.collapse") : t("plan.overview.fullText")}</UiText>
        </UiPressable>
        <UiText style={shared.eyebrow}>{t("plan.overview.conclusion")}</UiText>
        <UiText style={shared.strong}>{plan.content.conclusion}</UiText>
        <View style={styles.buttons}>
          <View style={styles.buttonCell}><Button block icon="layers" label={t("plan.overview.premise")} onPress={() => setPremiseOpen(true)} variant="secondary" /></View>
          <View style={styles.buttonCell}><Button block icon="refresh" label={t("plan.overview.review")} onPress={soon} variant="secondary" /></View>
          <View style={styles.buttonCell}><Button block icon="pen" label={t("plan.overview.manualEdit")} onPress={soon} variant="secondary" /></View>
          <View style={styles.buttonCell}><Button block icon="flag" label={t("plan.overview.achieve")} onPress={soon} variant="secondary" /></View>
        </View>
        <UiText style={shared.meta}>{t("plan.overview.reviewNote", { left: plan.quota.reviewLeftThisMonth, limit: plan.quota.reviewMonthlyLimit })}</UiText>
      </View>

      {plan.todayChance ? (
        <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.overview.chanceOpen", { label: plan.todayChance.label })} onPress={() => router.push(plan.todayChance!.href as Href)} style={[shared.card, styles.chance]} testID="today-chance">
          <View style={shared.between}>
            <View style={shared.row}>
              <Icon name="sparkle" size={20} color={styles.accent.color} />
              <UiText style={shared.title}>{t("plan.overview.chanceTitle")}</UiText>
            </View>
            {plan.todayChance.points > 0 ? <Chip label={t("plan.overview.chancePoints", { points: plan.todayChance.points })} tone="lav" /> : null}
          </View>
          <View style={shared.between}>
            <UiText style={[shared.body, shared.grow]}>{plan.todayChance.label}</UiText>
            <Icon name="right" size={16} color={styles.muted.color} />
          </View>
        </UiPressable>
      ) : null}

      {pending.memo.length > 0 || pending.candidates.length > 0 ? (
        <Section title={t("plan.overview.pendingTitle")}>
          {pending.memo.map((item) => (
            <MemoCard key={item.id} item={item} plan={plan} busy={busy} onDecide={(accept, answered) => decidePending(item, accept, answered)} />
          ))}
          {pending.candidates.map((item) => (
            <UiPressable key={item.id} accessibilityRole="button" accessibilityLabel={t("plan.pending.candidateOpen", { name: item.detail ?? "", type: item.title })} onPress={() => item.itemId && openType(item.itemId)} style={[shared.cardSoft, shared.between]} testID="pending-candidate">
              <UiText style={[shared.body, shared.grow]}>{t("plan.pending.candidate", { name: item.detail ?? "", type: item.title })}</UiText>
              <Icon name="right" size={16} color={styles.muted.color} />
            </UiPressable>
          ))}
        </Section>
      ) : null}
      {problem ? <InlineProblem text={problem} /> : null}

      <Section title={t("plan.step.title")} note={t("plan.step.note")}>
        {plan.content.steps.map((step, index) => {
          const number = index + 1;
          const progress = plan.stepProgress?.find((item) => item.stepKey === step.key);
          const suggestion = step.completedAt ? undefined : pending.steps.get(step.key);
          return (
            <View key={step.key} style={styles.step} testID="plan-step">
              <View style={shared.row}>
                <View style={shared.numberDot}><UiText style={shared.numberDotText}>{String(number)}</UiText></View>
                <UiText style={[shared.title, shared.grow]}>{step.title}</UiText>
                {step.completedAt ? (
                  <IconButton icon="check-circle" size={34} soft accessibilityLabel={t("plan.step.done", { number })} onPress={() => setReopen({ key: step.key, number })} />
                ) : step.why ? <WhyDisclosure reason={step.why} /> : null}
              </View>
              <View style={shared.cardSoft}>
                <View style={shared.between}>
                  <View style={[shared.row, shared.grow]}>
                    <Icon name="flag" size={16} color={styles.muted.color} />
                    <UiText style={shared.eyebrow}>{t("plan.step.criteria")}</UiText>
                  </View>
                  {suggestion ? <Chip label={copy.chip.awaitingConfirmation} tone="apricot" /> : step.completedAt ? <Chip label={copy.chip.completed} tone="ok" /> : progress ? <Chip label={progress.label} tone="lav" /> : null}
                </View>
                <UiText style={shared.body}>{step.doneCriteria}</UiText>
              </View>
              {suggestion ? (
                <View style={shared.dashedCard} testID="step-suggestion">
                  <UiText style={shared.strong}>{t("plan.step.suggestion", { title: step.title })}</UiText>
                  <View style={shared.between}>
                    <UiText style={[shared.meta, shared.grow]}>{t("plan.step.suggestionNote")}</UiText>
                    <Button size="sm" label={t("plan.step.notYet")} onPress={() => decidePending(suggestion, false)} variant="ghost" disabled={busy} />
                    <Button size="sm" label={copy.action.complete} onPress={() => decidePending(suggestion, true)} variant="primary" disabled={busy} />
                  </View>
                </View>
              ) : null}
              <View style={shared.row}>
                {step.personTypeKeys.map((key) => {
                  const type = typeByKey.get(key);
                  const label = type ? `${type.emoji} ${typeLetterOf(plan.content.personTypes, key)} ${type.shortLabel}` : `${PLAN_EVENT_EMOJI} ${t("plan.event.title")}`;
                  return type ? (
                    <UiPressable key={key} accessibilityRole="link" accessibilityLabel={t("plan.types.open", { label: type.shortLabel })} onPress={() => openType(type.itemId)} style={styles.typeChip}>
                      <UiText style={styles.typeChipText}>{label}</UiText>
                    </UiPressable>
                  ) : <View key={key} style={styles.typeChip}><UiText style={styles.typeChipText}>{label}</UiText></View>;
                })}
              </View>
            </View>
          );
        })}
      </Section>

      <Section title={t("plan.types.title")} note={t("plan.types.note")}>
        {plan.content.personTypes.map((type) => <TypeCard key={type.itemId} plan={plan} type={type} onOpen={() => openType(type.itemId)} />)}
        <EventCard plan={plan} />
      </Section>

      <UiText style={styles.footnote}>{t("plan.overview.footnote")}</UiText>

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
          <Button block icon="refresh" label={t("plan.overview.premiseChange")} onPress={soon} variant="secondary" />
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
    </View>
  );
}

/** 「〇〇さんとの面談で 3 問中 N 問を話せました · +X 点にしますか？」, or the manual tick card (≥2 to confirm). */
function MemoCard({ item, plan, busy, onDecide }: { item: PlanPendingItem; plan: PlanV2Detail; busy: boolean; onDecide: (accept: boolean, answered?: readonly number[]) => void }) {
  const shared = usePlanOverviewStyles().styles;
  const { t } = useOrbitLocale();
  const [ticked, setTicked] = useState<number[]>([]);
  const type = plan.content.personTypes.find((entry) => entry.itemId === item.itemId);
  const segment = plan.score.segments.find((entry) => entry.key === type?.key);
  const points = type && segment ? typePace(type.allocation, type.targetCount, segment.earned, segment.skipped).next : 0;
  const name = item.detail;
  const count = item.answered?.length ?? 0;
  if (item.manual) {
    return (
      <View style={shared.dashedCard} testID="memo-manual">
        <UiText style={shared.strong}>{name ? t("plan.pending.memoManual", { name, points }) : t("plan.pending.memoManualNoName", { points })}</UiText>
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
      <UiText style={shared.strong}>{name ? t("plan.pending.memo", { count, name, points }) : t("plan.pending.memoNoName", { count, points })}</UiText>
      <View style={shared.row}>
        <Button size="sm" icon="x" label={t("plan.pending.dismiss")} onPress={() => onDecide(false)} variant="ghost" disabled={busy} />
        <Button size="sm" icon="check" label={t("plan.pending.accept")} onPress={() => onDecide(true)} variant="primary" disabled={busy} />
      </View>
    </View>
  );
}

function TypeCard({ plan, type, onOpen }: { plan: PlanV2Detail; type: PlanV2PersonType; onOpen: () => void }) {
  const shared = usePlanOverviewStyles().styles;
  const { styles } = useStyles();
  const { colors } = useOrbitTheme();
  const { t } = useOrbitLocale();
  const segment = plan.score.segments.find((entry) => entry.key === type.key);
  const earned = segment?.earned ?? 0;
  const skipped = segment?.skipped ?? type.skipped;
  const pace = typePace(type.allocation, type.targetCount, earned, skipped);
  const stats = plan.typeStats?.find((entry) => entry.itemId === type.itemId);
  const steps = stepNumbers(plan.content.steps, type.key, t("plan.types.stepSeparator"));
  const letter = typeLetterOf(plan.content.personTypes, type.key);
  const paceText = t(pace.firstUnit === pace.lastUnit ? "plan.types.pace" : "plan.types.paceLast", { last: pace.lastUnit, met: pace.met, target: pace.target, unit: pace.firstUnit });
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.types.open", { label: type.shortLabel })} onPress={onOpen} style={shared.cardSoft} testID="type-card">
      <View style={shared.rowTop}>
        <View style={shared.emojiTile}><UiText style={shared.emoji}>{type.emoji}</UiText></View>
        <View style={shared.grow}>
          <UiText style={shared.eyebrow}>{steps ? t("plan.types.eyebrow", { label: type.shortLabel, letter, steps }) : t("plan.types.eyebrowNoStep", { label: type.shortLabel, letter })}</UiText>
          <UiText style={shared.strong}>{type.roleSituation}</UiText>
        </View>
        <View style={styles.typePoints}>
          <UiText style={shared.points}>{t("plan.types.points", { allocation: type.allocation, earned: earned + (segment?.overflow ?? 0) })}</UiText>
          {skipped ? <Chip label={t("plan.types.skipped")} tone="neutral" /> : null}
        </View>
      </View>
      {stats ? <StatCells candidates={stats.candidates} events={stats.events} routes={stats.introRoutes} /> : null}
      <View style={shared.row}>
        <UiText style={shared.meta}>{skipped ? t("plan.types.skipped") : paceText}</UiText>
        <View style={[shared.track, shared.grow]}>
          {earned > 0 ? <View style={{ flex: Math.min(type.allocation, earned), backgroundColor: colors.plum700 }}>{skipped ? <Stripes background={colors.plum300} color={colors.plum700} /> : null}</View> : null}
          {type.allocation - earned > 0 ? <View style={{ flex: type.allocation - earned }} /> : null}
        </View>
      </View>
    </UiPressable>
  );
}

function EventCard({ plan }: { plan: PlanV2Detail }) {
  const shared = usePlanOverviewStyles().styles;
  const { colors } = useOrbitTheme();
  const { t } = useOrbitLocale();
  const segment = plan.score.segments.find((entry) => entry.key === "event");
  const event = plan.content.event;
  if (event.allocation <= 0) return null;
  const earned = segment?.earned ?? 0;
  const pace = typePace(event.allocation, event.targetCount, earned, false);
  const steps = stepNumbers(plan.content.steps, "event", t("plan.types.stepSeparator"));
  return (
    <View style={shared.cardSoft} testID="event-card">
      <View style={shared.rowTop}>
        <View style={shared.emojiTile}><UiText style={shared.emoji}>{PLAN_EVENT_EMOJI}</UiText></View>
        <View style={shared.grow}>
          <UiText style={shared.eyebrow}>{steps ? t("plan.event.eyebrow", { steps }) : t("plan.event.title")}</UiText>
          <UiText style={shared.strong}>{t("plan.event.title")}</UiText>
        </View>
        <UiText style={shared.points}>{t("plan.types.points", { allocation: event.allocation, earned: earned + (segment?.overflow ?? 0) })}</UiText>
      </View>
      <View style={shared.row}>
        <UiText style={shared.meta}>{t("plan.event.pace", { done: pace.met, target: pace.target, unit: pace.firstUnit })}</UiText>
        <View style={[shared.track, shared.grow]}>
          {earned > 0 ? <View style={{ flex: Math.min(event.allocation, earned), backgroundColor: colors.plum700 }} /> : null}
          {event.allocation - earned > 0 ? <View style={{ flex: event.allocation - earned }} /> : null}
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { gap: 14 },
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
