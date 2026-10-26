// R25 達成 → 完了 → 次の目標 (App `/plans/<planId>/done`, b4 A5 ②③). Restrained: an
// emoji tile and three big numbers (スコア · 話した人 · イベント; count-up, a plain
// number with 「減らす動き」), no confetti; いちばん効いたこと with its basis; the
// skipped areas on their own line. 「次の目標を決める」 opens the 次の目標 page
// (`/plans/<planId>/next`, b4 #26, PlanNextGoalScreen) — R25 review m3: just looking back
// never triggers the paid C10 call.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanAchievementView } from "../../api/contract/plan-v2";
import { planTaskSegmentHref } from "../../api/compute/plan-href";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { ConfirmDialog, CountUp, RetryCard, Skeleton, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { InlineProblem, useFailureText } from "./plan-ui";
import { dateParts } from "./plan-review-ui";
import { KitButton, KitCard, KitEmo, KitHatch, KitSampleTag, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import { FlowFoot, FootFade, PlanChatFrame } from "./plan-flow-kit";

type Load = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready"; done: PlanAchievementView };

export function PlanDoneScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const toast = useToast();
  const failureText = useFailureText();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null);
  const sequence = useRef(0);

  const read = useCallback(async () => {
    const run = (sequence.current += 1);
    const done = await api.achievement(planId);
    if (run !== sequence.current) return;
    if (!done.ok) return setLoad({ failure: done.failure, kind: "failed" });
    setLoad({ done: done.data, kind: "ready" });
  }, [api, planId]);

  /** 次の目標を決める: the 次の目標 page asks for the candidates (b4 #26). */
  const decideNext = () => router.push(`/plans/${encodeURIComponent(planId)}/next` as Href);
  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const later = () => openMainTab(router, planTaskSegmentHref("app"));
  // QA-A2: an achieved goal can be deleted too (e.g. one set by mistake); it leaves the 已完成 list.
  const deleteGoal = async () => {
    setDeleteOpen(false);
    if (deleting) return;
    setDeleting(true);
    setDeleteProblem(null);
    const result = await api.deleteGoal(planId, newIdempotencyKey("goal-delete"));
    setDeleting(false);
    if (!result.ok) return setDeleteProblem(failureText(result.failure));
    toast.success(t("plan.goals.deleted"));
    later();
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
          {/* QA-A2: with nothing recorded the page was three zeros; say why and what to do next time. */}
          {!load.done.bestMove && load.done.total === 0 && load.done.talkedPeople === 0 && load.done.events === 0 ? (
            <KitCard testID="done-empty" style={styles.empty}>
              <View style={styles.row8}>
                <KitEmo emoji="💬" tone="apricot" sm />
                <UiText style={[styles.bestTitle, styles.grow]}>{t("plan.done.emptyTitle")}</UiText>
              </View>
              <UiText style={styles.emptyText}>{t("plan.done.emptyBody")}</UiText>
            </KitCard>
          ) : null}
          {load.done.skippedAreas.length ? (
            <View style={styles.skipped} testID="skipped-areas">
              <View style={styles.sw}><KitHatch line={colors.plum300} base={colors.plum100} /></View>
              <UiText style={styles.skippedText}>{t("plan.done.skipped", { areas: load.done.skippedAreas.join(t("plan.done.separator")) })}</UiText>
            </View>
          ) : null}

          <FlowFoot>
            <View style={styles.foot} testID="next-ask">
              <FootFade />
              <KitButton xl primary label={t("plan.done.decide")} onPress={decideNext} style={styles.xl} testID="next-decide" />
              <KitButton label={t("plan.done.later")} onPress={later} style={styles.ghost} />
              {deleteProblem ? <InlineProblem text={deleteProblem} /> : null}
              <KitButton danger label={t("plan.goals.delete")} onPress={() => setDeleteOpen(true)} style={styles.ghost} testID="done-delete" />
            </View>
          </FlowFoot>
          <ConfirmDialog
            visible={deleteOpen}
            title={t("plan.goals.deleteTitle", { goal: load.done.goal })}
            message={t("plan.goals.deleteBody")}
            confirmLabel={t("plan.goals.deleteConfirm")}
            destructive
            onConfirm={() => void deleteGoal()}
            onCancel={() => setDeleteOpen(false)}
          />
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
  empty: { marginTop: 4 },
  emptyText: { color: colors.ink2, ...kitText(14, "400", 1.55), marginTop: 8 },
  grow: { flex: 1 },
  skipped: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 24, backgroundColor: colors.surface2, marginTop: 4 },
  sw: { width: 22, height: 14, borderRadius: 3, overflow: "hidden" },
  skippedText: { flex: 1, color: colors.ink2, ...kitText(12.5, "400") },
  foot: { paddingTop: 22, paddingHorizontal: 18, paddingBottom: 30, gap: 8 },
  xl: { height: 50 },
  ghost: { backgroundColor: "transparent" },
}));
