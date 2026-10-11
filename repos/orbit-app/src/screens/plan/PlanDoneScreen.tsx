// R25 達成 → 完了 → 次の目標 (App `/plans/<planId>/done`, b4 A5 ②③). Restrained: an
// emoji tile and three big numbers (スコア · 話した人 · イベント; count-up, a plain
// number with 「減らす動き」), no confetti; いちばん効いたこと with its basis; the
// skipped areas on their own line. 次の目標: up to two candidates from GET
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
import { Button, Chip, CountUp, Radio, RetryCard, SampleTag, Skeleton, UiPressable, UiText, WhyDisclosure } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { goalKindLabel, newIdempotencyKey } from "./plan-model";
import { dateParts } from "./plan-review-ui";
import { FailureNote, isLimitFailure, LimitNote, PlanFrame, usePlanStyles } from "./plan-ui";

type Load = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready"; done: PlanAchievementView };
const SELF = "self";

export function PlanDoneScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [next, setNext] = useState<PlanNextGoalsResponse | null>(null);
  const [nextFailed, setNextFailed] = useState(false);
  const [quota, setQuota] = useState<PlanQuotaResponse | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const sequence = useRef(0);

  const read = useCallback(async () => {
    const run = (sequence.current += 1);
    const [done, goals, limits] = await Promise.all([api.achievement(planId), api.nextGoals(planId), api.quota()]);
    if (run !== sequence.current) return;
    if (!done.ok) return setLoad({ failure: done.failure, kind: "failed" });
    setLoad({ done: done.data, kind: "ready" });
    // Candidates failing (AI off, busy) leave only 「自分で決める」.
    setNext(goals.ok ? goals.data : { candidates: [], source: "none" });
    setNextFailed(!goals.ok);
    setQuota(limits.ok ? limits.data : null);
  }, [api, planId]);

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
    <PlanFrame title={t("plan.done.title")} stage={null} onClose={later}>
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
          <View style={[shared.card, styles.hero]} testID="done-hero">
            {load.done.sample ? <View style={styles.sample}><SampleTag /></View> : null}
            <View style={styles.tile}><UiText style={styles.tileEmoji}>🏁</UiText></View>
            <UiText accessibilityRole="header" style={styles.heroTitle}>{t("plan.done.achieved", { goal: load.done.goal })}</UiText>
            <UiText style={shared.caption}>{t("plan.done.date", dateParts(load.done.achievedAt))}</UiText>
            <View style={styles.numbers}>
              <BigNumber label={t("plan.done.score")} value={load.done.total} />
              <BigNumber label={t("plan.done.talked")} value={load.done.talkedPeople} />
              <BigNumber label={t("plan.done.events")} value={load.done.events} />
            </View>
            <UiText style={shared.caption}>{t("plan.done.frozen", { total: load.done.total })}</UiText>
          </View>
          {load.done.bestMove ? (
            <View style={shared.card} testID="best-move">
              <View style={shared.row}>
                <UiText style={shared.emoji}>✨</UiText>
                <UiText style={[shared.label, shared.grow]}>{t("plan.done.bestMove")}</UiText>
                {load.done.bestMove.basis.length ? <WhyDisclosure reason={load.done.bestMove.basis.map((item) => item.label).join("\n")} /> : null}
              </View>
              <UiText style={shared.title}>{load.done.bestMove.text}</UiText>
            </View>
          ) : null}
          {load.done.skippedAreas.length ? (
            <View style={[shared.softCard, styles.skipped]} testID="skipped-areas">
              <UiText style={shared.body2}>{t("plan.done.skipped", { areas: load.done.skippedAreas.join(t("plan.done.separator")) })}</UiText>
            </View>
          ) : null}

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
        </>
      ) : null}
    </PlanFrame>
  );
}

function BigNumber({ label, value }: { label: string; value: number }) {
  const { styles } = useStyles();
  return (
    <View accessibilityLabel={`${label} ${value}`} style={styles.number}>
      <UiText style={styles.numberLabel}>{label}</UiText>
      <CountUp value={value} style={styles.numberValue} />
    </View>
  );
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  hero: { alignItems: "center" },
  sample: { alignSelf: "flex-end" },
  tile: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  tileEmoji: { fontSize: 28, lineHeight: 34 },
  heroTitle: { color: colors.ink, fontSize: 18, lineHeight: 26, fontWeight: "800", textAlign: "center" },
  numbers: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  number: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", gap: 2 },
  numberLabel: { color: colors.ink3Text, fontSize: 11.5, fontWeight: "700" },
  numberValue: { fontSize: 26, lineHeight: 32 },
  skipped: { borderLeftWidth: 4, borderLeftColor: colors.plum300 },
  choices: { gap: 8 },
  choice: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: 12, gap: 6, backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.45 },
  center: { textAlign: "center" },
}));
