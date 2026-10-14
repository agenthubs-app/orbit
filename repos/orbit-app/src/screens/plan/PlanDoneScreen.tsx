// R25 達成 → 完了 → 次の目標 (App `/plans/<planId>/done`, b4 A5 ②③). Restrained: an
// emoji tile and three big numbers (スコア · 話した人 · イベント; count-up, a plain
// number with 「減らす動き」), no confetti; いちばん効いたこと with its basis; the
// skipped areas on their own line. 次の目標: only after 「次の目標を決める」 (R25 review
// m3: just looking back never triggers the paid C10 call) — up to two candidates from GET
// …/next-goals (single choice, basis under the chosen one) + 「自分で決める」; a
// candidate starts the same generation flow as the first goal (POST …/intakes with
// source next_goal), 「自分で決める」 opens the goal input. With two active goals the
// choice explains the limit and is disabled — never a paid entry.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanAchievementView, PlanNextGoalCandidate, PlanNextGoalsResponse, PlanQuotaResponse } from "../../api/contract/plan-v2";
import { planNewGoalHref, planTaskSegmentHref } from "../../api/compute/plan-href";
import { PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { Button, Chip, CountUp, Radio, RetryCard, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { goalKindLabel, newIdempotencyKey } from "./plan-model";
import { dateParts } from "./plan-review-ui";
import { FailureNote, isLimitFailure, LimitNote, usePlanStyles } from "./plan-ui";
import { KitButton, KitCard, KitEmo, KitHatch, KitSampleTag, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import { FlowFoot, FootFade, PlanChatFrame } from "./plan-flow-kit";

type Load = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready"; done: PlanAchievementView };
const SELF = "self";

export function PlanDoneScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [next, setNext] = useState<PlanNextGoalsResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [nextFailed, setNextFailed] = useState(false);
  const [quota, setQuota] = useState<PlanQuotaResponse | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const sequence = useRef(0);

  const read = useCallback(async () => {
    const run = (sequence.current += 1);
    const [done, limits] = await Promise.all([api.achievement(planId), api.quota()]);
    if (run !== sequence.current) return;
    if (!done.ok) return setLoad({ failure: done.failure, kind: "failed" });
    setLoad({ done: done.data, kind: "ready" });
    setQuota(limits.ok ? limits.data : null);
  }, [api, planId]);

  /** 次の目標を決める: asks for the candidates once; failing (AI off, busy) leaves only 「自分で決める」. */
  const decideNext = async () => {
    if (asking || next) return;
    setAsking(true);
    const goals = await api.nextGoals(planId);
    setAsking(false);
    setNext(goals.ok ? goals.data : { candidates: [], source: "none" });
    setNextFailed(!goals.ok);
  };

  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const candidates = (next?.candidates ?? []).slice(0, 2);
  const full = Boolean(quota && quota.activeGoals >= quota.activeGoalLimit);
  const monthlyOut = Boolean(quota && quota.newGoalsLeftThisMonth <= 0);
  const blocked = full || monthlyOut;
  const selected = choice ?? (candidates.length ? "0" : SELF);
  const later = () => openMainTab(router, planTaskSegmentHref("app"));

  const go = async () => {
    if (blocked || creating) return;
    if (selected === SELF) return openMainTab(router, planNewGoalHref("app"));
    const candidate = candidates[Number(selected)];
    if (!candidate) return;
    const fingerprint = JSON.stringify([candidate.goalText, candidate.goalKind]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey("intake-next") };
    setCreating(true);
    setFailure(null);
    const result = await api.createIntake({ goalKind: candidate.goalKind, goalText: candidate.goalText, idempotencyKey: attempt.current.key, source: "next_goal" });
    setCreating(false);
    if (result.ok) {
      attempt.current = null;
      router.push(result.data.href as Href);
      return;
    }
    if (result.failure.kind !== "network") attempt.current = null;
    setFailure(result.failure);
  };

  return (
    <PlanChatFrame title={t("plan.done.title")} stage={null} onClose={later}>
      {load.kind === "loading" ? <Skeleton lines={6} /> : null}
      {load.kind === "failed" ? (
        <RetryCard
          title={load.failure.kind === "network" ? t("plan.flow.offlineTitle") : fillCopy(copy.error.loadFailed, { item: t("plan.done.title") })}
          {...(load.failure.kind === "network" ? {} : { message: t("plan.flow.loadFailedBody") })}
          onRetry={() => void read()}
        />
      ) : null}
      {load.kind === "ready" ? (
        <>
          <View style={styles.hero} testID="done-hero">
            {load.done.sample ? <KitSampleTag style={styles.sample} /> : null}
            <View style={styles.tile}><UiText style={styles.tileEmoji}>🏁</UiText></View>
            <UiText accessibilityRole="header" style={styles.heroTitle}>{t("plan.done.achieved", { goal: heroGoal(load.done.goal) })}</UiText>
            <UiText style={styles.heroSub}>{load.done.startsOn ? t("plan.done.dateRange", { end: shortDay(load.done.achievedAt, language), start: longDay(load.done.startsOn, language) }) : t("plan.done.date", dateParts(load.done.achievedAt))}</UiText>
          </View>
          <View style={styles.numbers} testID="done-numbers">
            <BigNumber label={t("plan.done.score")} value={load.done.total} />
            <BigNumber label={t("plan.done.talked")} value={load.done.talkedPeople} />
            <BigNumber label={t("plan.done.events")} value={load.done.events} />
          </View>
          {load.done.bestMove ? <BestMove move={load.done.bestMove} /> : null}
          {load.done.skippedAreas.length ? (
            <View style={styles.skipped} testID="skipped-areas">
              <View style={styles.sw}><KitHatch line={colors.plum300} base={colors.plum100} /></View>
              <UiText style={styles.skippedText}>{t("plan.done.skipped", { areas: load.done.skippedAreas.join(t("plan.done.separator")) })}</UiText>
            </View>
          ) : null}

          {next ? (
            <View style={shared.card} testID="next-goals">
              <UiText accessibilityRole="header" style={shared.heading}>{t("plan.done.nextTitle")}</UiText>
              <UiText style={shared.caption}>{candidates.length ? t("plan.done.nextNote", { count: candidates.length }) : t("plan.done.nextNoteNone")}</UiText>
              {nextFailed ? <UiText style={shared.caption}>{t("plan.done.nextFailed")}</UiText> : null}
              <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.done.nextTitle")} style={styles.choices}>
                {candidates.map((candidate, index) => (
                  <CandidateCard key={`${candidate.goalText}-${index}`} candidate={candidate} language={language} selected={selected === String(index)} disabled={blocked} onSelect={() => setChoice(String(index))} />
                ))}
                <UiPressable
                  accessibilityRole="radio"
                  accessibilityLabel={t("plan.done.self")}
                  accessibilityState={{ checked: selected === SELF, disabled: blocked, selected: selected === SELF }}
                  aria-checked={selected === SELF}
                  disabled={blocked}
                  onPress={() => setChoice(SELF)}
                  style={[styles.choice, selected === SELF && styles.choiceOn, blocked && styles.disabled]}
                  testID="next-self"
                >
                  <View style={shared.row}>
                    <UiText style={shared.emoji}>✏️</UiText>
                    <View style={shared.grow}>
                      <UiText style={shared.title}>{t("plan.done.self")}</UiText>
                      <UiText style={shared.caption}>{t("plan.done.selfNote")}</UiText>
                    </View>
                    <Radio selected={selected === SELF} onSelect={() => !blocked && setChoice(SELF)} accessibilityLabel={t("plan.done.self")} />
                  </View>
                </UiPressable>
              </View>
              {full ? <LimitNote failure={{ kind: "goalLimit" }} /> : monthlyOut ? <LimitNote failure={{ kind: "goalMonthlyLimit" }} /> : null}
              <UiText style={shared.caption}>{t("plan.done.noDeadline")}</UiText>
              {failure ? isLimitFailure(failure) ? <LimitNote failure={failure} /> : <FailureNote failure={failure} onReload={() => void read()} /> : null}
              <Button block disabled={blocked} label={t("plan.done.start")} loading={creating} onPress={() => void go()} variant="primary" />
              <UiText style={[shared.caption, styles.center]}>{t("plan.done.startNote")}</UiText>
              <Button block label={t("plan.done.later")} onPress={later} variant="ghost" />
            </View>
          ) : (
            <FlowFoot>
              <View style={styles.foot} testID="next-ask">
                <FootFade />
                <KitButton xl primary label={t("plan.done.decide")} disabled={asking} onPress={() => void decideNext()} style={styles.xl} testID="next-decide" />
                <KitButton label={t("plan.done.later")} onPress={later} style={styles.ghost} />
              </View>
            </FlowFoot>
          )}
        </>
      ) : null}
    </PlanChatFrame>
  );
}

function BigNumber({ label, value }: { label: string; value: number }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  return (
    <View accessibilityLabel={`${label} ${value}`} style={styles.number}>
      <UiText style={kit.lbl}>{label}</UiText>
      <CountUp value={value} style={styles.numberValue} />
    </View>
  );
}

/** いちばん効いたこと（b4 #25 .k-achbest）：✨ · 题 · 「?」（根拠）+ 一句。 */
function BestMove({ move }: { move: NonNullable<PlanAchievementView["bestMove"]> }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const why = useKitWhy(move.basis.map((item) => item.label).join(" · ") || null);
  return (
    <KitCard testID="best-move" style={styles.best}>
      <View style={styles.row8}>
        <KitEmo emoji="✨" tone="lav" sm />
        <UiText style={[styles.bestTitle, kit.grow]}>{t("plan.done.bestMove")}</UiText>
        {why.button}
      </View>
      <UiText style={styles.bestText}>{move.text}</UiText>
      {why.body}
    </KitCard>
  );
}

function longDay(day: string, language: string): string {
  const date = new Date(`${day}T00:00:00+09:00`);
  return date.toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: "long", timeZone: "Asia/Tokyo", year: "numeric" });
}

function shortDay(iso: string, language: string): string {
  return new Date(iso).toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: "long", timeZone: "Asia/Tokyo" });
}

function CandidateCard({ candidate, language, selected, disabled, onSelect }: { candidate: PlanNextGoalCandidate; language: "ja" | "zh" | "en"; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const kind = goalKindLabel(candidate.goalKind, language);
  const basis = candidate.basis.map((item) => item.label).join("\n");
  return (
    <UiPressable
      accessibilityRole="radio"
      accessibilityLabel={candidate.goalText}
      accessibilityState={{ checked: selected, disabled, selected }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onSelect}
      style={[styles.choice, selected && styles.choiceOn, disabled && styles.disabled]}
      testID="next-candidate"
    >
      <View style={shared.row}>
        <UiText style={shared.emoji}>{PLAN_GOAL_TEMPLATES[candidate.goalKind]?.emoji ?? "🎯"}</UiText>
        <View style={shared.grow}>
          <UiText style={shared.title}>{candidate.goalText}</UiText>
          {kind ? <Chip label={kind} tone="lav" /> : null}
        </View>
        <Radio selected={selected} onSelect={() => !disabled && onSelect()} accessibilityLabel={candidate.goalText} />
      </View>
      {selected && basis ? <UiText style={shared.caption}>{basis}</UiText> : null}
    </UiPressable>
  );
}

/** 完了の見出し：目標の末尾に「（…）」があればその前で改行する（b4 #25 の 2 行の切り方、Chrome の折り返し任せにしない）。 */
function heroGoal(goal: string): string {
  const at = goal.lastIndexOf("（");
  return at > 0 && goal.endsWith("）") ? `${goal.slice(0, at)}\n${goal.slice(at)}` : goal;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  hero: { alignItems: "center", marginTop: 16 },
  sample: { position: "absolute", right: 0, top: 0 },
  tile: { width: 96, height: 96, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.macTeal },
  tileEmoji: { fontSize: 46, lineHeight: 69 },
  heroTitle: { color: colors.ink, ...kitText(23, "900", 1.35), textAlign: "center", marginTop: 16 },
  heroSub: { color: colors.ink2, ...kitText(12.5, "400"), textAlign: "center" },
  numbers: { flexDirection: "row", gap: 8, marginTop: 10 },
  number: { flex: 1, backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 6, alignItems: "center" },
  numberValue: { ...kitText(22, "800", 1.5, -0.01) },
  // kit：.grid3 之后紧接 .card（只有 card + card 才隔 14），抵掉 chat 的 gap 10。
  best: { marginTop: -10 },
  bestTitle: { color: colors.ink, ...kitText(13.5, "700") },
  bestText: { color: colors.ink, ...kitText(14, "700", 1.55), marginTop: 8 },
  skipped: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 24, backgroundColor: colors.surface2, marginTop: 4 },
  sw: { width: 22, height: 14, borderRadius: 3, overflow: "hidden" },
  skippedText: { flex: 1, color: colors.ink2, ...kitText(12.5, "400") },
  foot: { paddingTop: 22, paddingHorizontal: 18, paddingBottom: 30, gap: 8 },
  xl: { height: 50 },
  ghost: { backgroundColor: "transparent" },
  choices: { gap: 8 },
  choice: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: 12, gap: 6, backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.45 },
  center: { textAlign: "center" },
}));
