// R24 人物タイプ詳細 (App `plans/[planId]/types/[itemId]`, b10 ⑧, b4 A1–A2, UI-SPEC).
// 像素返工（RD-16）：照 b4 #4 / #7 / #9 / #10 与 app.html #27 搬（卡片见 plan-type-kit.tsx）。
// Three states: 人脈に候補あり (candidates sorted by 推薦度, multi-select bar),
// 人脈にいない (persona, opener, events, intro routes) and スキップ中 (full points,
// 取り消す). Reads the type and the overview (for step numbers) on open; writes only
// when the user acts.
// R24 review: one write at a time (skip confirm, ✓ / ✕, 取り消す); with the type skipped the
// selection bar cannot record; the bar sits above the home indicator.
// Rework: the design draws no per-row buttons, so a long press on a candidate opens
// 「プランの候補にする / 候補から外す / すでに話した」 (iOS context-menu habit), and
// 「話したを記録 / この分野はもう詳しい / スキップを取り消す」 also sit under the top-right 「⋯」.
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanAwardResult, PlanCandidateView, PlanEventOption, PlanPersonTypeDetail, PlanV2Detail } from "../../api/contract/plan-v2";
import { unitPoints } from "../../api/compute/plan-allocation";
import { AppScreen } from "../../components/AppScreen";
import {
  ActionSheet,
  BottomSheet,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  RetryCard,
  Skeleton,
  UiText,
  useToast,
} from "../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi } from "./plan-api";
import { KitCard, kitText, useKitStyles } from "./plan-kit";
import { newIdempotencyKey } from "./plan-model";
import { typeTone } from "./plan-overview-kit";
import { typeState } from "./plan-overview-model";
import { MailDraftSheet, shareText, usePlanOverviewStyles } from "./plan-overview-ui";
import {
  CandidatesCard,
  candidatesFirst,
  CountRulesCard,
  EventsListCard,
  HintsCard,
  NoneBanner,
  OpenerCard,
  PersonaCard,
  QuestionsCard,
  RoutesCard,
  SelectionFoot,
  SkipButton,
  TypeHeadCard,
  WhyCard,
} from "./plan-type-kit";
import { PlanProposalSheet, type ProposalPerson } from "./PlanProposalSheet";
import { PlanRecordSheet, type RecordPerson } from "./PlanRecordSheet";
import { InlineProblem, useFailureText } from "./plan-ui";
import { usePlanAwardToast } from "./usePlanAwardToast";

type State =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "ready"; detail: PlanPersonTypeDetail; plan: PlanV2Detail | null };

/** Step numbers of the type in plan order (「3」, 「1・3」). */
function stepsOf(detail: PlanPersonTypeDetail, plan: PlanV2Detail | null, separator: string): string {
  if (!plan) return "";
  return plan.content.steps.flatMap((step, index) => (detail.stepKeys.includes(step.key) ? [String(index + 1)] : [])).join(separator);
}

export function PlanTypeScreen({ planId, itemId }: { planId: string; itemId: string }) {
  const api = usePlanApi();
  const copy = useStandardCopy();
  const { t } = useOrbitLocale();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [retrying, setRetrying] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const run = (sequence.current += 1);
    const [detail, plan] = await Promise.all([api.typeDetail(planId, itemId), api.overview(planId)]);
    if (run !== sequence.current) return;
    if (!detail.ok) return setState({ kind: detail.failure.kind === "network" ? "offline" : "failed" });
    setState({ detail: detail.data, kind: "ready", plan: plan.ok ? plan.data : null });
  }, [api, itemId, planId]);

  useEffect(() => { void load(); }, [load]);

  // The selection bar sits under the scrolling page (fixed), so the selection lives here.
  const [selected, setSelected] = useState<string[]>([]);
  const [recordFor, setRecordFor] = useState<RecordPerson[] | null>(null);
  const [proposalFor, setProposalFor] = useState<ProposalPerson[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [skipAsk, setSkipAsk] = useState(false);
  const unskipRef = useRef<() => void>(() => undefined);
  const showAward = usePlanAwardToast(planId, () => void load());
  const detail = state.kind === "ready" ? state.detail : null;
  const plan = state.kind === "ready" ? state.plan : null;
  const selectedPeople = detail ? detail.candidates.filter((candidate) => selected.includes(candidate.contactId)) : [];

  const steps = detail ? stepsOf(detail, plan, t("plan.types.stepSeparator")) : "";
  const title = detail ? detail.shortLabel : t("plan.type.title");
  const subtitle = detail ? (steps ? t("plan.type.subtitleV2", { allocation: detail.allocation, steps }) : t("plan.type.subtitleNoStep", { allocation: detail.allocation })) : undefined;
  const more = detail ? <IconButton icon="more" accessibilityLabel={t("plan.type.more")} onPress={() => setMenu(true)} /> : null;
  return (
    <View style={layout.fill}>
    <AppScreen title={title} subtitle={subtitle} headerActions={more}>
      {state.kind === "loading" ? <Skeleton lines={5} /> : null}
      {state.kind === "offline" ? <EmptyState title={t("plan.segment.offlineTitle")} message={t("plan.segment.offlineBody")} action={{ label: copy.action.retry, onPress: () => void load() }} /> : null}
      {state.kind === "failed" ? <RetryCard title={fillCopy(copy.error.loadFailed, { item: t("plan.type.title") })} onRetry={() => { setRetrying(true); void load().finally(() => setRetrying(false)); }} retrying={retrying} /> : null}
      {state.kind === "ready" ? (
        <PlanTypeBody
          detail={state.detail}
          plan={state.plan}
          steps={steps}
          reload={load}
          selected={selected}
          onSelect={setSelected}
          onAwarded={(results, who) => showAward(results, state.detail.shortLabel, who)}
          skipAsk={skipAsk}
          onSkipAsk={setSkipAsk}
          unskipRef={unskipRef}
          footSpace={selectedPeople.length > 0}
        />
      ) : null}
    </AppScreen>
    {detail && selectedPeople.length > 0 ? <SelectionFoot count={selectedPeople.length} canRecord={!detail.skipped} onRecord={() => setRecordFor(selectedPeople.map((person) => ({ contactId: person.contactId, name: person.name })))} onPropose={() => setProposalFor(selectedPeople.map((person) => ({ contactId: person.contactId, isOrbitUser: person.isOrbitUser, name: person.name })))} /> : null}
    {detail ? (
      <ActionSheet
        visible={menu}
        title={detail.shortLabel}
        options={[
          ...(detail.skipped ? [] : [{ key: "record", label: t("plan.type.record") }]),
          detail.skipped ? { key: "unskip", label: t("plan.type.unskip") } : { key: "skip", label: t("plan.type.skipAction") },
          { key: "cancel", label: copy.action.cancel },
        ]}
        onSelect={(key) => {
          setMenu(false);
          if (key === "record") setRecordFor([]);
          else if (key === "skip") setSkipAsk(true);
          else if (key === "unskip") unskipRef.current();
        }}
        onClose={() => setMenu(false)}
      />
    ) : null}
    {detail ? (
      <PlanRecordSheet
        visible={recordFor !== null}
        onClose={() => setRecordFor(null)}
        planId={planId}
        detail={detail}
        preselected={recordFor ?? EMPTY_PEOPLE}
        onRecorded={(results, who) => {
          setSelected([]);
          showAward(results, detail.shortLabel, who);
          void load();
        }}
      />
    ) : null}
    <PlanProposalSheet visible={proposalFor !== null} onClose={() => setProposalFor(null)} planId={planId} itemId={itemId} people={proposalFor ?? []} />
    </View>
  );
}

function PlanTypeBody({ detail, plan, steps, reload, selected, onSelect, onAwarded, skipAsk, onSkipAsk, unskipRef, footSpace }: {
  detail: PlanPersonTypeDetail;
  plan: PlanV2Detail | null;
  steps: string;
  reload: () => Promise<void>;
  selected: readonly string[];
  onSelect: (next: string[]) => void;
  onAwarded: (results: PlanAwardResult[], who: string) => void;
  skipAsk: boolean;
  onSkipAsk: (open: boolean) => void;
  unskipRef: { current: () => void };
  footSpace: boolean;
}) {
  const { styles } = useStyles();
  const shared = usePlanOverviewStyles().styles;
  const kit = useKitStyles().styles;
  const { colors } = useOrbitTheme();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const failureText = useFailureText();
  const api = usePlanApi();
  const planId = detail.planId;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [intro, setIntro] = useState<{ viaName: string; subject: string; body: string } | null>(null);
  const [rowMenu, setRowMenu] = useState<PlanCandidateView | null>(null);
  const [talkedOpen, setTalkedOpen] = useState(false);
  const [openEvent, setOpenEvent] = useState<PlanEventOption | null>(null);
  const state = typeState(detail);
  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  const dateText = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const index = plan ? Math.max(0, plan.content.personTypes.findIndex((type) => type.itemId === detail.itemId)) : Math.max(0, detail.letter.charCodeAt(0) - 65);
  const stats = plan?.typeStats?.find((item) => item.itemId === detail.itemId);
  const eventUnit = plan && plan.content.event.allocation > 0 ? (unitPoints(plan.content.event.allocation, plan.content.event.targetCount)[0] ?? null) : null;
  const kicker = steps ? t("plan.type.kicker", { allocation: detail.allocation, label: detail.shortLabel, steps }) : t("plan.type.kickerNoStep", { allocation: detail.allocation, label: detail.shortLabel });

  const running = useRef(false);
  const run = async (work: () => Promise<boolean>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProblem(null);
    try { await work(); } finally { running.current = false; setBusy(false); }
  };
  /** すでに話した: record this one person now (basis talked), same toast as the sheet. */
  const talked = (contactId: string, name: string) => void run(async () => {
    const result = await api.award(planId, detail.itemId, contactId, newIdempotencyKey("award"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    onSelect(selected.filter((id) => id !== contactId));
    onAwarded([result.data], name);
    await reload();
    return true;
  });
  const decide = (contactId: string, name: string, decision: "accept" | "dismiss") => void run(async () => {
    const result = await api.decideCandidate(planId, detail.itemId, contactId, decision, newIdempotencyKey("candidate"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    onSelect(selected.filter((id) => id !== contactId));
    toast.success(t(decision === "accept" ? "plan.type.accepted" : "plan.type.dismissed"), { sub: name });
    await reload();
    return true;
  });
  const skip = () => void run(async () => {
    onSkipAsk(false);
    const result = await api.skip(planId, detail.itemId, newIdempotencyKey("skip"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    const points = Math.max(0, detail.allocation - detail.earned);
    toast.success(t("plan.skip.done", { points }), { sub: t("plan.skip.doneSub", { label: detail.shortLabel }), undo: () => void unskip() });
    await reload();
    return true;
  });
  const unskip = () => run(async () => {
    const result = await api.unskip(planId, detail.itemId, newIdempotencyKey("unskip"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    toast.info(t("plan.skip.undone"));
    await reload();
    return true;
  });
  unskipRef.current = () => void unskip();
  const undoTalked = (awardLogId: string) => void run(async () => {
    const result = await api.undoAward(planId, awardLogId, newIdempotencyKey("undo"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    toast.info(t("plan.award.undone"));
    await reload();
    return true;
  });
  const makeIntro = (viaContactId: string) => void run(async () => {
    const result = await api.introDraft(planId, detail.itemId, viaContactId, newIdempotencyKey("intro"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    setIntro(result.data);
    return true;
  });
  const toggle = (contactId: string) => onSelect(selected.includes(contactId) ? selected.filter((id) => id !== contactId) : [...selected, contactId]);
  const copyQuestions = () => shareText(detail.questions.map((question, n) => `${n + 1}. ${question}`).join("\n"));

  const candidates = detail.candidates.length > 0 ? (
    <CandidatesCard detail={detail} selected={selected} faded={detail.skipped} onToggle={toggle} onMenu={setRowMenu} onAction={(person, key) => { if (key === "talked") { if (!detail.skipped) talked(person.contactId, person.name); } else decide(person.contactId, person.name, key); }} talkedOpen={talkedOpen} onTalkedToggle={() => setTalkedOpen((open) => !open)} />
  ) : null;
  const talkedList = talkedOpen && detail.talked.length > 0 ? (
    <KitCard style={styles.talkedList} testID="talked-list">
      {detail.talked.map((entry, n) => {
        const name = entry.name ?? t("plan.type.anonymous");
        return (
          <View key={entry.awardLogId} style={[shared.between, styles.talked, n > 0 && styles.line]} testID="talked-row">
            <View style={kit.grow}>
              <UiText style={styles.talkedName}>{name}</UiText>
              <UiText style={kit.lbl}>{`${dateText(entry.at)} · ${t(entry.part === "overflow" ? "plan.type.talkedHalf" : "plan.type.talkedPoints", { points: entry.points })}`}</UiText>
            </View>
            <Button size="sm" label={copy.action.withdraw} accessibilityLabel={t("plan.type.undoTalkedA11y", { name })} onPress={() => undoTalked(entry.awardLogId)} variant="ghost" disabled={busy} />
          </View>
        );
      })}
    </KitCard>
  ) : null;
  const stepNo = steps.split(t("plan.types.stepSeparator"))[0];
  const stepTitle = plan && stepNo ? plan.content.steps[Number(stepNo) - 1]?.title ?? null : null;
  const whyBasis = t(stepTitle ? "plan.type.whyBasis" : "plan.type.whyBasisNoStep", { allocation: detail.allocation, label: detail.shortLabel, step: stepNo ?? "", title: stepTitle ?? "" });
  const why = <WhyCard detail={detail} basis={whyBasis} />;
  const questions = detail.questions.length > 0 ? <QuestionsCard questions={detail.questions} onCopy={copyQuestions} /> : null;
  const rules = detail.skipped ? null : <CountRulesCard detail={detail} />;
  const hints = detail.recognizeHints.length > 0 && !detail.skipped ? <HintsCard hints={detail.recognizeHints} /> : null;
  const routes = detail.introRoutes.length > 0 && !detail.skipped ? <RoutesCard routes={detail.introRoutes} none={state === "none"} note={t(state === "none" ? "plan.type.routesNoteNone" : "plan.type.routesNote")} busy={busy} onDraft={makeIntro} /> : null;
  const events = detail.events.length > 0 ? <EventsListCard events={detail.events} ring={state === "none" ? 44 : 42} bonus={eventUnit} onOpen={setOpenEvent} /> : null;
  const tasks = detail.tasks.length > 0 ? (
    <KitCard style={styles.pad1416}>
      <UiText accessibilityRole="header" style={styles.b135}>{t("plan.type.tasks")}</UiText>
      {detail.tasks.map((task) => (
        <View key={task.taskId} style={[shared.between, styles.task]}>
          <UiText style={[styles.taskText, kit.grow]}>{task.title}</UiText>
          {task.dueDate ? <UiText style={kit.lbl}>{dateText(task.dueDate)}</UiText> : null}
        </View>
      ))}
    </KitCard>
  ) : null;
  const skipButton = detail.skipped ? null : <SkipButton onPress={() => onSkipAsk(true)} />;

  return (
    <View style={styles.page}>
      {state === "none" ? <NoneBanner /> : null}
      <TypeHeadCard detail={detail} tone={typeTone(index)} kicker={kicker} events={stats?.events ?? detail.events.length} busy={busy} onUnskip={() => void unskip()} />
      {problem ? <InlineProblem text={problem} /> : null}
      {state === "none" ? (
        <>
          <PersonaCard persona={detail.persona ?? detail.why} basis={detail.persona ? detail.why : null} />
          {detail.opener ? <OpenerCard opener={detail.opener} judge={detail.countRule ? t("plan.type.openerJudge", { rule: detail.countRule }) : null} onCopy={() => shareText(detail.opener!)} /> : null}
          {events}
          {routes}
          {hints}
          {tasks}
        </>
      ) : candidatesFirst(detail) ? (
        <>
          {candidates}
          {talkedList}
          {why}
          {questions}
          {rules}
          {hints}
          {routes}
          {events}
          {tasks}
        </>
      ) : (
        <>
          {why}
          {questions}
          {candidates}
          {talkedList}
          {rules}
          {hints}
          {routes}
          {events}
          {tasks}
        </>
      )}
      {skipButton}
      {footSpace ? <View style={styles.footSpace} /> : null}

      <ActionSheet
        visible={rowMenu !== null}
        title={rowMenu?.name ?? ""}
        options={[
          { key: "accept", label: t("plan.type.accept") },
          { key: "talked", label: t("plan.type.alreadyTalked") },
          { key: "dismiss", label: t("plan.type.dismiss"), destructive: true },
          { key: "cancel", label: copy.action.cancel },
        ]}
        onSelect={(key) => {
          const person = rowMenu;
          setRowMenu(null);
          if (!person) return;
          if (key === "accept" || key === "dismiss") decide(person.contactId, person.name, key);
          else if (key === "talked" && !detail.skipped) talked(person.contactId, person.name);
        }}
        onClose={() => setRowMenu(null)}
      />
      <BottomSheet visible={openEvent !== null} onClose={() => setOpenEvent(null)} accessibilityLabel={openEvent?.title ?? t("plan.type.eventsTitle")}>
        {openEvent ? (
          <View style={styles.sheet} testID="event-breakdown">
            <UiText accessibilityRole="header" style={styles.sheetTitle}>{openEvent.title}</UiText>
            <UiText style={kit.lbl}>{t("plan.type.breakdown")}</UiText>
            {openEvent.score.scoreBreakdown.map((item) => (
              <View key={item.criterion} style={styles.criterion}>
                <View style={shared.between}>
                  <UiText style={styles.talkedName}>{item.reason}</UiText>
                  <View style={shared.row}>
                    {item.estimated ? <Chip label={copy.chip.estimated} tone="apricot" /> : null}
                    <UiText style={shared.points}>{t("plan.type.criterionScore", { max: item.max, score: item.score })}</UiText>
                  </View>
                </View>
                <View style={shared.track}>
                  <View style={{ flex: item.score, backgroundColor: colors.plum700 }} />
                  <View style={{ flex: Math.max(0, item.max - item.score) }} />
                </View>
                {item.facts.length > 0 ? <UiText style={kit.lbl}>{item.facts.join(" · ")}</UiText> : null}
              </View>
            ))}
          </View>
        ) : null}
      </BottomSheet>
      <MailDraftSheet visible={intro !== null} onClose={() => setIntro(null)} title={t("plan.mail.introTitle")} subtitle={intro ? t("plan.mail.introSub", { letter: detail.letter, name: intro.viaName }) : undefined} to={intro?.viaName} subject={intro?.subject ?? ""} body={intro?.body ?? ""} />
      <ConfirmDialog
        visible={skipAsk}
        title={t("plan.skip.title")}
        message={t("plan.skip.body", { points: Math.max(0, detail.allocation - detail.earned) })}
        confirmLabel={t("plan.skip.confirm")}
        onConfirm={() => { if (!busy) skip(); }}
        onCancel={() => onSkipAsk(false)}
      />
    </View>
  );
}

const EMPTY_PEOPLE: readonly RecordPerson[] = [];
const layout = StyleSheet.create({ fill: { flex: 1 } });

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  // AppScreen 内容区多 spacing.md 12 的上边距、左右 16（kit .scroll 18）：先在页内抵消（同 PlanOverview，待壳统一）。
  page: { gap: 14, marginTop: -12, marginHorizontal: 2 },
  b135: { color: colors.ink, ...kitText(13.5, "700") },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  pad1416: { paddingVertical: 14, paddingHorizontal: 16 },
  talkedList: { paddingVertical: 6, paddingHorizontal: 16 },
  talked: { paddingVertical: 8 },
  talkedName: { color: colors.ink, ...kitText(13, "700") },
  task: { paddingVertical: 8 },
  taskText: { color: colors.ink, ...kitText(13, "400", 1.6) },
  footSpace: { height: 76 },
  sheet: { gap: 10 },
  sheetTitle: { color: colors.ink, ...kitText(16, "800") },
  criterion: { gap: 4 },
}));
