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
import { presentConfirm } from "../../components/ui/feedback-requests";
import { Icon, RetryCard, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { flowStage, isKnownGoalKind, newIdempotencyKey, turnChipText } from "./plan-model";
import { PlanBackground } from "./PlanBackground";
import { DraftActions, DraftUsedUp, PlanDraftCard, PlanFixBar, PlanTurn } from "./PlanDraft";
import { PlanDraftV3 } from "./PlanDraftV3";
import { adjustmentsOf, draftAdjustStateOf, isDraftV3, type DraftAdjustState } from "./plan-draft-v3-model";
import { PlanPremiseCard, PlanQuestions } from "./PlanQuestions";
import { FailureNote, LimitNote, usePlanStyles } from "./plan-ui";
import { KitButton, KitChip, kitText, useKitStyles } from "./plan-kit";
import { BlockNumber, Bubble, ChatScrollTarget, FlowFoot, FootButton, PlanChatFrame } from "./plan-flow-kit";

const STAGE_TITLES = ["plan.flow.stageBackground", "plan.flow.stageQuestions", "plan.flow.stageDraft", "plan.flow.stageFix", "plan.flow.stageManual"] as const;

type LoadState = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready" };

export function PlanFlowScreen({ intakeId }: { intakeId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const scrollRef = useRef<ScrollView>(null);
  const turnOffsets = useRef<Record<number, number>>({});
  // QA-A: after an AI revision, bring its card into view once it is laid out (the page used to stay put or jump up).
  const revealTurn = useRef<number | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [intake, setIntake] = useState<PlanIntakeView | null>(null);
  const [draft, setDraft] = useState<PlanDraftView | null>(null);
  const [busy, setBusy] = useState<"draft" | "fix" | "redraft" | "confirm" | null>(null);
  const [failure, setFailure] = useState<{ op: "draft" | "fix" | "redraft" | "confirm"; failure: PlanFailure } | null>(null);
  const [fixText, setFixText] = useState("");
  const [reloading, setReloading] = useState(false);
  // R36b: the v3 draft page's local adjustments (people / points / dropped types; D-1: not a manual edit) and
  // whether its AI-fix composer is open. Reset whenever the draft (or its revision) changes.
  const [adjust, setAdjust] = useState<{ revision: string; state: DraftAdjustState } | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
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
    revealTurn.current = result.data.turns[result.data.turns.length - 1]?.n ?? null;
    setDraft(result.data);
    setFixText("");
  };

  // R36b: 「重新起草」spends one AI fix (shared with 「让 AI 改」); a new draft text makes the local adjustments
  // meaningless, so when any exist the user confirms first. A failed attempt costs nothing (the server says so).
  const redraft = async () => {
    if (!draft || busy) return;
    const pending = isDraftV3(draft.content) && adjust?.revision === draft.revision ? adjustmentsOf(draft.content, adjust.state, draft.revision) : null;
    if (pending) {
      const go = await presentConfirm({ cancelLabel: copy.action.cancel, confirmLabel: t("plan.v3.redraft"), message: t("plan.v3.redraftConfirmBody"), title: t("plan.v3.redraftConfirmTitle") });
      if (!go) return;
    }
    setBusy("redraft");
    setFailure(null);
    const result = await api.redraft(draft.draftId, newIdempotencyKey("redraft"));
    setBusy(null);
    if (!result.ok) return setFailure({ failure: result.failure, op: "redraft" });
    setAdjust(null);
    setFixOpen(false);
    setDraft(result.data);
  };

  const confirm = async () => {
    if (!draft || busy) return;
    setBusy("confirm");
    setFailure(null);
    const adjustments = isDraftV3(draft.content) && adjust?.revision === draft.revision ? adjustmentsOf(draft.content, adjust.state, draft.revision) : null;
    const result = await api.confirm(draft.draftId, newIdempotencyKey("confirm"), adjustments ?? undefined);
    setBusy(null);
    if (!result.ok) return setFailure({ failure: result.failure, op: "confirm" });
    openMainTab(router, result.data.href);
  };

  const stage = intake ? flowStage(intake, draft) : 0;
  const kind = intake && isKnownGoalKind(intake.goalKind) ? intake.goalKind : null;
  const draftOpen = Boolean(draft && draft.status === "open" && intake?.status !== "planned");
  // R36b: a v3 draft that is still open renders the design's draft page as the whole body (REPORT 自定决定 A).
  const v3 = draft && draftOpen && isDraftV3(draft.content) ? draft.content : null;
  const adjustState = draft && adjust?.revision === draft.revision ? adjust.state : draft ? draftAdjustStateOf(draft.content) : null;
  const onAdjust = (state: DraftAdjustState) => draft && setAdjust({ revision: draft.revision, state });

  const failureView = (op: "draft" | "fix" | "redraft" | "confirm") => {
    if (failure?.op !== op) return null;
    const item = failure.failure;
    if (item.kind === "aiFailed" && op !== "confirm") {
      return (
        <RetryCard
          title={t(op === "draft" ? "plan.draft.failedTitle" : op === "redraft" ? "plan.v3.redraftFailedTitle" : "plan.fix.failedTitle")}
          message={t(op === "draft" ? "plan.draft.failedBody" : "plan.fix.failedBody")}
          onRetry={() => void (op === "draft" ? makeDraft() : op === "redraft" ? redraft() : sendFix())}
        />
      );
    }
    return <FailureNote failure={item} onReload={() => void reload()} />;
  };


  const subtitle = intake?.status === "planned" ? t("plan.flow.title") : t("plan.flow.subtitle", { stage: t(STAGE_TITLES[stage]) });
  const footFix = draft && draftOpen && (!v3 || fixOpen) ? <PlanFixBar draft={draft} text={fixText} onText={setFixText} onSend={() => void sendFix()} sending={busy === "fix"} /> : null;

  return (
    <PlanChatFrame
      subtitle={subtitle}
      stage={v3 ? null : intake?.status === "planned" ? 5 : stage}
      onClose={close}
      onMenu={() => openMainTab(router, "/ai")}
      scrollRef={scrollRef}
    >
      {load.kind === "loading" ? <Skeleton lines={5} /> : null}
      {load.kind === "failed" ? (
        load.failure.kind === "network"
          ? <RetryCard title={t("plan.flow.offlineTitle")} onRetry={() => void reload()} retrying={reloading} />
          : <RetryCard title={fillCopy(copy.error.loadFailed, { item: t("plan.flow.title") })} message={t("plan.flow.loadFailedBody")} onRetry={() => void reload()} retrying={reloading} />
      ) : null}
      {load.kind === "ready" && intake ? (
        <>
          {v3 ? null : <Bubble me>{t("plan.flow.goal", { goal: intake.goal })}</Bubble>}
          {intake.status === "planned" ? <PlannedCards intake={intake} draft={draft} onOpen={() => openMainTab(router, planTaskSegmentHref("app", intake.planId))} /> : null}
          {intake.status === "drafting" ? <DraftingCards intake={intake} reloading={reloading} onReload={() => void reload()} /> : null}
          {kind && intake.status === "background" ? <PlanBackground intake={intake} kind={kind} api={api} onIntake={onIntake} onReload={() => void reload()} /> : null}
          {kind && !v3 && intake.status !== "background" && intake.status !== "drafting" && intake.status !== "planned" ? (
            <View style={styles.okCard} testID="flow-background-done">
              <View pointerEvents="none" style={styles.okBorder} />
              <View style={styles.row8}>
                <View style={styles.okmark}><Icon name="check" size={16} color={colors.surface} /></View>
                <UiText style={styles.okTitle}>{t("plan.flow.backgroundDone")}</UiText>
                
              </View>
            </View>
          ) : null}
          {kind && intake.status === "questions" ? <PlanQuestions intake={intake} kind={kind} api={api} onIntake={onIntake} onReload={() => void reload()} /> : null}
          {kind && !v3 && intake.premise && (intake.status === "premise" || intake.status === "drafted") ? (
            <PlanPremiseCard
              intake={intake}
              kind={kind}
              api={api}
              onIntake={onIntake}
              onReload={() => void reload()}
              hasDraft={Boolean(draft)}
              hasRevisions={Boolean(draft && draft.turns.length > 0)}
              draftAction={draft ? null : (
                <View style={styles.draftAction}>
                  {failureView("draft")}
                  <KitButton primary icon="sparkle" label={t("plan.premise.makeDraft")} disabled={busy === "draft"} onPress={() => void makeDraft()} style={styles.makeDraft} testID="flow-make-draft" />
                  <UiText style={[kit.lbl, styles.center]}>{busy === "draft" ? t("plan.premise.making") : t("plan.premise.makeNote")}</UiText>
                </View>
              )}
            />
          ) : null}
          {draft && intake.status !== "planned" ? (
            <>
              {(() => {
                const usedUp = draft.aiFixUsed >= draft.aiFixLimit;
                const actions = () => draftOpen && !usedUp
                  ? <DraftActions draft={draft} onManual={() => router.push(planDraftEditHref("app", draft.draftId) as Href)} onConfirm={() => void confirm()} confirming={busy === "confirm"} />
                  : undefined;
                const last = draft.turns.length - 1;
                return (
                  <>
                    {v3 && adjustState ? (
                      <PlanDraftV3
                        draft={draft}
                        content={v3}
                        state={adjustState}
                        onState={onAdjust}
                        aiFixLeft={Math.max(0, draft.aiFixLimit - draft.aiFixUsed)}
                        aiFixOpen={fixOpen}
                        onAiFix={() => setFixOpen((value) => !value)}
                        onConfirm={() => void confirm()}
                        confirming={busy === "confirm"}
                        onRedraft={() => void redraft()}
                        redraftEnabled={draft.aiFixUsed < draft.aiFixLimit && draft.manualEditAvailable && busy === null}
                        redrafting={busy === "redraft"}
                      />
                    ) : (
                      <>
                        {!draft.turns.length ? <Bubble>{t("plan.draft.bubble")}</Bubble> : null}
                        <ChatScrollTarget active={draft.turns.length > 0}>
                          <PlanDraftCard draft={draft} clamp={draft.turns.length > 0} footer={draft.turns.length ? undefined : actions()} />
                        </ChatScrollTarget>
                      </>
                    )}
                    {draft.turns.map((turn, index) => (
                      <View key={turn.n} style={styles.turn} onLayout={(event) => {
                        const y = event.nativeEvent.layout.y;
                        turnOffsets.current[turn.n] = y;
                        if (revealTurn.current === turn.n) { revealTurn.current = null; setTimeout(() => scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, y - 8) }), 250); }
                      }}>
                        <PlanTurn turn={turn} limit={draft.aiFixLimit} footer={index === last && !v3 ? actions() : undefined} mark={index === last} />
                      </View>
                    ))}
                    {busy === "fix" ? <UiText style={kit.lbl}>{t("plan.fix.sending")}</UiText> : null}
                    {busy === "redraft" ? <UiText style={kit.lbl} testID="draft-v3-redrafting">{t("plan.premise.making")}</UiText> : null}
                    {failureView("fix")}
                    {failureView("redraft")}
                    {failureView("confirm")}
                    {draft.fix.state === "fallback" && draft.fix.limit ? <LimitNote failure={{ kind: "aiLimit", limit: draft.fix.limit, retryOn: draft.fix.retryOn ?? null }} /> : null}
                    {usedUp && draftOpen && !v3 ? <DraftUsedUp draft={draft} onManual={() => router.push(planDraftEditHref("app", draft.draftId) as Href)} onConfirm={() => void confirm()} confirming={busy === "confirm"} onTurn={(n) => scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, (turnOffsets.current[n] ?? 0) - 8) })} /> : null}
                  </>
                );
              })()}
              {footFix ? <FlowFoot>{footFix}</FlowFoot> : null}
            </>
          ) : null}
        </>
      ) : null}
    </PlanChatFrame>
  );
}

/** b10 ② 下書き中：AI 一言 + 三块骨架（.bsk）+ 「読んでいるもの」（.known）+ 底部「下書き中…」。 */
function DraftingCards({ intake, reloading, onReload }: { intake: PlanIntakeView; reloading: boolean; onReload: () => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const blocks = [["plan.block.me", [0.8, 0.46]], ["plan.block.team", [0.62, 0.54]], ["plan.block.purpose", [0.7, 0.38]]] as const;
  return (
    <>
      <Bubble>{t("plan.flow.draftingBubble")}</Bubble>
      <View style={styles.draftCard} testID="flow-drafting">
        {blocks.map(([key, widths], index) => (
          <View key={key} style={[styles.bsk, index > 0 && styles.line]}>
            <BlockNumber n={index + 1} state="draft" />
            <UiText style={styles.bskTitle}>{t(key)}</UiText>
            <View style={styles.bskLines}>{widths.map((width) => <View key={width} style={[styles.shimmer, { width: `${width * 100}%` }]} />)}</View>
          </View>
        ))}
      </View>
      <View style={styles.flat}>
        <UiText style={styles.knownTitle}>{t("plan.flow.reading")}</UiText>
        {intake.reading.map((item, index) => (
          <View key={`${item.kind}-${item.detail}`} style={[styles.known, index > 0 && styles.line]}>
            <UiText style={[kit.lbl, styles.knownLabel]}>{t(item.kind === "profile" ? "plan.reading.profile" : item.kind === "goal" ? "plan.reading.goal" : item.kind === "network" ? "plan.reading.network" : "plan.reading.capabilities")}</UiText>
            <UiText style={styles.knownValue}>{item.detail}</UiText>
          </View>
        ))}
      </View>
      <FlowFoot><FootButton primary={false} disabled={reloading} label={t("plan.flow.draftingFoot")} onPress={onReload} testID="flow-drafting-reload" /></FlowFoot>
    </>
  );
}

/** b12 A-R23-20a 確定済み intake：ok-card（✓ · 確定済み · プランを見る）+ 「この会話の記録」。 */
function PlannedCards({ intake, draft, onOpen }: { intake: PlanIntakeView; draft: PlanDraftView | null; onOpen: () => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const level = intake.background.purpose.value.selectedLevel;
  const history = [
    level ? t("plan.flow.historyBackground", { level }) : t("plan.flow.historyBackgroundNone"),
    t("plan.flow.historyQuestions", { count: intake.questions?.length ?? 0 }),
    draft ? t("plan.flow.historyFix", { count: draft.aiFixUsed }) : null,
    draft && !draft.manualEditAvailable ? t("plan.flow.historyManual", { count: 1 }) : null,
  ].filter((item): item is string => Boolean(item));
  return (
    <>
      <View style={[styles.okCard, styles.okCardPlanned]} testID="flow-planned">
        <View pointerEvents="none" style={styles.okBorder} />
        <View style={styles.row10}>
          <View style={styles.okmark}><Icon name="check" size={16} color={colors.surface} /></View>
          <View style={styles.grow}>
            <UiText style={styles.okTitle14}>{t("plan.flow.plannedTitle")}</UiText>
            <UiText style={kit.lbl}>{t("plan.flow.plannedBody")}</UiText>
          </View>
        </View>
        <KitButton primary label={t("plan.flow.plannedOpen")} icon="right" onPress={onOpen} style={styles.plannedOpen} testID="flow-planned-open" />
      </View>
      <View style={[styles.flat, styles.historyCard]}>
        <UiText style={[kit.lbl, styles.historyTitle]}>{t("plan.flow.historyTitle")}</UiText>
        <View style={styles.hist}>{history.map((item) => <KitChip key={item} label={item} />)}</View>
      </View>
    </>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  turn: { gap: 10 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  row10: { flexDirection: "row", alignItems: "center", gap: 10 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  draftAction: { gap: 6, marginTop: 10 },
  makeDraft: { alignSelf: "stretch" },
  center: { textAlign: "center" },
  okCard: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.surface },
  // kit：border 1.5 color-mix(ok 45%, transparent)——叠一层 ok 色边框、不透明度 .45（不写 rgba）。
  okBorder: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 20, borderWidth: 1.5, borderColor: colors.ok, opacity: 0.45 },
  okCardPlanned: { paddingVertical: 14, paddingHorizontal: 16 },
  okmark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ok, alignItems: "center", justifyContent: "center" },
  okTitle: { flex: 1, color: colors.ink, ...kitText(12.5, "700") },
  okTitle14: { color: colors.ink, ...kitText(14, "700") },
  plannedOpen: { marginTop: 12, alignSelf: "stretch", flexDirection: "row-reverse" },
  draftCard: { backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16 },
  bsk: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  bskTitle: { width: 48, color: colors.ink, ...kitText(13, "700") },
  bskLines: { flex: 1, gap: 5 },
  shimmer: { height: 9, borderRadius: 8, backgroundColor: colors.surface2 },
  flat: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16 },
  knownTitle: { color: colors.ink, ...kitText(12, "800"), marginBottom: 6 },
  known: { flexDirection: "row", gap: 8, paddingVertical: 7 },
  knownLabel: { width: 74, paddingTop: 2, lineHeight: 18, transform: [{ translateY: -4 }] },
  knownValue: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(12, "400") },
  historyCard: { paddingHorizontal: 14 },
  historyTitle: { marginBottom: 6 },
  hist: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  historyChip: { minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  historyText: { color: colors.ink2, fontSize: 14, fontWeight: "700" },
}));
