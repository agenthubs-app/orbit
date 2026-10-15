// R25 次の目標 (App `/plans/<planId>/next`, b4 #26): its own page, opened from 完了's
// 「次の目標を決める」 (so the paid C10 call still only runs after that tap, R25 review m3).
// ‹ · 次の目標 · 「これまでの記録から N案」; up to two candidates (.opt: emoji · goal · 「?」,
// subtitle, the basis under the chosen one) + 「自分で決める」; the no-deadline note; 「この目標で
// 具体化する」 starts the same generation flow as the first goal (POST …/intakes, source
// next_goal), 「自分で決める」 opens the goal input. With two active goals (or no new goals
// left this month) the choice explains the limit and is disabled — never a paid entry.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanNextGoalCandidate, PlanNextGoalsResponse, PlanQuotaResponse } from "../../api/contract/plan-v2";
import { planNewGoalHref } from "../../api/compute/plan-href";
import { PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { openMainTab } from "../../components/shell-navigation";
import { Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { FailureNote, isLimitFailure, LimitNote } from "./plan-ui";
import { KitButton, KitEmo, kitText, useKitStyles } from "./plan-kit";

const SELF = "self";
const TONES = ["teal", "blue"] as const;

export function PlanNextGoalScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const router = useRouter();
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
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
    const [goals, limits] = await Promise.all([api.nextGoals(planId), api.quota()]);
    if (run !== sequence.current) return;
    // Failing (AI off, busy) leaves only 「自分で決める」.
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
  // 选中项按目標文记（重新读取后候选顺序变了也不会指到别的目標）；不在新候选里就回到默认。
  const selected = choice !== null && (choice === SELF || candidates.some((candidate) => candidate.goalText === choice)) ? choice : candidates[0]?.goalText ?? SELF;
  const go = async () => {
    if (blocked || creating) return;
    if (selected === SELF) return openMainTab(router, planNewGoalHref("app"));
    const candidate = candidates.find((item) => item.goalText === selected);
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
  const subtitle = next ? (candidates.length ? t("plan.next.subtitle", { count: candidates.length }) : t("plan.next.subtitleNone")) : undefined;
  return (
    <AppScreen title={t("plan.done.nextTitle")} subtitle={subtitle}>
      <View style={styles.page} testID="next-goals">
        {!next ? <Skeleton lines={5} /> : (
          <>
            <UiText style={[kit.lbl, styles.note]}>{t("plan.next.note")}</UiText>
            {nextFailed ? <UiText style={[kit.lbl, styles.note]}>{t("plan.done.nextFailed")}</UiText> : null}
            <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.done.nextTitle")} style={styles.choices}>
              {candidates.map((candidate, index) => (
                <Option key={`${candidate.goalText}-${index}`} candidate={candidate} tone={TONES[index] ?? "teal"} selected={selected === candidate.goalText} disabled={blocked} onSelect={() => setChoice(candidate.goalText)} />
              ))}
              <Option candidate={null} tone="apricot" selected={selected === SELF} disabled={blocked} onSelect={() => setChoice(SELF)} />
            </View>
            {full ? <LimitNote failure={{ kind: "goalLimit" }} /> : monthlyOut ? <LimitNote failure={{ kind: "goalMonthlyLimit" }} /> : null}
            <View style={styles.flat}><UiText style={styles.flatText}>{t("plan.next.noDeadline")}</UiText></View>
            {failure ? isLimitFailure(failure) ? <LimitNote failure={failure} /> : <FailureNote failure={failure} onReload={() => void read()} /> : null}
            <KitButton primary icon="sparkle" label={t("plan.done.start")} disabled={blocked || creating} onPress={() => void go()} style={styles.start} testID="next-start" />
            <UiText style={[kit.lbl, styles.center]}>{t("plan.done.startNote")}</UiText>
          </>
        )}
      </View>
    </AppScreen>
  );
}

/** .opt（padding 14、圆角 20、2px 边，.on = plum-500）：.radio · emo sm · 目標 ·「?」/ sub / 选中时 .why-body（根拠）。 */
function Option({ candidate, tone, selected, disabled, onSelect }: { candidate: PlanNextGoalCandidate | null; tone: "teal" | "blue" | "apricot"; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const title = candidate ? candidate.goalText : t("plan.done.self");
  const sub = candidate ? candidate.subtitle ?? null : t("plan.done.selfNote");
  const basis = candidate ? candidate.basis.map((item) => item.label).join(" · ") : "";
  const [why, setWhy] = useState(false);
  const showBasis = Boolean(basis) && (selected || why);
  return (
    <UiPressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected, disabled, selected }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onSelect}
      style={[styles.opt, selected && styles.optOn, disabled && styles.disabled]}
      testID={candidate ? "next-candidate" : "next-self"}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={kit.grow}>
        <View style={styles.row8}>
          <KitEmo emoji={candidate ? PLAN_GOAL_TEMPLATES[candidate.goalKind]?.emoji ?? "🎯" : "✏️"} tone={tone} sm />
          <UiText style={[styles.optTitle, candidate ? kit.grow : null]}>{title}</UiText>
          {basis ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.next.why")} accessibilityState={{ expanded: showBasis }} hitSlop={13} onPress={() => setWhy((open) => !open)} style={kit.why}>
              <UiText style={kit.whyText}>?</UiText>
            </UiPressable>
          ) : null}
        </View>
        {sub ? <UiText style={styles.sub}>{sub}</UiText> : null}
        {showBasis ? <View style={kit.whyBody}><UiText style={kit.whyBodyText}>{t("plan.next.basis", { basis })}</UiText></View> : null}
      </View>
    </UiPressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { marginHorizontal: 2, marginTop: -12 },
  note: { marginBottom: 10, marginHorizontal: 2 },
  choices: { gap: 10 },
  opt: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: "transparent", borderRadius: 20, borderWidth: 2, flexDirection: "row", gap: 12, padding: 14 },
  optOn: { borderColor: colors.plum500 },
  radio: { borderColor: colors.ink4, borderRadius: 10, borderWidth: 2, height: 20, marginTop: 2, width: 20 },
  radioOn: { borderColor: colors.plum700, borderWidth: 6 },
  row8: { alignItems: "center", flexDirection: "row", gap: 8 },
  optTitle: { color: colors.ink, ...kitText(14, "700") },
  sub: { color: colors.ink2, ...kitText(12.5, "400"), marginTop: 6 },
  flat: { backgroundColor: colors.surface2, borderRadius: 24, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  flatText: { color: colors.ink2, ...kitText(12, "400", 1.6) },
  start: { height: 48, marginTop: 14 },
  center: { marginTop: 8, textAlign: "center" },
  disabled: { opacity: 0.45 },
}));
