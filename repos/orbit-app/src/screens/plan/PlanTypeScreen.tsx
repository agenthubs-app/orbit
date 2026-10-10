// R24 人物タイプ詳細 (App `plans/[planId]/types/[itemId]`, b10 ⑧, b4 A1–A2, UI-SPEC).
// Three states: 人脈に候補あり (candidates sorted by 推薦度, ✓ / ✕, multi-select bar),
// 人脈にいない (persona, opener, events, intro routes) and スキップ中 (full points,
// 取り消す). Every state has 聞くこと, 話せたの判定, 会える活動 (expandable 5-item
// breakdown) and やること when there are tasks. Reads the type and the overview (for
// step numbers) on open; writes only when the user acts.
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanPersonTypeDetail, PlanV2Detail } from "../../api/contract/plan-v2";
import { AppScreen } from "../../components/AppScreen";
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  RetryCard,
  SampleTag,
  Skeleton,
  UiText,
  useToast,
  WhyDisclosure,
} from "../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi } from "./plan-api";
import { newIdempotencyKey } from "./plan-model";
import { stepNumbersOf, typeState } from "./plan-overview-model";
import { Disclosure, EventRing, MailDraftSheet, Section, shareText, StatCells, Stripes, usePlanOverviewStyles } from "./plan-overview-ui";
import { PlanProposalSheet, type ProposalPerson } from "./PlanProposalSheet";
import { PlanRecordSheet, type RecordPerson } from "./PlanRecordSheet";
import { InlineProblem, useFailureText } from "./plan-ui";
import { usePlanAwardToast } from "./usePlanAwardToast";

type State =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "ready"; detail: PlanPersonTypeDetail; plan: PlanV2Detail | null };

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
  const showAward = usePlanAwardToast(planId, () => void load());
  const detail = state.kind === "ready" ? state.detail : null;
  const selectedPeople = detail ? detail.candidates.filter((candidate) => selected.includes(candidate.contactId)) : [];

  const title = detail ? detail.shortLabel : t("plan.type.title");
  return (
    <View style={layout.fill}>
    <AppScreen title={title}>
      {state.kind === "loading" ? <Skeleton lines={5} /> : null}
      {state.kind === "offline" ? <EmptyState title={t("plan.segment.offlineTitle")} message={t("plan.segment.offlineBody")} action={{ label: copy.action.retry, onPress: () => void load() }} /> : null}
      {state.kind === "failed" ? <RetryCard title={fillCopy(copy.error.loadFailed, { item: t("plan.type.title") })} onRetry={() => { setRetrying(true); void load().finally(() => setRetrying(false)); }} retrying={retrying} /> : null}
      {state.kind === "ready" ? <PlanTypeBody detail={state.detail} plan={state.plan} reload={load} selected={selected} onSelect={setSelected} onRecord={setRecordFor} /> : null}
    </AppScreen>
    {detail && selectedPeople.length > 0 ? <SelectionBar count={selectedPeople.length} onRecord={() => setRecordFor(selectedPeople.map((person) => ({ contactId: person.contactId, name: person.name })))} onPropose={() => setProposalFor(selectedPeople.map((person) => ({ contactId: person.contactId, isOrbitUser: person.isOrbitUser, name: person.name })))} /> : null}
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

/** 「N人を選択中 · N人を記録 · 面談を提案」 fixed under the page (b4 A2 ① ⑤). */
function SelectionBar({ count, onRecord, onPropose }: { count: number; onRecord: () => void; onPropose: () => void }) {
  const shared = usePlanOverviewStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <View style={shared.footer} testID="selection-bar">
      <UiText style={[shared.strong, shared.grow]}>{t("plan.type.selected", { count })}</UiText>
      <Button size="sm" label={t("plan.type.recordSelected", { count })} onPress={onRecord} variant="secondary" />
      <Button size="sm" label={t("plan.type.propose")} onPress={onPropose} variant="primary" />
    </View>
  );
}

function PlanTypeBody({ detail, plan, reload, selected, onSelect, onRecord }: {
  detail: PlanPersonTypeDetail;
  plan: PlanV2Detail | null;
  reload: () => Promise<void>;
  selected: readonly string[];
  onSelect: (next: string[]) => void;
  onRecord: (people: RecordPerson[]) => void;
}) {
  const { styles } = useStyles();
  const shared = usePlanOverviewStyles().styles;
  const { colors } = useOrbitTheme();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const failureText = useFailureText();
  const api = usePlanApi();
  const planId = detail.planId;
  const [skipAsk, setSkipAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [intro, setIntro] = useState<{ viaName: string; subject: string; body: string } | null>(null);
  const state = typeState(detail);
  const steps = plan ? stepNumbersOf(plan.content.steps, detail.stepKeys, t("plan.types.stepSeparator")) : "";
  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  const dateText = (iso: string, withDay = false) => new Date(iso).toLocaleDateString(locale, withDay ? { day: "numeric", month: "short", weekday: "short" } : { day: "numeric", month: "short" });
  const firstUnit = detail.unitPoints[0] ?? 0;
  const lastUnit = detail.unitPoints[detail.unitPoints.length - 1] ?? 0;
  const paceParams = { allocation: detail.allocation, last: lastUnit, met: detail.metCount, target: detail.targetCount, unit: firstUnit };

  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    setProblem(null);
    await work();
    setBusy(false);
  };
  const decide = (contactId: string, name: string, decision: "accept" | "dismiss") => void run(async () => {
    const result = await api.decideCandidate(planId, detail.itemId, contactId, decision, newIdempotencyKey("candidate"));
    if (!result.ok) { setProblem(failureText(result.failure)); return false; }
    onSelect(selected.filter((id) => id !== contactId));
    toast.success(t(decision === "accept" ? "plan.type.accepted" : "plan.type.dismissed"), { sub: name });
    await reload();
    return true;
  });
  const skip = () => void run(async () => {
    setSkipAsk(false);
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

  return (
    <View style={styles.page}>
      {detail.sample ? <View style={shared.row}><SampleTag /></View> : null}
      {state === "none" ? (
        <View accessible style={styles.banner}>
          <UiText style={shared.strong}>{t("plan.type.notInNetwork")}</UiText>
          <UiText style={shared.meta}>{t("plan.type.notInNetworkBody")}</UiText>
        </View>
      ) : null}

      <View style={shared.card} testID="type-head">
        <View style={shared.rowTop}>
          <View style={shared.emojiTile}><UiText style={shared.emoji}>{detail.emoji}</UiText></View>
          <View style={shared.grow}>
            <UiText style={shared.eyebrow}>{steps ? t("plan.type.headerEyebrow", { allocation: detail.allocation, letter: detail.letter, steps }) : t("plan.type.headerEyebrowNoStep", { allocation: detail.allocation, letter: detail.letter })}</UiText>
            <UiText accessibilityRole="header" style={shared.heading}>{detail.roleSituation}</UiText>
          </View>
        </View>
        <View style={shared.between}>
          <View style={[shared.row, shared.grow]}>
            <UiText style={styles.bigScore}>{String(detail.earned)}</UiText>
            <UiText style={shared.pointsOf}>{detail.skipped ? t("plan.type.scoreSkipped", paceParams) : t(firstUnit === lastUnit ? "plan.type.scoreOf" : "plan.type.scoreOfLast", paceParams)}</UiText>
          </View>
          {state === "candidates" ? <Chip label={t("plan.type.inNetwork", { count: detail.candidates.length })} tone="lav" /> : null}
        </View>
        <View style={shared.track}>
          {detail.earned > 0 ? <View style={{ flex: Math.min(detail.allocation, detail.earned), backgroundColor: colors.plum700 }}>{detail.skipped ? <Stripes background={colors.plum300} color={colors.plum700} /> : null}</View> : null}
          {detail.allocation - detail.earned > 0 ? <View style={{ flex: detail.allocation - detail.earned }} /> : null}
        </View>
        {detail.overflow > 0 ? <Chip label={t("plan.type.overflowEarned", { points: detail.overflow })} tone="pink" /> : null}
        {!detail.skipped && detail.metCount >= detail.targetCount && detail.next.part === "overflow" ? <UiText style={shared.body}>{t("plan.type.overflowNote", { next: detail.targetCount + 1, points: detail.next.points, target: detail.targetCount })}</UiText> : null}
        <StatCells candidates={detail.candidates.length} events={detail.events.length} routes={detail.introRoutes.length} />
        {detail.skipped ? (
          <View style={styles.skipped} testID="type-skipped">
            <UiText style={shared.strong}>{t("plan.type.skippedTitle")}</UiText>
            <UiText style={shared.body}>{t("plan.type.skippedBody")}</UiText>
            <Button label={t("plan.type.unskip")} icon="undo" onPress={() => void unskip()} variant="secondary" loading={busy} />
          </View>
        ) : (
          <Button label={t("plan.type.record")} icon="plus" onPress={() => onRecord([])} variant="secondary" />
        )}
        {problem ? <InlineProblem text={problem} /> : null}
      </View>

      {state === "candidates" ? (
        <Section title={t("plan.type.candidatesTitle")} note={t("plan.type.candidatesNote", { count: detail.candidates.length })}>
          {detail.candidates.map((candidate, index) => {
            const checked = selected.includes(candidate.contactId);
            return (
              <View key={candidate.candidateId} style={[styles.candidate, index > 0 && styles.candidateLine]} testID="candidate-row">
                <View style={shared.rowTop}>
                  <Checkbox checked={checked} onChange={() => onSelect(checked ? selected.filter((id) => id !== candidate.contactId) : [...selected, candidate.contactId])} accessibilityLabel={t("plan.type.select", { name: candidate.name })} />
                  <Avatar name={candidate.name} size="sm" />
                  <View style={shared.grow}>
                    <View style={shared.row}>
                      <UiText style={shared.strong}>{candidate.name}</UiText>
                      {candidate.isOrbitUser ? <Chip label={t("plan.type.orbitUser")} tone="teal" /> : null}
                    </View>
                    {candidate.company || candidate.role ? <UiText numberOfLines={1} style={shared.meta}>{[candidate.company, candidate.role].filter(Boolean).join(" · ")}</UiText> : null}
                  </View>
                  <View accessible accessibilityLabel={t("plan.type.recommendA11y", { score: candidate.recommendScore })} style={styles.recommend}>
                    <UiText style={styles.recommendScore}>{String(candidate.recommendScore)}</UiText>
                    <UiText style={styles.recommendLabel}>{t("plan.type.recommend")}</UiText>
                  </View>
                  {candidate.basis.length > 0 ? <WhyDisclosure reason={candidate.basis.map((item) => item.label).filter(Boolean).join(" · ")} /> : null}
                </View>
                {candidate.reason ? <UiText style={shared.body}>{candidate.reason}</UiText> : null}
                {candidate.opener || candidate.lastContactAt ? (
                  <UiText style={shared.meta}>{[candidate.opener ? t("plan.type.opening", { text: candidate.opener }) : null, candidate.lastContactAt ? t("plan.type.lastContact", { date: dateText(candidate.lastContactAt) }) : null].filter(Boolean).join(" · ")}</UiText>
                ) : null}
                <View style={shared.row}>
                  <Button size="sm" icon="check" label={t("plan.type.accept")} accessibilityLabel={t("plan.type.acceptA11y", { name: candidate.name })} onPress={() => decide(candidate.contactId, candidate.name, "accept")} variant="secondary" disabled={busy} />
                  <IconButton icon="x" size={34} soft accessibilityLabel={t("plan.type.dismissA11y", { name: candidate.name })} onPress={() => decide(candidate.contactId, candidate.name, "dismiss")} disabled={busy} />
                </View>
              </View>
            );
          })}
        </Section>
      ) : null}

      {detail.talked.length > 0 ? (
        <View style={shared.card}>
          <Disclosure label={t("plan.type.talkedTitle", { count: detail.talked.length })}>
            {detail.talked.map((entry) => {
              const name = entry.name ?? t("plan.type.anonymous");
              return (
                <View key={entry.awardLogId} style={[shared.between, styles.talked]} testID="talked-row">
                  <View style={shared.grow}>
                    <UiText style={shared.strong}>{name}</UiText>
                    <UiText style={shared.meta}>{`${dateText(entry.at)} · ${t(entry.part === "overflow" ? "plan.type.talkedHalf" : "plan.type.talkedPoints", { points: entry.points })}`}</UiText>
                  </View>
                  <Button size="sm" label={copy.action.withdraw} accessibilityLabel={t("plan.type.undoTalkedA11y", { name })} onPress={() => undoTalked(entry.awardLogId)} variant="ghost" disabled={busy} />
                </View>
              );
            })}
          </Disclosure>
        </View>
      ) : null}

      <Section title={t("plan.type.why")}>
        <UiText style={shared.body}>{detail.why}</UiText>
      </Section>

      {state === "none" && detail.persona ? (
        <Section title={t("plan.type.persona")}>
          <UiText style={shared.body}>{detail.persona}</UiText>
        </Section>
      ) : null}

      {state === "none" && detail.opener ? (
        <Section title={t("plan.type.opener")} trailing={<Button size="sm" icon="copy" label={copy.action.copy} onPress={() => shareText(detail.opener!)} variant="ghost" />}>
          <UiText style={shared.strong}>{detail.opener}</UiText>
        </Section>
      ) : null}

      <Section title={t("plan.type.questions")} trailing={<Button size="sm" icon="copy" label={copy.action.copy} onPress={() => shareText(detail.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"))} variant="ghost" />}>
        {detail.questions.map((question, index) => (
          <View key={index} style={shared.rowTop}>
            <View style={shared.numberSoft}><UiText style={shared.numberSoftText}>{String(index + 1)}</UiText></View>
            <UiText style={[shared.body, shared.grow]}>{question}</UiText>
          </View>
        ))}
      </Section>

      <Section title={t("plan.type.countRule")} note={t("plan.type.countRuleNote", { target: detail.targetCount })}>
        <UiText style={shared.body}>{detail.countRule}</UiText>
      </Section>

      {detail.recognizeHints.length > 0 ? (
        <Section title={t("plan.type.hints")}>
          <View style={shared.row}>{detail.recognizeHints.map((hint) => <Chip key={hint} label={hint} />)}</View>
        </Section>
      ) : null}

      {detail.events.length > 0 ? (
        <Section title={t("plan.type.eventsTitle")} note={t("plan.type.eventsNote")}>
          {detail.events.map((event, index) => (
            <View key={event.eventId} style={[styles.event, index > 0 && styles.candidateLine]} testID="event-row">
              <View style={shared.rowTop}>
                <EventRing total={event.score.total} accessibilityLabel={t("plan.type.eventScoreA11y", { score: event.score.total, title: event.title })} />
                <View style={shared.grow}>
                  <UiText style={shared.strong}>{event.title}</UiText>
                  <UiText style={shared.meta}>{[dateText(event.startsAt, true), event.venue].filter(Boolean).join(" · ")}</UiText>
                  {event.expectedCount ? <View style={shared.row}><Chip label={t("plan.type.eventExpected", { count: event.expectedCount })} tone="pink" /></View> : null}
                </View>
              </View>
              <Disclosure label={t("plan.type.breakdown")} accessibilityLabel={`${event.title} ${t("plan.type.breakdown")}`}>
                <View style={shared.cardSoft} testID="event-breakdown">
                  {event.score.scoreBreakdown.map((item) => (
                    <View key={item.criterion} style={styles.criterion}>
                      <View style={shared.between}>
                        <UiText style={shared.strong}>{item.reason}</UiText>
                        <View style={shared.row}>
                          {item.estimated ? <Chip label={copy.chip.estimated} tone="apricot" /> : null}
                          <UiText style={shared.points}>{t("plan.type.criterionScore", { max: item.max, score: item.score })}</UiText>
                        </View>
                      </View>
                      <View style={shared.track}>
                        <View style={{ flex: item.score, backgroundColor: colors.plum700 }} />
                        <View style={{ flex: Math.max(0, item.max - item.score) }} />
                      </View>
                      {item.facts.length > 0 ? <UiText style={shared.meta}>{item.facts.join(" · ")}</UiText> : null}
                    </View>
                  ))}
                </View>
              </Disclosure>
            </View>
          ))}
          <UiText style={shared.meta}>{t("plan.type.eventBonus")}</UiText>
        </Section>
      ) : null}

      {detail.introRoutes.length > 0 ? (
        <Section title={t("plan.type.routesTitle")} note={t("plan.type.routesNote")}>
          {detail.introRoutes.map((route) => (
            <View key={route.viaContactId} style={shared.cardSoft}>
              <View style={shared.row}>
                <Avatar name={route.viaName} size="sm" />
                <UiText style={[shared.strong, shared.grow]}>{t("plan.type.routeVia", { name: route.viaName })}</UiText>
              </View>
              <UiText style={shared.body}>{route.why}</UiText>
              <Button size="sm" icon="mail" label={t("plan.type.makeDraft")} accessibilityLabel={t("plan.type.makeDraftA11y", { name: route.viaName })} onPress={() => makeIntro(route.viaContactId)} variant="secondary" disabled={busy} />
            </View>
          ))}
        </Section>
      ) : null}

      {detail.tasks.length > 0 ? (
        <Section title={t("plan.type.tasks")}>
          {detail.tasks.map((task) => (
            <View key={task.taskId} style={shared.between}>
              <UiText style={[shared.body, shared.grow]}>{task.title}</UiText>
              {task.dueDate ? <UiText style={shared.meta}>{dateText(task.dueDate)}</UiText> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {!detail.skipped ? <Button label={t("plan.type.skipAction")} icon="skip" onPress={() => setSkipAsk(true)} variant="ghost" /> : null}

      <MailDraftSheet visible={intro !== null} onClose={() => setIntro(null)} title={t("plan.mail.introTitle")} subtitle={intro ? t("plan.mail.introSub", { letter: detail.letter, name: intro.viaName }) : undefined} to={intro?.viaName} subject={intro?.subject ?? ""} body={intro?.body ?? ""} />
      <ConfirmDialog
        visible={skipAsk}
        title={t("plan.skip.title")}
        message={t("plan.skip.body", { points: Math.max(0, detail.allocation - detail.earned) })}
        confirmLabel={t("plan.skip.confirm")}
        onConfirm={skip}
        onCancel={() => setSkipAsk(false)}
      />
    </View>
  );
}

const EMPTY_PEOPLE: readonly RecordPerson[] = [];
const layout = StyleSheet.create({ fill: { flex: 1 } });

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { gap: 14 },
  banner: { backgroundColor: colors.surface2, borderRadius: 16, padding: 14, gap: 4 },
  bigScore: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: "800" },
  skipped: { backgroundColor: colors.plum100, borderRadius: 14, padding: 12, gap: 6 },
  candidate: { gap: 8, paddingVertical: 10 },
  candidateLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  recommend: { alignItems: "center", minWidth: 44 },
  recommendScore: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  recommendLabel: { color: colors.ink3Text, fontSize: 10, fontWeight: "700" },
  talked: { paddingVertical: 8 },
  event: { gap: 8, paddingVertical: 10 },
  criterion: { gap: 4 },
}));
