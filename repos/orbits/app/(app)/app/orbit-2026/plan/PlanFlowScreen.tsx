"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanConfirmResult, PlanDraftView, PlanIntakeMembersRequest, PlanIntakeView, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planOverviewCopy } from "../copy/plan";
import { standardCopyFor } from "../copy/standard";
import { Icon, Modal, Orbit2026Scope, ToastProvider } from "../ui";
import { BackgroundBlocks, STANCE_COPY, meIsOpen, type BlockKey, type MeDraft } from "./BackgroundBlocks";
import { DraftCard, DraftTurns, draftName } from "./DraftCard";
import { AiBubble, DegradeRow, DialogActs, ErrCard, FlowDialog, FlowHead, FmBar, LimitCard, MeBubble, NgCard, OkLine, RailHead } from "./FlowParts";
import { DraftRail, KnownRail } from "./FlowRail";
import { PremiseCard, QuestionsCard, answeredRows, answersBody, answersBubbleText, initialAnswers, type AnswerDraft } from "./IntakeCards";
import { newActionKey, planApi, type PlanApiResult } from "./plan-api";
import { flowStage, flowSummary, turnPreview, mergeTeamDraft, planErrorView, teamDraftOf, type PlanErrorView, type PlanFlowStage, type TeamDraft } from "./plan-model";
import { STAGE_TITLE, translator, type Translate } from "./PlanParts";
import k from "./FlowKit.module.css";

type FailedAction = { where: string; view: PlanErrorView; retry: () => void };

const enc = encodeURIComponent;
const FM_AT: Record<PlanFlowStage, number> = { background: 0, draft: 2, fix: 3, manual: 4, questions: 1 };

function nextMonthDay(language: OrbitLanguage): string {
  const now = new Date();
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { day: "numeric", month: language === "en" ? "short" : "long" }).format(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

/**
 * ② 生成流程 (`/app/plans/flow/[intakeId]`) — inside iOrbit (b10 ②–⑤ · Web, b12 W-R23-03…19):
 * the iOrbit header (≡ / iOrbit · プランを作る · stage / ＋ 新しい会話), the 5-step bar, the goal
 * and answers as the person's bubbles, iOrbit's words as white bubbles; the right rail holds
 * 「わかったこと」 before the draft and the 「AI 修正」 panel after it.
 */
export function PlanFlowScreen({ intakeId }: { intakeId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const std = standardCopyFor(language);
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
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [plan, setPlan] = useState<PlanV2Detail | null>(null);
  // b12 W-R23-15: after revisions the premises open from the rail (「前提を直す」).
  const [premiseOpen, setPremiseOpen] = useState(false);
  const [reopenAsk, setReopenAsk] = useState(false);

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
    // Read the draft first so the page never flashes the premise step before the draft.
    const read = result.data.draftId ? await planApi<PlanDraftView>(`/drafts/${enc(result.data.draftId)}`, { language }) : null;
    setDraft(read?.ok ? read.data : null);
    setDraftLoadFailed(Boolean(read && !read.ok));
    adopt(result.data, null);
    setEditing(null);
    if (result.data.status === "planned" && result.data.planId) {
      const detail = await planApi<PlanV2Detail>(`/v2/${enc(result.data.planId)}`, { language });
      setPlan(detail.ok ? detail.data : null);
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

  const stage = intake ? flowStage(intake, draft) : "background";
  const planned = intake?.status === "planned";
  const hasDraft = Boolean(intake && draft && intake.status === "drafted");

  const fixAct = useCallback((text: string) => (draft ? act<PlanDraftView>("fix", "fix", (key) => planApi(`/drafts/${enc(draft.draftId)}/fix`, { body: { idempotencyKey: key, text }, language }), setDraft) : Promise.resolve(false)), [act, draft, language]);
  const confirmAct = useCallback(() => {
    if (!draft) return;
    void act<PlanConfirmResult>("confirm", "other", (key) => planApi(`/drafts/${enc(draft.draftId)}/confirm`, { body: { idempotencyKey: key }, language }), (result) => router.push(result.href));
  }, [act, draft, language, router]);

  const limitView = failed?.view.tone === "limit" ? failed.view : null;
  const rail = useMemo(() => {
    if (!intake) return undefined;
    if (planned) {
      // b12 W-R23-19: 確定した方案 (the plan's conclusion) + the footnote.
      return (
        <div className={k.rail} data-plan-rail="planned">
          <RailHead icon="layers">{t(planFlowCopy.plannedRailTitle)}</RailHead>
          <PlannedDiag plan={plan} t={t} language={language} />
          <div className={`${k.card} ${k.flat} ${k.railNote}`}>{t(planOverviewCopy.footnote)}</div>
        </div>
      );
    }
    if (hasDraft && draft) {
      const offMessage = limitView && failed?.where === "fix" ? t(limitView.limit === "monthly" ? planFlowCopy.fixOffMonthly : planFlowCopy.fixOffDaily) : undefined;
      return <DraftRail draft={draft} t={t} busy={busy} onFix={fixAct} onManual={() => router.push(planDraftEditHref("web", draft.draftId))} onConfirm={confirmAct} offMessage={offMessage}
        onPremise={draft.turns.length && !premiseOpen ? () => { setPremiseOpen(true); window.scrollTo({ behavior: "smooth", top: 0 }); } : undefined} />;
    }
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
    return <KnownRail rows={rows} t={t} pending={intake.status === "drafting"} />;
    // t is derived from language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake, draft, answers, language, purposeLevel, me, team, busy, hasDraft, planned, limitView, failed, fixAct, confirmAct, plan, premiseOpen]);

  const subtitle = planned || !intake ? t(planFlowCopy.flowPageTitle) : t(planFlowCopy.flowSubtitle, { flow: t(planFlowCopy.flowPageTitle), stage: t(STAGE_TITLE[stage]) });
  const shell = (
    <FlowHead title={t(planFlowCopy.iorbitTitle)} subtitle={subtitle} rail={rail ?? false}
      left={<Link href="/app/agent" className={`btn ${k.rbtn}`} aria-label={t(planFlowCopy.chatHistory)} data-plan-flow-history=""><Icon name="menu" size={20} /></Link>}
      right={<Link href="/app/agent" className={`btn ${k.headBtn}`} data-plan-flow-newchat=""><Icon name="plus" size={16} />{t(planFlowCopy.newChat)}</Link>} />
  );

  if (loadFailed) {
    return (
      <Orbit2026Scope language={language} className={k.page}>
        {shell}
        <ErrCard title={t(planFlowCopy.loadFailed)} sub={t(planFlowCopy.draftLoadFailedBody)} retryLabel={t(planFlowCopy.retry)} onRetry={() => void load()} data={{ "data-plan-failure": "other" }} />
      </Orbit2026Scope>
    );
  }
  if (!intake) {
    return <Orbit2026Scope language={language} className={k.page}>{shell}<div className={k.wchat} aria-busy><FmBar at={0} t={t} /></div></Orbit2026Scope>;
  }

  const base = `/intakes/${enc(intake.intakeId)}`;
  const notice = failed?.view.tone === "notice" ? failed.view.notice : null;
  const failureAt = (where: string, title: string, body: string) => (failed && failed.where === where && failed.view.tone === "failure"
    ? <NgCard title={title} body={body} retryLabel={t(planFlowCopy.retryOnce)} onRetry={failed.retry} data={{ "data-plan-failure": failed.view.op }} /> : null);
  const stepFailure = (...wheres: string[]) => (failed && wheres.includes(failed.where) && failed.view.tone === "failure"
    ? <NgCard title={t(planFlowCopy.stepFailed)} body={`${std.error.checkConnection}${std.error.inputKept}`} retryLabel={t(planFlowCopy.retryOnce)} onRetry={failed.retry} data={{ "data-plan-failure": failed.view.op }} /> : null);
  const usedNotice = notice === "used" ? <DegradeRow title={t(planFlowCopy.manualUsed)} icon="info" data={{ "data-plan-notice": "used" }} /> : null;
  const staleRow = notice === "stale" ? (
    <DegradeRow title={t(planFlowCopy.stale)} icon="refresh" data={{ "data-plan-notice": "stale" }}
      action={<button type="button" className={`btn ${k.btn} ${k.sm} ${k.onSurface}`} onClick={() => void load()}><Icon name="refresh" size={16} />{t(planFlowCopy.latest)}</button>} />
  ) : null;
  const busyRow = notice === "busy" ? <DegradeRow busy title={t(planFlowCopy.busy)} data={{ "data-plan-notice": "busy" }} /> : null;
  const goalBubble = <MeBubble>{t(planFlowCopy.goalLine, { goal: intake.goal })}</MeBubble>;
  const purposeText = intake.background.purpose.value.rungs.find((rung) => rung.level === intake.background.purpose.value.selectedLevel)?.text ?? intake.goal;

  const confirmBlock = (block: BlockKey) => void act<PlanIntakeView>(block, "other", (key) => patchBlock(intake, block, key), (next) => { adopt(next, intake); setEditing(null); });
  const patchBlock = (from: PlanIntakeView, block: BlockKey, key: string) => {
    const body = block === "me" ? { me: { stance: me.stance!, wants: me.wants.trim() } }
      : block === "team" ? { team: { members: team.members.map((member) => ({ capabilities: member.capabilities, memberId: member.memberId, otherCapabilities: member.otherCapabilities, relation: member.relation })), mode: team.mode } }
      : { purpose: { selectedLevel: purposeLevel! } };
    return planApi<PlanIntakeView>(base, { body: { block, ...body, expectedUpdatedAt: from.updatedAt, idempotencyKey: key }, language, method: "PATCH" });
  };

  /**
   * 「この背景で質問へ」: confirm わたし → チーム → 目的 as they stand (the server keeps the
   * order), then ask for the questions. A changed 「やりたいこと」 redraws the stair first and
   * stops there so the person can pick a rung again.
   */
  const toQuestions = () => void act<PlanIntakeView>("questions", "other", async (key) => {
    let from = intake;
    const meValue = from.background.me.value;
    const wants = me.wants.trim();
    if (wants !== meValue.wants && from.limits.ladderLeft > 0) {
      const ladder = await planApi<PlanIntakeView>(`${base}/ladder`, { body: { idempotencyKey: newActionKey(), wants }, language });
      if (!ladder.ok) return ladder;
      from = ladder.data;
      const me2 = await patchBlock(from, "me", newActionKey());
      if (!me2.ok) return me2;
      return { data: { ...me2.data, __stop: true } as PlanIntakeView, ok: true, status: 200 };
    }
    for (const block of ["me", "team", "purpose"] as const) {
      const step = await patchBlock(from, block, newActionKey());
      if (!step.ok) return step;
      from = step.data;
    }
    return planApi<PlanIntakeView>(`${base}/questions`, { body: { idempotencyKey: key }, language });
  }, (next) => {
    const stop = Boolean((next as PlanIntakeView & { __stop?: boolean }).__stop);
    adopt(next, intake);
    setEditing(null);
    if (stop) setMe((current) => ({ ...current }));
  });

  const addMembers = (body: PlanIntakeMembersRequest) => act<PlanIntakeView>("members", "other", (key) => planApi(`${base}/members`, { body: { ...body, idempotencyKey: key }, language }), (next) => adopt(next, intake));

  const sendPremise = (key: string, value: string) => act<PlanIntakeView>("premise", "other", (actionKey) => planApi(`${base}/premise`, { body: { idempotencyKey: actionKey, key, value }, language, method: "PATCH" }), (next) => {
    adopt(next, intake);
    if (!next.draftId) setDraft(null);
  });
  // With AI revisions made, changing a premise throws the plan and its history away: confirm first.
  const editPremise = (key: string, value: string): Promise<boolean> => (hasDraft && draft && draft.turns.length > 0
    ? new Promise<boolean>((resolve) => setDiscard({ key, resolve, value }))
    : sendPremise(key, value));
  const makeDraft = () => void act<PlanDraftView>("draft", "draft", (key) => planApi(`${base}/draft`, { body: { idempotencyKey: key }, language }), (next) => {
    setDraft(next);
    setIntake({ ...intake, draftId: next.draftId, status: "drafted" });
  });
  const okLine = (
    <OkLine text={t(planFlowCopy.backgroundDone, { purpose: purposeText })} data={{ "data-plan-background-done": "" }}
      action={<button type="button" className={`btn ${k.btn} ${k.sm} ${k.ghost}`} onClick={() => setBackgroundOpen(true)}>{t(planFlowCopy.showBackground)}</button>} />
  );

  let body: React.ReactNode;
  if (planned) {
    body = (
      <>
        <FmBar at={5} t={t} />
        {goalBubble}
        <div className={`${k.okCard} ${k.plannedCard}`} data-plan-planned="">
          <div className={k.row} style={{ gap: 12 }}>
            <span className={k.okmark}><Icon name="check" size={16} /></span>
            <div className={k.grow}><b className={k.plannedTitle}>{t(planFlowCopy.confirmedTitle)}</b><div className={k.lbl}>{plan ? t(planFlowCopy.plannedMeta, { date: new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { day: "numeric", month: language === "en" ? "short" : "long" }).format(new Date(plan.startsOn)), name: purposeText }) + (plan.quota.manualEditAvailable ? "" : ` · ${t(planOverviewCopy.planStatusManual)}`) : purposeText}</div></div>
            <button type="button" className={`btn ${k.btn} ${k.primary}`} onClick={() => router.push(planTaskSegmentHref("web", intake.planId))}>{t(planFlowCopy.plannedOpen)}<Icon name="right" size={16} /></button>
          </div>
        </div>
        <div className={`${k.card} ${k.flat} ${k.plannedLog}`}>
          <div className={k.row}>
            <span className={k.lbl}>{t(planFlowCopy.conversationLog)}</span>
            <div className={k.hist}>
              {intake.background.purpose.value.selectedLevel ? <span className={k.chip}>{t(planFlowCopy.logBackground, { level: intake.background.purpose.value.selectedLevel })}</span> : null}
              {intake.questions?.length ? <span className={k.chip}>{t(planFlowCopy.logQuestions, { count: intake.questions.length })}</span> : null}
              {draft?.aiFixUsed ? <span className={k.chip}>{t(planFlowCopy.logFixes, { count: draft.aiFixUsed })}</span> : null}
              {plan && !plan.quota.manualEditAvailable ? <span className={k.chip}>{t(planFlowCopy.logManual)}</span> : null}
            </div>
          </div>
          <div className={`${k.lbl} ${k.plannedNote}`}>{t(planFlowCopy.viewOnly)}</div>
        </div>
      </>
    );
  } else if (intake.status === "drafting") {
    body = (
      <>
        <FmBar at={0} t={t} />
        {goalBubble}
        <AiBubble>{t(planFlowCopy.draftingAi)}</AiBubble>
        <div className={k.bgGrid} data-plan-drafting="">
          <div className={`${k.card} ${k.teamCard}`}>
            {(["blockMe", "blockTeam", "blockPurpose"] as const).map((key, index) => (
              <div key={key} className={k.bsk}><span className={k.bsn}>{index + 1}</span><b>{t(planFlowCopy[key])}</b>
                <div className={k.shimCol}><i className={k.shim} style={{ width: `${[80, 62, 70][index]}%` }} /><i className={k.shim} style={{ width: `${[46, 54, 38][index]}%` }} /></div></div>
            ))}
          </div>
          <div className={`${k.card} ${k.flat} ${k.teamCard}`}>
            <div className={k.readsHead}>{t(planFlowCopy.readingTitle)}</div>
            <dl className={k.known}>{intake.reading.map((item) => <div key={item.kind}><dt className={k.lbl}>{t(READING[item.kind])}</dt><dd>{item.detail}</dd></div>)}</dl>
          </div>
        </div>
        <div className={k.actRow}><span className={k.lbl}>{t(planFlowCopy.draftingHint)}</span>{/* A status, not a control: it reads as the disabled kit button (b12 W-R23-03). */}<span role="status" className={`${k.btn} ${k.primary} ${k.btnOff}`}>{t(planFlowCopy.draftingButton)}</span></div>
      </>
    );
  } else if (intake.status === "background") {
    const step = intake.aiSteps.background;
    const fallback = step.state === "fallback" || step.state === "failed";
    const meOpen = meIsOpen(intake, me, editing);
    body = (
      <>
        {staleRow}
        <FmBar at={0} t={t} />
        {goalBubble}
        {fallback ? (
          step.limit ? <LimitCard title={t(step.limit === "monthly" ? planFlowCopy.limitMonthly : planFlowCopy.limitDaily)} sub={t(planFlowCopy.limitBackgroundSub)} data={{ "data-plan-limit": step.limit }} /> : (
            <DegradeRow title={t(planFlowCopy.backgroundFailed)} data={{ "data-plan-background-fallback": "" }}
              action={<button type="button" className={`btn ${k.btn} ${k.sm} ${k.onSurface}`} disabled={Boolean(busy)}
                onClick={() => void act<PlanIntakeView>("background", "other", (key) => planApi(`${base}/background`, { body: { idempotencyKey: key }, language }), (next) => adopt(next, null))}><Icon name="refresh" size={16} />{t(planFlowCopy.retryOnce)}</button>} />
          )
        ) : <AiBubble>{t(planFlowCopy.backgroundLead)}</AiBubble>}
        <BackgroundBlocks intake={intake} language={language} t={t} me={me} onMe={setMe} team={team} onTeam={setTeam} purposeLevel={purposeLevel} onPurpose={setPurposeLevel}
          editing={editing} onEdit={setEditing} busy={busy} onConfirm={confirmBlock} onAddMembers={addMembers} fallback={fallback} />
        {stepFailure("me", "team", "purpose", "members", "questions", "background")}
        {usedNotice}
        {fallback && meOpen ? (
          <div className={k.actRow}>
            <span className={k.lbl}>{t(planFlowCopy.stanceFirst)}</span>
            <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={!me.stance || !me.wants.trim() || Boolean(busy)} onClick={() => confirmBlock("me")}>{t(planFlowCopy.confirmMe)}</button>
          </div>
        ) : (
          <div className={k.actRow}>
            {busyRow ?? <span className={k.lbl}>{t(planFlowCopy.bgReflectNote)}</span>}
            <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={!me.stance || !me.wants.trim() || purposeLevel === null || Boolean(busy) || Boolean(busyRow)} aria-busy={busy === "questions" || undefined} onClick={toQuestions} data-plan-to-questions="">
              {t(planFlowCopy.toQuestions)}<Icon name="right" size={16} />
            </button>
          </div>
        )}
      </>
    );
  } else {
    const ans = answersBubbleText(intake);
    const premiseCard = (collapsed: boolean, make?: boolean) => intake.premise ? (
      <PremiseCard intake={intake} busy={busy} onEdit={editPremise} collapsed={collapsed} hasDraft={hasDraft} t={t} language={language}
        onMakeDraft={make ? makeDraft : undefined} makeOff={limitView?.limit === "monthly" && failed?.where === "draft"} />
    ) : null;
    const left = draft ? Math.max(0, draft.aiFixLimit - draft.aiFixUsed) : 0;
    if (intake.status === "questions") {
      body = (
        <>
          {staleRow}
          <FmBar at={1} t={t} />
          {goalBubble}
          {okLine}
          <AiBubble>{t(planFlowCopy.questionsLead, { count: intake.questions?.length ?? 0 })}</AiBubble>
          <QuestionsCard intake={intake} answers={answers} onAnswers={setAnswers} busy={busy} t={t} language={language}
            submitAnswers={() => void act<PlanIntakeView>("answers", "other", (key) => planApi(`${base}/answers`, { body: { answers: answersBody(intake, answers), idempotencyKey: key }, language }), (next) => adopt(next, intake))} />
          {busyRow}
          {stepFailure("answers", "reopen")}
        </>
      );
    } else if (!hasDraft) {
      // premise (and a drafted intake whose draft could not be read: b12 N20b)
      const draftUnread = intake.status === "drafted" && !draft && draftLoadFailed;
      body = (
        <>
          {staleRow}
          <FmBar at={draftUnread ? 2 : 1} t={t} />
          {draftUnread ? null : <>{goalBubble}{okLine}</>}
          {ans ? <MeBubble>{ans}</MeBubble> : null}
          {draftUnread ? premiseCard(true) : (
            <>
              <AiBubble>{t(planFlowCopy.premiseLead)}</AiBubble>
              {premiseCard(false, intake.status === "premise")}
            </>
          )}
          {draftUnread ? <ErrCard title={t(planFlowCopy.draftLoadFailed)} sub={<>{t(planFlowCopy.draftLoadFailedBody)}<br />{t(planFlowCopy.draftLoadKept)}</>} retryLabel={t(planFlowCopy.retry)} onRetry={() => void load()} data={{ "data-plan-draft-failed": "" }} /> : null}
          {failureAt("draft", t(planFlowCopy.draftFailed), t(planFlowCopy.draftFailedBody))}
          {limitView && failed?.where === "draft" ? <LimitCard title={t(limitView.limit === "monthly" ? planFlowCopy.limitMonthly : planFlowCopy.limitDaily)} sub={limitView.limit === "monthly" ? t(planFlowCopy.limitDraftSub, { date: nextMonthDay(language) }) : undefined} data={{ "data-plan-limit": limitView.limit }} /> : null}
          {busyRow}
          {stepFailure("premise", "reopen")}
        </>
      );
    } else if (draft) {
      const usedUp = left === 0;
      body = (
        <>
          {staleRow}
          <FmBar at={FM_AT[stage]} t={t} />
          {draft.turns.length === 0 ? (
            <>
              {ans ? <MeBubble>{ans}</MeBubble> : null}
              {premiseCard(true)}
              <AiBubble>{t(planFlowCopy.draftLead)}</AiBubble>
            </>
          ) : premiseOpen ? premiseCard(false) /* b12 W-R23-15: opened from the rail's 「前提を直す」 */ : null}
          <DraftCard draft={draft} t={t} language={language} mini={usedUp && !premiseOpen} />
          {/* b12 W-R23-14: once used up, only the last round stays (all rounds are in 修正の履歴); W-R23-15: while the
              premises are open the column is premises + plan (changing one discards the rounds). */}
          {premiseOpen ? null : <DraftTurns draft={draft} t={t} only={usedUp ? draft.turns[draft.turns.length - 1]?.n : undefined} />}
          {failureAt("fix", t(planFlowCopy.fixFailed), t(planFlowCopy.fixFailedBody))}
          {limitView && failed?.where === "fix" ? <LimitCard title={t(limitView.limit === "monthly" ? planFlowCopy.limitMonthly : planFlowCopy.limitDaily)} sub={t(planFlowCopy.limitFixSub)} data={{ "data-plan-limit": limitView.limit }} /> : null}
          {usedUp && draft.turns.length ? (
            <div className={`${k.card} ${k.flat} ${k.usedUp}`} data-plan-fix-end="">
              <div className={k.row} style={{ gap: 8 }}><b className={k.usedUpTitle}>{t(planFlowCopy.usedUpTitle, { limit: draft.aiFixLimit })}</b><span className={k.chip}>{t(planFlowCopy.fixLeftChip, { n: 0 })}</span></div>
              <div className={`${k.lbl} ${k.usedUpBody}`}>{t(planFlowCopy.usedUpBody)}</div>
              <div className={`${k.row} ${k.usedUpActs}`}>
                <span className={k.lbl}>{t(planFlowCopy.historyLabel)}</span>
                <div className={k.hist}>{draft.turns.map((turn) => <span key={turn.n} className={k.chip}>{t(planFlowCopy.turnChip, { n: turn.n, text: turn.changes.length ? turnPreview(turn.input) : t(planFlowCopy.noChange) })}</span>)}</div>
                <span className={k.grow} />
                <button type="button" className={`btn ${k.btn}`} disabled={!draft.manualEditAvailable || Boolean(busy)} onClick={() => router.push(planDraftEditHref("web", draft.draftId))}><Icon name="edit" size={16} />{t(planFlowCopy.manualEdit)}</button>
                <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={Boolean(busy)} onClick={confirmAct}>{t(planFlowCopy.confirmPlan)}</button>
              </div>
            </div>
          ) : null}
          {busyRow}
          {stepFailure("confirm", "premise")}
        </>
      );
    }
  }

  return (
    <Orbit2026Scope language={language} className={k.page}>
      <ToastProvider>
        {shell}
        <div className={k.wchat} data-plan-flow={intake.status}>{body}</div>
        <FlowDialog open={Boolean(discard)} role="alertdialog" label={t(planFlowCopy.discardTitle)} onClose={() => { discard?.resolve(false); setDiscard(null); }} data={{ "data-plan-discard": "" }}>
          <div className={`${k.row} ${k.discHead}`}>
            <div className={k.dic}><Icon name="trash" size={24} /></div>
            <div className={k.grow}><b className={k.dialogTitle}>{t(planFlowCopy.discardTitle)}</b><div className={`${k.sub} ${k.discBody}`}>{t(planFlowCopy.discardBody)}</div></div>
          </div>
          <div className={`${k.card} ${k.flat} ${k.discList}`}>
            <div className={k.eff}><Icon name="trash" size={16} />{t(planFlowCopy.discardLoses, { count: draft?.turns.length ?? 0, text: draft?.turns.map((turn) => turnPreview(turn.input)).join(" · ") ?? "" })}</div>
            <div className={k.eff}><Icon name="check" size={16} />{t(planFlowCopy.discardKeeps)}</div>
            <div className={k.eff}><Icon name="refresh" size={16} />{t(planFlowCopy.discardFree)}</div>
          </div>
          <DialogActs hint={std.action.cancel}>
            <button type="button" className={`btn ${k.btn} ${k.btnFocus}`} data-autofocus="" onClick={() => { discard?.resolve(false); setDiscard(null); }}>{std.action.cancel}</button>
            <button type="button" className={`btn ${k.btn} ${k.danger}`} onClick={() => {
              const pending = discard;
              setDiscard(null);
              if (!pending || !intake) return;
              void act<PlanIntakeView>("premise", "other", (actionKey) => planApi(`/intakes/${enc(intake.intakeId)}/premise`, { body: { idempotencyKey: actionKey, key: pending.key, value: pending.value }, language, method: "PATCH" }), (next) => {
                adopt(next, intake);
                setPremiseOpen(false);
                if (!next.draftId) setDraft(null);
              }).then(pending.resolve);
            }}>{t(planFlowCopy.discardConfirm)}</button>
          </DialogActs>
        </FlowDialog>
        <BackgroundModal open={backgroundOpen} onClose={() => setBackgroundOpen(false)} intake={intake} t={t} language={language}
          onReopen={() => { setBackgroundOpen(false); setReopenAsk(true); }} />
        {/* D38: going back to the background throws away the questions, answers, premises and the open draft — asked first. */}
        <FlowDialog open={reopenAsk} role="alertdialog" label={t(planFlowCopy.reopenTitle)} onClose={() => setReopenAsk(false)} data={{ "data-plan-reopen": "" }}>
          <div className={`${k.row} ${k.discHead}`}>
            <div className={k.dic}><Icon name="refresh" size={24} /></div>
            <div className={k.grow}><b className={k.dialogTitle}>{t(planFlowCopy.reopenTitle)}</b><div className={`${k.sub} ${k.discBody}`}>{t(planFlowCopy.reopenBody)}</div></div>
          </div>
          <DialogActs hint={std.action.cancel}>
            <button type="button" className={`btn ${k.btn} ${k.btnFocus}`} data-autofocus="" onClick={() => setReopenAsk(false)}>{std.action.cancel}</button>
            <button type="button" className={`btn ${k.btn} ${k.danger}`} onClick={() => {
              setReopenAsk(false);
              void act<PlanIntakeView>("reopen", "other", (key) => planApi(`/intakes/${enc(intake.intakeId)}/background/reopen`, { body: { expectedUpdatedAt: intake.updatedAt, idempotencyKey: key }, language }), (next) => {
                setDraft(null);
                setDraftLoadFailed(false);
                setPremiseOpen(false);
                adopt(next, null);
                setEditing(null);
              });
            }}>{t(planFlowCopy.reopenConfirm)}</button>
          </DialogActs>
        </FlowDialog>
      </ToastProvider>
    </Orbit2026Scope>
  );
}

/** 「背景を見る」: the confirmed background, read-only (D38: going back to change it needs the server to re-open it). */
function BackgroundModal({ open, onClose, intake, t, language, onReopen }: { open: boolean; onClose: () => void; intake: PlanIntakeView; t: Translate; language: OrbitLanguage; onReopen: () => void }) {
  const rows = flowSummary({
    answers: [],
    intake,
    language,
    noGapText: t(planFlowCopy.railNoGap),
    purposeLevel: intake.background.purpose.value.selectedLevel ?? null,
    setupText: (count, names) => t(planFlowCopy.railTeam, { count, names }),
    soloText: t(planFlowCopy.railSolo),
    stanceLabel: intake.background.me.value.stance ? t(STANCE_COPY[intake.background.me.value.stance]) : null,
    team: teamDraftOf(intake.background.team.value),
    wants: intake.background.me.value.wants,
  }).filter((row) => row.key !== "premise");
  const label = { gaps: planFlowCopy.railGaps, me: planFlowCopy.railMe, purpose: planFlowCopy.railPurpose, setup: planFlowCopy.railSetup, wants: planFlowCopy.railWants } as const;
  return (
    <Modal open={open} onClose={onClose} title={t(planFlowCopy.showBackground)}
      actions={<button type="button" className={`btn ${k.btn}`} onClick={onReopen} data-plan-reopen-open="">{t(planFlowCopy.reopenConfirm)}</button>}>
      <dl className={k.known} data-plan-background-view="">
        {rows.map((row) => <div key={row.key}><dt className={k.lbl}>{t(label[row.key as keyof typeof label])}</dt><dd>{row.value ?? "—"}</dd></div>)}
      </dl>
    </Modal>
  );
}

/** b12 W-R23-19 plannedRail / b10 diagMini: the confirmed plan's conclusion with its status chip and the way back to the chat. */
function PlannedDiag({ plan, t, language }: { plan: PlanV2Detail | null; t: Translate; language: OrbitLanguage }) {
  const [why, setWhy] = useState(false);
  if (!plan) return <div className={`${k.card} ${k.plannedDiag}`} />;
  const basis = [...plan.content.basis.map((item) => item.label), ...plan.content.allocationReasons].join(" · ");
  const status = !plan.quota.manualEditAvailable ? t(planOverviewCopy.planStatusManual)
    : t(planOverviewCopy.planStatusDate, { date: new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { day: "numeric", month: "long" }).format(new Date(`${plan.startsOn.slice(0, 10)}T00:00:00`)) });
  return (
    <div className={`${k.card} ${k.plannedDiag}`}>
      <div className={k.row} style={{ gap: 8 }}>
        <span className={`${k.emo} ${k.emoTeal}`} aria-hidden>🧭</span>
        <b className={k.plannedDiagTitle}>{t(planFlowCopy.plannedRailTitle)}</b>
        <span className={k.chip}>{status}</span>
        {basis ? <button type="button" className={`btn ${k.why}`} aria-expanded={why} aria-label={t(planFlowCopy.plannedRailTitle)} onClick={() => setWhy(!why)}>?</button> : null}
      </div>
      <div className={k.plannedDiagBody} data-plan-diag="">{plan.content.conclusion}</div>
      {why ? <div className={k.whyBody}>{basis}</div> : null}
      <Link href="/app/agent" className={`${k.v2go} ${k.v2goGap}`}>{t(planOverviewCopy.seeConversation)}<Icon name="right" size={16} /></Link>
    </div>
  );
}

const READING = {
  capabilities: planFlowCopy.readingCapabilities,
  goal: planFlowCopy.readingGoal,
  network: planFlowCopy.readingNetwork,
  profile: planFlowCopy.readingProfile,
} as const;
