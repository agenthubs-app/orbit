// R23 ② the generation flow page (App `/plans/flow/<intakeId>`: full screen, pushed
// from below, no tab bar). It reads the intake (and its draft) and shows, by status:
// the background blocks → ≤5 questions → the premise → the plan card with the AI-fix
// bar → manual edit / confirm. Only the user's own actions send requests.
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { PlanDraftView, PlanIntakeView } from "../../api/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../api/compute/plan-href";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { Button, RetryCard, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { flowStage, isKnownGoalKind, newIdempotencyKey, turnChipText } from "./plan-model";
import { PlanBackground } from "./PlanBackground";
import { PlanDraftCard, PlanFixBar, PlanTurn } from "./PlanDraft";
import { PlanPremiseCard, PlanQuestions } from "./PlanQuestions";
import { InlineProblem, isLimitFailure, LimitNote, PlanFrame, StaleNote, useFailureText, usePlanStyles } from "./plan-ui";

const STAGE_TITLES = ["plan.flow.stageBackground", "plan.flow.stageQuestions", "plan.flow.stageDraft", "plan.flow.stageFix", "plan.flow.stageManual"] as const;

type LoadState = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready" };

export function PlanFlowScreen({ intakeId }: { intakeId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const failureText = useFailureText();
  const scrollRef = useRef<ScrollView>(null);
  const turnOffsets = useRef<Record<number, number>>({});
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [intake, setIntake] = useState<PlanIntakeView | null>(null);
  const [draft, setDraft] = useState<PlanDraftView | null>(null);
  const [busy, setBusy] = useState<"draft" | "fix" | "confirm" | null>(null);
  const [failure, setFailure] = useState<{ op: "draft" | "fix" | "confirm"; failure: PlanFailure } | null>(null);
  const [fixText, setFixText] = useState("");
  const [reloading, setReloading] = useState(false);
  const sequence = useRef(0);

  const read = useCallback(async () => {
    const run = (sequence.current += 1);
    const result = await api.getIntake(intakeId);
    if (run !== sequence.current) return;
    if (!result.ok) return setLoad({ failure: result.failure, kind: "failed" });
    let nextDraft: PlanDraftView | null = null;
    if (result.data.draftId) {
      const read = await api.getDraft(result.data.draftId);
      if (run !== sequence.current) return;
      if (!read.ok) return setLoad({ failure: read.failure, kind: "failed" });
      nextDraft = read.data;
    }
    setIntake(result.data);
    setDraft(nextDraft);
    setLoad({ kind: "ready" });
  }, [api, intakeId]);

  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const reload = async () => {
    setReloading(true);
    setFailure(null);
    await read();
    setReloading(false);
  };

  const close = () => (router.canGoBack() ? router.back() : openMainTab(router, planTaskSegmentHref("app")));

  const onIntake = (next: PlanIntakeView) => {
    setIntake(next);
    if (!next.draftId) setDraft(null);
  };

  const makeDraft = async () => {
    if (!intake || busy) return;
    setBusy("draft");
    setFailure(null);
    // A retry after 「初版をつくれませんでした」 is a new attempt (new key).
    const result = await api.makeDraft(intake.intakeId, newIdempotencyKey("draft"));
    setBusy(null);
    if (!result.ok) return setFailure({ failure: result.failure, op: "draft" });
    setDraft(result.data);
    setIntake({ ...intake, draftId: result.data.draftId, status: "drafted" });
  };

  const sendFix = async () => {
    const text = fixText.trim();
    if (!draft || !text || busy) return;
    setBusy("fix");
    setFailure(null);
    const result = await api.fix(draft.draftId, text, newIdempotencyKey("fix"));
    setBusy(null);
    if (!result.ok) return setFailure({ failure: result.failure, op: "fix" });
    setDraft(result.data);
    setFixText("");
  };

  const confirm = async () => {
    if (!draft || busy) return;
    setBusy("confirm");
    setFailure(null);
    const result = await api.confirm(draft.draftId, newIdempotencyKey("confirm"));
    setBusy(null);
    if (!result.ok) return setFailure({ failure: result.failure, op: "confirm" });
    openMainTab(router, result.data.href);
  };

  const stage = intake ? flowStage(intake, draft) : 0;
  const kind = intake && isKnownGoalKind(intake.goalKind) ? intake.goalKind : null;
  const draftOpen = Boolean(draft && draft.status === "open" && intake?.status !== "planned");

  const failureView = (op: "draft" | "fix" | "confirm") => {
    if (failure?.op !== op) return null;
    const item = failure.failure;
    if (isLimitFailure(item)) return <LimitNote failure={item} />;
    if (item.kind === "stale") return <StaleNote onReload={() => void reload()} />;
    if (item.kind === "aiFailed" && op !== "confirm") {
      return (
        <RetryCard
          title={t(op === "draft" ? "plan.draft.failedTitle" : "plan.fix.failedTitle")}
          message={t(op === "draft" ? "plan.draft.failedBody" : "plan.fix.failedBody")}
          onRetry={() => void (op === "draft" ? makeDraft() : sendFix())}
        />
      );
    }
    return <InlineProblem text={failureText(item)} />;
  };

  return (
    <PlanFrame
      title={t("plan.flow.title")}
      subtitle={t(STAGE_TITLES[stage])}
      stage={stage}
      onClose={close}
      scrollRef={scrollRef}
      footer={draft && draftOpen ? (
        <PlanFixBar
          draft={draft}
          text={fixText}
          onText={setFixText}
          onSend={() => void sendFix()}
          sending={busy === "fix"}
          onManual={() => router.push(planDraftEditHref("app", draft.draftId) as Href)}
          onConfirm={() => void confirm()}
          confirming={busy === "confirm"}
        />
      ) : undefined}
    >
      {load.kind === "loading" ? <Skeleton lines={5} /> : null}
      {load.kind === "failed" ? (
        load.failure.kind === "network"
          ? <RetryCard title={t("plan.flow.offlineTitle")} onRetry={() => void reload()} retrying={reloading} />
          : <RetryCard title={fillCopy(copy.error.loadFailed, { item: t("plan.flow.title") })} message={t("plan.flow.loadFailedBody")} onRetry={() => void reload()} retrying={reloading} />
      ) : null}
      {load.kind === "ready" && intake ? (
        <>
          <UiText style={shared.body2}>{t("plan.flow.goal", { goal: intake.goal })}</UiText>
          {intake.status === "planned" ? (
            <View style={shared.card}>
              <UiText style={shared.heading}>{t("plan.flow.plannedTitle")}</UiText>
              <UiText style={shared.body2}>{t("plan.flow.plannedBody")}</UiText>
              <Button label={t("plan.confirmed.open")} onPress={() => openMainTab(router, planTaskSegmentHref("app", intake.planId))} variant="primary" />
            </View>
          ) : null}
          {intake.status === "drafting" ? (
            <View style={shared.card}>
              <UiText style={shared.body2}>{t("plan.flow.drafting")}</UiText>
              <Skeleton lines={3} />
              <UiText style={shared.label}>{t("plan.flow.reading")}</UiText>
              {intake.reading.map((item) => (
                <View key={`${item.kind}-${item.detail}`} style={shared.row}>
                  <UiText style={[shared.label, styles.readingKind]}>{t(item.kind === "profile" ? "plan.reading.profile" : item.kind === "goal" ? "plan.reading.goal" : item.kind === "network" ? "plan.reading.network" : "plan.reading.capabilities")}</UiText>
                  <UiText style={[shared.body2, shared.grow]}>{item.detail}</UiText>
                </View>
              ))}
              <Button label={t("plan.error.reload")} loading={reloading} onPress={() => void reload()} size="sm" variant="secondary" />
            </View>
          ) : null}
          {kind && intake.status === "background" ? <PlanBackground intake={intake} kind={kind} api={api} onIntake={onIntake} onReload={() => void reload()} /> : null}
          {kind && intake.status !== "background" && intake.status !== "drafting" && intake.status !== "planned" ? (
            <View style={[shared.softCard]}>
              <UiText style={shared.title}>{t("plan.flow.backgroundDone")}</UiText>
              {intake.background.purpose.value.selectedLevel ? <UiText style={shared.caption}>{t("plan.flow.purposeLevel", { level: intake.background.purpose.value.selectedLevel })}</UiText> : null}
            </View>
          ) : null}
          {kind && intake.status === "questions" ? <PlanQuestions intake={intake} kind={kind} api={api} onIntake={onIntake} onReload={() => void reload()} /> : null}
          {kind && intake.premise && (intake.status === "premise" || intake.status === "drafted") ? (
            <PlanPremiseCard
              intake={intake}
              kind={kind}
              api={api}
              onIntake={onIntake}
              onReload={() => void reload()}
              hasDraft={Boolean(draft)}
              draftAction={draft ? null : (
                <View style={styles.draftAction}>
                  {failureView("draft")}
                  <Button block label={t("plan.premise.makeDraft")} loading={busy === "draft"} onPress={() => void makeDraft()} variant="primary" />
                  <UiText style={[shared.caption, styles.center]}>{busy === "draft" ? t("plan.premise.making") : t("plan.premise.makeNote")}</UiText>
                </View>
              )}
            />
          ) : null}
          {draft ? (
            <>
              <PlanDraftCard draft={draft} />
              {draft.turns.map((turn) => (
                <View key={turn.n} onLayout={(event) => { turnOffsets.current[turn.n] = event.nativeEvent.layout.y; }}>
                  <PlanTurn turn={turn} limit={draft.aiFixLimit} />
                </View>
              ))}
              {busy === "fix" ? <UiText style={shared.caption}>{t("plan.fix.sending")}</UiText> : null}
              {failureView("fix")}
              {failureView("confirm")}
              {draft.fix.state === "fallback" && draft.fix.limit ? <LimitNote failure={{ kind: "aiLimit", limit: draft.fix.limit, retryOn: draft.fix.retryOn ?? null }} /> : null}
              {draft.turns.length ? (
                <View style={shared.softCard}>
                  {draft.aiFixUsed >= draft.aiFixLimit ? <UiText style={shared.title}>{t("plan.fix.allUsed")}</UiText> : null}
                  {draft.aiFixUsed >= draft.aiFixLimit ? <UiText style={shared.body2}>{t("plan.fix.allUsedBody")}</UiText> : null}
                  <View style={shared.wrap}>
                    {draft.turns.map((turn) => (
                      <UiPressable key={turn.n} accessibilityRole="button" onPress={() => scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, (turnOffsets.current[turn.n] ?? 0) - 8) })} style={styles.historyChip}>
                        <UiText numberOfLines={1} style={styles.historyText}>{t("plan.turn.chip", { n: turn.n, text: turn.changes.length === 0 || turn.noChangeReason ? t("plan.turn.noChangeChip") : turnChipText(turn.input) })}</UiText>
                      </UiPressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </PlanFrame>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  readingKind: { width: 72 },
  draftAction: { gap: 8 },
  center: { textAlign: "center" },
  historyChip: { minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  historyText: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
}));
