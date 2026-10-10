"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlanConfirmResult, PlanDraftView, PlanIntakeMembersRequest, PlanIntakeView } from "../../../../../shared/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy } from "../copy/plan";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, ConfirmDialog, Orbit2026Scope, RetryCard, Skeleton, ToastProvider } from "../ui";
import { BackgroundBlocks, STANCE_COPY, currentBlock, teamSummary, type BlockKey, type MeDraft } from "./BackgroundBlocks";
import { DraftCard, DraftTurns, FixBar } from "./DraftCard";
import { DraftRail, KnownRail } from "./FlowRail";
import { PremiseCard, QuestionsCard, answeredRows, answersBody, initialAnswers, type AnswerDraft } from "./IntakeCards";
import { newActionKey, planApi, type PlanApiResult } from "./plan-api";
import { flowStage, flowSummary, mergeTeamDraft, planErrorView, teamDraftOf, type PlanErrorView, type TeamDraft } from "./plan-model";
import { FlowProgress, PlanErrorNotice, STAGE_TITLE, translator } from "./PlanParts";
import styles from "./plan.module.css";

type FailedAction = { where: string; view: PlanErrorView; retry: () => void };

const enc = encodeURIComponent;

/** ② 生成流程 (`/app/plans/flow/[intakeId]`): 背景 → ≤5 問 → 前提 → 初版 → AI 修正. */
export function PlanFlowScreen({ intakeId }: { intakeId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const router = useRouter();
  const [intake, setIntake] = useState<PlanIntakeView | null>(null);
  const [draft, setDraft] = useState<PlanDraftView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  // 改前提 after AI revisions: wait for 「破棄して直す」 before sending (review m16).
  const [discard, setDiscard] = useState<{ key: string; value: string; resolve: (ok: boolean) => void } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const [failed, setFailed] = useState<FailedAction | null>(null);
  const [me, setMe] = useState<MeDraft>({ stance: null, wants: "" });
  const [team, setTeam] = useState<TeamDraft>({ members: [], mode: "solo" });
  const [purposeLevel, setPurposeLevel] = useState<number | null>(null);
  const [editing, setEditing] = useState<BlockKey | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});

  /** Take a fresh intake from the server and reset the local drafts to it. */
  const adopt = useCallback((next: PlanIntakeView, previous: PlanIntakeView | null) => {
    setIntake(next);
    setMe({ stance: next.background.me.value.stance, wants: next.background.me.value.wants });
    setTeam((local) => (previous && local.members.length ? mergeTeamDraft(local, next.background.team.value) : teamDraftOf(next.background.team.value)));
    const purpose = next.background.purpose.value;
    setPurposeLevel(purpose.selectedLevel ?? purpose.suggestedLevel ?? purpose.rungs[0]?.level ?? null);
    if (next.questions && (!previous?.questions || previous.status !== "questions")) setAnswers(initialAnswers(next));
  }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setFailed(null);
    const result = await planApi<PlanIntakeView>(`/intakes/${enc(intakeId)}`, { language });
    if (!result.ok) { setLoadFailed(true); return; }
    adopt(result.data, null);
    setEditing(null);
    if (result.data.draftId) {
      const read = await planApi<PlanDraftView>(`/drafts/${enc(result.data.draftId)}`, { language });
      setDraft(read.ok ? read.data : null);
      setDraftLoadFailed(!read.ok);
    } else {
      setDraft(null);
      setDraftLoadFailed(false);
    }
  }, [adopt, intakeId, language]);

  useEffect(() => { void load(); }, [load]);

  // AI_BUSY: the same step is already running — say so and read again once after 2 s.
  const busyNotice = failed?.view.tone === "notice" && failed.view.notice === "busy";
  useEffect(() => {
    if (!busyNotice) return;
    const timer = window.setTimeout(() => void load(), 2000);
    return () => window.clearTimeout(timer);
  }, [busyNotice, load]);

  /**
   * One user action: one fresh idempotency key, one request at a time (a second
   * click while it runs does nothing). もう一度 runs it again with a new key.
   */
  const act = useCallback(async <T,>(where: string, op: "draft" | "fix" | "other", call: (key: string) => Promise<PlanApiResult<T>>, done: (data: T) => void): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = where;
    setBusy(where);
    setFailed(null);
    const result = await call(newActionKey());
    busyRef.current = null;
    setBusy(null);
    if (result.ok === false) {
      setFailed({ retry: () => void act(where, op, call, done), view: planErrorView(result.error, op), where });
      return false;
    }
    done(result.data);
    return true;
  }, []);

  const rail = useMemo(() => {
    if (!intake) return undefined;
    if (draft && intake.status !== "background" && intake.status !== "questions" && intake.status !== "premise") return <DraftRail draft={draft} t={t} />;
    const rows = flowSummary({
      answers: answeredRows(intake, answers, language),
      intake,
      language,
      noGapText: t(planFlowCopy.railNoGap),
      purposeLevel,
      setupText: (count, names) => t(planFlowCopy.railTeam, { count, names }),
      soloText: t(planFlowCopy.railSolo),
      stanceLabel: me.stance ? t(STANCE_COPY[me.stance]) : null,
      team,
      wants: me.wants,
    });
    return <KnownRail rows={rows} t={t} />;
    // t is derived from language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake, draft, answers, language, purposeLevel, me, team]);

  const stage = intake ? flowStage(intake, draft) : "background";
  const shell = <ShellPage title={t(planFlowCopy.flowPageTitle)} subtitle={t(STAGE_TITLE[stage])} rightRail={rail ?? false} />;

  if (loadFailed) {
    return (
      <Orbit2026Scope language={language} className={styles.page}>
        {shell}
        <PlanErrorNotice view={{ op: "other", tone: "failure" }} t={t} onRetry={() => void load()} />
      </Orbit2026Scope>
    );
  }
  if (!intake) {
    return <Orbit2026Scope language={language} className={styles.page}>{shell}<Skeleton lines={6} onRetry={() => void load()} /></Orbit2026Scope>;
  }

  const base = `/intakes/${enc(intake.intakeId)}`;
  const errorAt = (where: string) => (failed && failed.where === where ? <PlanErrorNotice view={failed.view} t={t} onRetry={failed.retry} onReload={() => void load()} /> : null);

  const confirmBlock = (block: BlockKey) => void act<PlanIntakeView>(block, "other", async (key) => {
    let from = intake;
    if (block === "me" && me.wants.trim() !== intake.background.me.value.wants && intake.limits.ladderLeft > 0) {
      const ladder = await planApi<PlanIntakeView>(`${base}/ladder`, { body: { idempotencyKey: newActionKey(), wants: me.wants.trim() }, language });
      if (!ladder.ok) return ladder;
      from = ladder.data;
    }
    const body = block === "me" ? { me: { stance: me.stance!, wants: me.wants.trim() } }
      : block === "team" ? { team: { members: team.members.map((member) => ({ capabilities: member.capabilities, memberId: member.memberId, otherCapabilities: member.otherCapabilities, relation: member.relation })), mode: team.mode } }
      : { purpose: { selectedLevel: purposeLevel! } };
    return planApi<PlanIntakeView>(base, { body: { block, ...body, expectedUpdatedAt: from.updatedAt, idempotencyKey: key }, language, method: "PATCH" });
  }, (next) => { adopt(next, intake); setEditing(null); });

  const addMembers = (body: PlanIntakeMembersRequest) => act<PlanIntakeView>("members", "other", (key) => planApi(`${base}/members`, { body: { ...body, idempotencyKey: key }, language }), (next) => adopt(next, intake));

  const intro = (
    <>
      <FlowProgress stage={stage} t={t} />
      <p className={styles.goalLine}>{t(planFlowCopy.goalLine, { goal: intake.goal })}</p>
    </>
  );

  let body: React.ReactNode;
  if (intake.status === "planned") {
    body = (
      <Card data-plan-planned="">
        <p className={styles.title}>{t(planFlowCopy.confirmedTitle)}</p>
        <div className={styles.blockActions}><Button variant="primary" label={t(planFlowCopy.plannedOpen)} onClick={() => router.push(planTaskSegmentHref("web", intake.planId))} /></div>
      </Card>
    );
  } else if (intake.status === "drafting") {
    body = (
      <Card data-plan-drafting="">
        <p className={styles.muted}>{t(planFlowCopy.draftingBackground)}</p>
        <Skeleton lines={4} />
        <b className={styles.h3}>{t(planFlowCopy.readingTitle)}</b>
        <ul className={styles.railNext}>{intake.reading.map((item) => <li key={item.kind}><Chip label={t(READING[item.kind])} /> {item.detail}</li>)}</ul>
      </Card>
    );
  } else if (intake.status === "background") {
    const step = intake.aiSteps.background;
    const allConfirmed = !currentBlock(intake, editing) && intake.background.purpose.confirmedAt;
    body = (
      <div className={styles.stack}>
        <p className={styles.lead}>{t(planFlowCopy.backgroundLead)}</p>
        {step.state === "fallback" || step.state === "failed" ? (
          step.limit ? <PlanErrorNotice view={{ limit: step.limit, tone: "limit" }} t={t} /> : (
            <div className={`${styles.notice} ${styles.noticeWarn}`} role="status" data-plan-background-fallback="">
              <span className={styles.grow}>{t(planFlowCopy.backgroundFailed)}</span>
              <Button size="sm" label={t(planFlowCopy.retryOnce)} loading={busy === "background"} disabled={Boolean(busy)}
                onClick={() => void act<PlanIntakeView>("background", "other", (key) => planApi(`${base}/background`, { body: { idempotencyKey: key }, language }), (next) => adopt(next, null))} />
            </div>
          )
        ) : null}
        {errorAt("background")}
        <BackgroundBlocks intake={intake} language={language} t={t} me={me} onMe={setMe} team={team} onTeam={setTeam} purposeLevel={purposeLevel} onPurpose={setPurposeLevel}
          editing={editing} onEdit={setEditing} busy={busy} onConfirm={confirmBlock} onAddMembers={addMembers} />
        {errorAt("me") ?? errorAt("team") ?? errorAt("purpose") ?? errorAt("members")}
        {allConfirmed ? (
          <div className={styles.blockActions}>
            <Button variant="primary" icon="sparkle" label={t(planFlowCopy.toQuestions)} loading={busy === "questions"} disabled={Boolean(busy)}
              onClick={() => void act<PlanIntakeView>("questions", "other", (key) => planApi(`${base}/questions`, { body: { idempotencyKey: key }, language }), (next) => adopt(next, intake))} />
          </div>
        ) : null}
        {errorAt("questions")}
      </div>
    );
  } else {
    const purposeText = intake.background.purpose.value.rungs.find((rung) => rung.level === intake.background.purpose.value.selectedLevel)?.text ?? intake.goal;
    const hasDraft = Boolean(draft && intake.status === "drafted");
    const sendPremise = (key: string, value: string) => act<PlanIntakeView>("premise", "other", (actionKey) => planApi(`${base}/premise`, { body: { idempotencyKey: actionKey, key, value }, language, method: "PATCH" }), (next) => {
      adopt(next, intake);
      if (!next.draftId) setDraft(null);
    });
    // With AI revisions made, changing a premise throws the plan and its history away: confirm first.
    const editPremise = (key: string, value: string): Promise<boolean> => (hasDraft && draft && draft.turns.length > 0
      ? new Promise<boolean>((resolve) => setDiscard({ key, resolve, value }))
      : sendPremise(key, value));
    body = (
      <div className={styles.stack}>
        <p className={styles.notice} data-plan-background-done="">
          <span className={styles.grow}>{t(planFlowCopy.backgroundDone, { purpose: purposeText })}</span>
          <span className={styles.label}>{teamSummary(intake, teamDraftOf(intake.background.team.value), t, language)}</span>
        </p>
        {intake.status === "questions" ? (
          <>
            <p className={styles.lead}>{t(planFlowCopy.questionsLead)}</p>
            <QuestionsCard intake={intake} answers={answers} onAnswers={setAnswers} busy={busy} t={t} language={language}
              submitAnswers={() => void act<PlanIntakeView>("answers", "other", (key) => planApi(`${base}/answers`, { body: { answers: answersBody(intake, answers), idempotencyKey: key }, language }), (next) => adopt(next, intake))} />
            {errorAt("answers")}
          </>
        ) : null}
        {intake.premise && intake.status !== "questions" ? (
          <>
            <PremiseCard intake={intake} busy={busy} onEdit={editPremise} collapsed={hasDraft} hasDraft={hasDraft} t={t} language={language}
              onMakeDraft={intake.status === "premise" ? () => void act<PlanDraftView>("draft", "draft", (key) => planApi(`${base}/draft`, { body: { idempotencyKey: key }, language }), (next) => {
                setDraft(next);
                setIntake({ ...intake, draftId: next.draftId, status: "drafted" });
              }) : undefined} />
            {errorAt("premise")}
            {errorAt("draft")}
          </>
        ) : null}
        {intake.status === "drafted" && !draft && draftLoadFailed ? (
          <div data-plan-draft-failed=""><RetryCard title={t(planFlowCopy.draftLoadFailed)} onRetry={() => void load()} /></div>
        ) : null}
        {hasDraft && draft ? (
          <>
            <p className={styles.lead}>{t(planFlowCopy.draftLead)}</p>
            <DraftCard draft={draft} t={t} language={language} />
            <DraftTurns draft={draft} t={t} />
            {errorAt("fix")}
            {errorAt("confirm")}
            <FixBar draft={draft} t={t} busy={busy}
              onFix={(text) => act<PlanDraftView>("fix", "fix", (key) => planApi(`/drafts/${enc(draft.draftId)}/fix`, { body: { idempotencyKey: key, text }, language }), setDraft)}
              onManual={() => router.push(planDraftEditHref("web", draft.draftId))}
              onConfirm={() => void act<PlanConfirmResult>("confirm", "other", (key) => planApi(`/drafts/${enc(draft.draftId)}/confirm`, { body: { idempotencyKey: key }, language }), (result) => router.push(result.href))} />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        {shell}
        <div data-plan-flow={intake.status}>
          {intro}
          {body}
        </div>
        <ConfirmDialog open={Boolean(discard)} destructive title={t(planFlowCopy.discardTitle)} message={t(planFlowCopy.discardBody)} confirmLabel={t(planFlowCopy.discardConfirm)}
          onCancel={() => { discard?.resolve(false); setDiscard(null); }}
          onConfirm={() => {
            const pending = discard;
            setDiscard(null);
            if (!pending || !intake) return;
            void act<PlanIntakeView>("premise", "other", (actionKey) => planApi(`/intakes/${enc(intake.intakeId)}/premise`, { body: { idempotencyKey: actionKey, key: pending.key, value: pending.value }, language, method: "PATCH" }), (next) => {
              adopt(next, intake);
              if (!next.draftId) setDraft(null);
            }).then(pending.resolve);
          }} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

const READING = {
  capabilities: planFlowCopy.readingCapabilities,
  goal: planFlowCopy.readingGoal,
  network: planFlowCopy.readingNetwork,
  profile: planFlowCopy.readingProfile,
} as const;
