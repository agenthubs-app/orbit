"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import type {
  PlanAwardResult,
  PlanCandidateView,
  PlanCommandResult,
  PlanEventOption,
  PlanIntroDraftResult,
  PlanPersonTypeDetail,
  PlanProposalResult,
  PlanTalkedOfflineResult,
  PlanV2Detail,
} from "../../../../../shared/contract/plan-v2";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planOverviewCopy as c } from "../copy/plan";
import { ShellPage, useInShell } from "../shell/slots";
import { Avatar, EmptyState, Icon, MacTile, Orbit2026Scope, RetryCard, RingChart, Skeleton, ToastProvider, fillCopy, useStandardCopy, useToast } from "../ui";
import { eventView, ringTone, sortedCandidates, typeDetailState, typeTone, unitsOf, type TypeTone } from "./overview-model";
import { planApi } from "./plan-api";
import { copyText, enc, usePlanWrites, v2Path } from "./plan-v2-actions";
import { IntroDraftDrawer, ProposalDrawer, RecordModal, SkipDialog, type RecordMode, type RecordSubmit } from "./PlanTypeDialogs";
import { translator, type Translate } from "./PlanParts";
import k from "./overview.module.css";
import styles from "./TypeDetail.module.css";

/** 人物タイプ詳細 (`/app/plans/[planId]/types/[itemId]`, b10 ⑧ · b4 A2 Web). */
export function PlanTypeDetailScreen({ planId, itemId }: { planId: string; itemId: string }) {
  const { language } = useOrbitLanguage();
  return (
    <Orbit2026Scope language={language} className={styles.pageV2}>
      <ToastProvider>
        <TypeDetailBody planId={planId} itemId={itemId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

type Load = { status: "loading" } | { status: "failed" } | { status: "missing" } | { status: "ready"; detail: PlanPersonTypeDetail; plan: PlanV2Detail | null };

function TypeDetailBody({ planId, itemId, language }: { planId: string; itemId: string; language: OrbitLanguage }) {
  const t = translator(language);
  const toast = useToast();
  const copy = useStandardCopy();
  const { busy, pending, run } = usePlanWrites(language);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  const [record, setRecord] = useState<{ mode: RecordMode; contactId: string | null } | null>(null);
  const [matches, setMatches] = useState<PlanTalkedOfflineResult["matches"] | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [intro, setIntro] = useState<PlanIntroDraftResult | null>(null);
  const [plus, setPlus] = useState<{ points: number; half: boolean; at: number } | null>(null);
  // R24 复核：「新しく登録」が失敗したら、名前なしで記録するかを聞く。
  const [createFailed, setCreateFailed] = useState(false);

  const read = useCallback(async () => {
    const [type, plan] = await Promise.all([
      planApi<PlanPersonTypeDetail>(v2Path(planId, `/types/${enc(itemId)}`), { language }),
      planApi<PlanV2Detail>(v2Path(planId), { language }),
    ]);
    if (type.ok) setLoad({ detail: type.data, plan: plan.ok ? plan.data : null, status: "ready" });
    else setLoad(type.ok === false && type.error.status === 404 ? { status: "missing" } : { status: "failed" });
  }, [planId, itemId, language]);
  useEffect(() => { void read(); }, [read]);

  const inShell = useInShell();
  const backHref = planTaskSegmentHref("web", planId);
  const back = <Link href={backHref} className={`btn ${k.rbtn}`} aria-label={t(c.backToPlan)} data-plan-back=""><Icon name="left" size={20} /></Link>;
  const ready = load.status === "ready" ? load : null;
  const rail = useMemo(() => (ready ? <TypeRail detail={ready.detail} t={t} language={language} /> : null), [ready?.detail, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const headButtons = ready ? (
    <>
      {ready.detail.skipped ? null : <button type="button" className={`btn ${k.btn} ${k.ghost}`} onClick={() => setSkipOpen(true)} data-plan-skip="">{t(c.skipButton)}</button>}
      <button type="button" className={`btn ${k.btn}`} disabled={ready.detail.skipped} onClick={() => { setMatches(null); setCreateFailed(false); setRecord({ contactId: null, mode: "offline" }); }} data-plan-record-offline=""><Icon name="plus" size={16} />{t(c.recordOffline)}</button>
    </>
  ) : null;
  const shell = ready
    ? <ShellPage title={ready.detail.shortLabel} subtitle={subtitle(ready.detail, ready.plan, t)} left={back} right={headButtons} rightRail={rail ?? false} />
    : <ShellPage title={t(c.typesTitle)} left={back} rightRail={false} />;
  if (load.status === "loading") return <>{shell}<Skeleton lines={6} /></>;
  if (load.status === "failed") return <>{shell}<RetryCard title={t(c.loadTypeFailed)} onRetry={() => void read()} /></>;
  if (load.status === "missing") return <>{shell}<EmptyState title={t(c.typeNotFound)} /></>;

  const { detail, plan } = load;
  const state = typeDetailState(detail);
  const candidates = sortedCandidates(detail.candidates);
  const typePath = (rest = "") => v2Path(planId, `/types/${enc(itemId)}${rest}`);
  const index = plan ? Math.max(0, plan.content.personTypes.findIndex((type) => type.itemId === detail.itemId)) : Math.max(0, detail.letter.charCodeAt(0) - 65);
  const tone = typeTone(index);

  /** R24 复核 M6：「取り消しました」 only when every undo went through; another write running → 処理中. */
  const undo = async (awardLogIds: string[]) => {
    if (pending()) { toast.info(t(c.busyNow)); return; }
    let all = true;
    for (const id of awardLogIds) {
      const done = await run<PlanCommandResult>(`undo:${id}`, { path: v2Path(planId, `/awards/${enc(id)}/undo`) });
      if (!done) { all = false; break; }
    }
    await read();
    if (all) toast.success(t(c.undoneToast));
  };
  /** The result of one record: points with 元に戻す, or why nothing was added. */
  const feedback = (award: PlanAwardResult) => {
    if (award.part === "none" || !award.awardLogId) {
      const reason = award.reason === "anonymous_over_target" ? c.reasonAnonymousOver : award.reason === "skipped" ? c.reasonSkipped : c.reasonAlready;
      toast.info(t(reason));
      return;
    }
    const id = award.awardLogId;
    setPlus({ at: Date.now(), half: award.part === "overflow", points: award.points });
    toast.success(t(award.part === "overflow" ? c.awardHalfToast : c.awardToast, { points: award.points }), { undo: () => void undo([id]) });
  };
  const submitRecord = async (submit: RecordSubmit) => {
    if (submit.kind === "talked") {
      const award = await run<PlanAwardResult>("record", { body: { basis: "talked", contactId: submit.contactId, ...(submit.at ? { at: submit.at } : {}) }, path: typePath("/awards") });
      if (!award) return;
      setRecord(null);
      await read();
      feedback(award);
      return;
    }
    const base = submit.kind === "offline" ? { name: submit.name } : submit.kind === "offlineMatch" ? { contactId: submit.contactId } : submit.kind === "offlineNew" ? { createContact: true, name: submit.name } : { anonymous: true };
    const body = submit.at ? { ...base, at: submit.at } : base;
    setCreateFailed(false);
    const result = await run<PlanTalkedOfflineResult>("record", { body, path: typePath("/talked-offline") },
      (error) => { if (submit.kind === "offlineNew" && error.reason === "CONTACT_CREATE_FAILED") { setCreateFailed(true); return true; } return false; });
    if (!result) return;
    if (!result.award && result.matches?.length) { setMatches(result.matches); return; }
    setRecord(null);
    setMatches(null);
    await read();
    if (result.award) feedback(result.award);
  };
  const recordSelected = async () => {
    const ids: string[] = [];
    let points = 0;
    let halves = 0;
    const notes: PlanAwardResult[] = [];
    for (const contactId of selected) {
      const award = await run<PlanAwardResult>("record", { body: { basis: "talked", contactId }, path: typePath("/awards") });
      if (!award) break;
      if (award.awardLogId && award.part !== "none") { ids.push(award.awardLogId); points += award.points; if (award.part === "overflow") halves += 1; } else notes.push(award);
    }
    setSelected([]);
    await read();
    // R24 复核 m11：the server's `part` says which points were half.
    const half = halves > 0;
    if (ids.length === 1 && notes.length === 0) { setPlus({ at: Date.now(), half, points }); toast.success(t(half ? c.awardHalfToast : c.awardToast, { points }), { undo: () => void undo(ids) }); }
    else if (ids.length) { setPlus({ at: Date.now(), half: halves === ids.length, points }); toast.success(t(half ? c.awardsHalfToast : c.awardsToast, { n: ids.length, points }), { undo: () => void undo(ids) }); }
    else if (notes[0]) feedback(notes[0]);
  };

  const skip = async () => {
    const done = await run<PlanCommandResult>("skip", { path: typePath("/skip") });
    setSkipOpen(false);
    if (!done) return;
    const before = detail.earned;
    await read();
    toast.success(t(c.skippedToast, { points: Math.max(0, detail.allocation - before) }), { undo: () => void unskip() });
  };
  const unskip = async () => {
    const done = await run<PlanCommandResult>("unskip", { method: "DELETE", path: typePath("/skip") });
    if (!done) return;
    await read();
    toast.success(t(c.unskippedToast));
  };
  const makeIntro = async (viaContactId: string) => {
    const draft = await run<PlanIntroDraftResult>(`intro:${viaContactId}`, { body: { viaContactId }, path: typePath("/intro-drafts") });
    if (draft) setIntro(draft);
  };
  const propose = (contactId: string, slots: string[]) => run<PlanProposalResult>(`propose:${contactId}`, { body: { contactId, slots }, path: typePath("/proposals") });

  const skipped = detail.skipped;
  const event = plan ? eventView(plan) : null;
  const copyQuestions = () => void copyText(detail.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")).then((ok) => ok && toast.success(copy.toast.copied));
  const copyOpener = () => void copyText(detail.opener ?? "").then((ok) => ok && toast.success(copy.toast.copied));
  const routes = detail.introRoutes.map((route) => (
    <div key={route.viaContactId} className={styles.v22route} data-plan-route={route.viaContactId}>
      <Avatar name={route.viaName} size="sm" />
      {state === "none" ? null : <><span className={styles.arr}><Icon name="right" size={16} /></span><span className={styles.ghavs} aria-hidden><span className={styles.ghav}>?</span><span className={styles.ghav}>?</span></span></>}
      <div className={styles.rm}>{state === "none" ? <b>{route.viaName}</b> : <b>{t(c.routeTitleVia, { name: route.viaName })}</b>}<br />{route.why}</div>
      <button type="button" className={`btn ${k.btn} ${k.sm}`} aria-busy={busy === `intro:${route.viaContactId}` || undefined} disabled={busy !== null} onClick={() => void makeIntro(route.viaContactId)}><Icon name="mail" size={16} />{t(c.makeIntroV2)}</button>
    </div>
  ));
  return (
    <div data-plan-type={detail.itemId} data-state={state}>
      {shell}
      {/* Outside the shell (a page on its own, tests) the header buttons and the rail stay on the page. */}
      {inShell ? null : <div className={k.goalRow}>{back}<div className={k.acts}>{headButtons}</div></div>}
      <div className={k.wgrid}>
        <HeadCard detail={detail} plan={plan} plus={plus} tone={tone} t={t} busy={busy} onUnskip={() => void unskip()} language={language} />

        {state === "none" ? (
          <section className={`${k.card} ${k.span5}`} data-plan-persona="">
            <PersonaBlock detail={detail} t={t} />
            {detail.opener ? (
              <>
                <div className={styles.secHead}><b className={styles.sec}>{t(c.openerTitle)}</b><button type="button" className={`btn ${k.btn} ${k.sm} ${k.ghost}`} onClick={copyOpener}><Icon name="copy" size={16} />{copy.action.copy}</button></div>
                <p className={styles.quoteV2} data-plan-opener="">{t(c.quoteMarks, { text: detail.opener })}</p>
              </>
            ) : null}
            {routes.length ? <div className={styles.routeBlock} data-plan-routes=""><b className={styles.sec}>{t(c.routesTitle)}</b><span className={k.lbl}>{t(c.routesNote)}</span>{routes}</div> : null}
          </section>
        ) : (
          <section className={`${k.card} ${k.span5}`} data-plan-about="">
            <WhyBlock detail={detail} t={t} />
            <div className={styles.secHead}><b className={styles.sec}>{t(c.questionsTitle)}</b><button type="button" className={`btn ${k.btn} ${k.sm} ${k.ghost}`} onClick={copyQuestions}><Icon name="copy" size={16} />{copy.action.copy}</button></div>
            <div data-plan-questions="">{detail.questions.map((question, n) => <div key={n} className={styles.v22qn}><span className={styles.qn}>{n + 1}</span><span>{question}</span></div>)}</div>
            {skipped ? null : <CountRules detail={detail} t={t} />}
            {detail.recognizeHints.length && !skipped ? (
              <>
                <b className={styles.sec} style={{ margin: "12px 0 2px" }}>{t(c.hintsTitle)}</b>
                <div data-plan-hints="">
                  {detail.recognizeHints.map((hint) => {
                    const [line] = labelledLines(hint);
                    const chips = (line?.value ?? hint).split(/\s*[/／]\s*/u).filter(Boolean);
                    return line?.label
                      ? <div key={hint} className={styles.v22sig}><span className={k.lbl}>{line.label}</span><div className={k.chips}>{chips.map((chip) => <span key={chip} className={k.chip}>{chip}</span>)}</div></div>
                      : <div key={hint} className={`${k.chips} ${styles.hintChips}`}>{chips.map((chip) => <span key={chip} className={k.chip}>{chip}</span>)}</div>;
                  })}
                </div>
              </>
            ) : null}
            {detail.tasks.length ? (
              <div data-plan-tasks="">
                <b className={styles.sec} style={{ margin: "12px 0 2px" }}>{t(c.tasksTitle)}</b>
                {detail.tasks.map((task) => <div key={task.taskId} className={styles.v22qn}><span className={k.grow}>{task.title}</span>{task.dueDate ? <span className={k.lbl}>{task.dueDate}</span> : null}</div>)}
              </div>
            ) : null}
          </section>
        )}

        {state === "none" ? (
          <section className={`${k.card} ${k.span7}`} data-plan-events="">
            <div className={k.cardH}><h3>{t(c.eventsTitle)}</h3>{event && event.allocation > 0 ? <span className={k.lbl}>{t(c.eventsNoteV2, { n: event.unit })}</span> : null}</div>
            {detail.events.length ? <EventTable events={detail.events} language={language} t={t} /> : <p className={k.lbl}>{t(c.eventsEmpty)}</p>}
          </section>
        ) : (
          <section className={`${k.card} ${k.span7}`} data-plan-candidates="">
            <div className={k.cardH}>
              <h3>{t(c.candidatesTitleV2)}</h3>
              {selected.length && !skipped ? (
                <div className={k.row} data-plan-select-bar="">
                  <span className={k.lbl}><b style={{ color: "var(--ink)" }}>{t(c.selectedPeople, { n: selected.length })}</b>{t(c.selectedSuffix)}</span>
                  <button type="button" className={`btn ${k.btn} ${k.sm}`} disabled={busy !== null} aria-busy={busy === "record" || undefined} onClick={() => void recordSelected()} data-plan-record-selected="">{t(c.alreadyTalked)}</button>
                  <button type="button" className={`btn ${k.btn} ${k.sm} ${k.primary}`} onClick={() => setProposalOpen(true)} data-plan-propose="">{t(c.propose)}</button>
                </div>
              ) : <span className={k.lbl}>{t(c.peopleCount, { n: candidates.length })}</span>}
            </div>
            {candidates.length ? (
              <div className={skipped ? k.faded ?? styles.faded : undefined}>
                <CandidateTable candidates={candidates} selected={selected} disabled={skipped || busy !== null} language={language} t={t}
                  onToggle={(id, on) => setSelected(on ? [...selected, id] : selected.filter((value) => value !== id))} />
              </div>
            ) : <p className={k.lbl}>{t(c.noCandidates)}</p>}
            {skipped ? <div className={k.lbl} style={{ marginTop: 12 }}>{t(c.unskipRestores)}</div> : null}
            {detail.talked.length ? (
              <div className={styles.talkedRow} data-plan-talked="">
                <span className={styles.okmark}><Icon name="check" size={16} /></span>
                <span>{t(c.talkedPeople, { n: detail.talked.length, names: detail.talked.map((item) => t(c.talkedName, { date: `${shortDay(item.at, language)} ${t(basisLabel(item.basis))}`, name: item.anonymous || !item.name ? t(c.talkedAnonymous) : item.name })).join(" · ") })}</span>
              </div>
            ) : null}
            {skipped ? null : routes}
          </section>
        )}
      </div>

      {inShell || !rail ? null : <div className={k.inlineRail}>{rail}</div>}
      <RecordModal open={Boolean(record)} detail={detail} initialMode={record?.mode ?? "talked"} initialContactId={record?.contactId} matches={matches ?? null} busy={busy === "record"} createFailed={createFailed} t={t}
        onClose={() => { setRecord(null); setMatches(null); setCreateFailed(false); }} saveRecord={(submit) => void submitRecord(submit)} />
      <SkipDialog open={skipOpen} label={detail.shortLabel} points={Math.max(0, detail.allocation - detail.earned)} busy={busy === "skip"} t={t} onCancel={() => setSkipOpen(false)} onConfirm={() => void skip()} />
      <ProposalDrawer open={proposalOpen} people={candidates.filter((candidate) => selected.includes(candidate.contactId))} t={t} onClose={() => setProposalOpen(false)} onPropose={propose} />
      <IntroDraftDrawer draft={intro} typeLabel={detail.shortLabel} roleSituation={detail.roleSituation} t={t} onClose={() => setIntro(null)} />
    </div>
  );
}

function subtitle(detail: PlanPersonTypeDetail, plan: PlanV2Detail | null, t: Translate): string {
  const steps = stepNumbers(detail, plan).join(t(planFlowCopy.listSeparator));
  if (!steps) return t(c.typeSubtitleV2NoStep, { points: detail.allocation });
  return typeDetailState(detail) === "none" ? t(c.typeSubtitleNone, { points: detail.allocation, steps }) : t(c.typeSubtitleV2, { points: detail.allocation, steps });
}

function stepNumbers(detail: PlanPersonTypeDetail, plan: PlanV2Detail | null): number[] {
  if (!plan) return [];
  return plan.content.steps.flatMap((step, index) => (detail.stepKeys.includes(step.key) ? [index + 1] : []));
}

/** 「ラベル：値」 lines (persona, recognize hints) become label / value rows; other text stays one paragraph. */
function labelledLines(text: string): { label: string | null; value: string }[] {
  const lines = text.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const match = /^([^：:]{1,10})[：:]\s*(.+)$/u.exec(line);
    return match ? { label: match[1]!, value: match[2]! } : { label: null, value: line };
  });
}

/** 最終接点：8 周内写相对时间（「2週間前」，b4 #11 VCC 第 3 行），更早写日期（同 App relativeDays）。 */
function agoText(at: string, language: OrbitLanguage, t: Translate): string {
  const days = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 86_400_000));
  if (days < 14) return t(c.daysAgo, { count: days });
  if (days < 56) return t(c.weeksAgo, { count: Math.round(days / 7) });
  return shortDay(at, language);
}

function shortDay(at: string, language: OrbitLanguage): string {
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric" }).format(new Date(at));
}

function basisLabel(basis: string) {
  return basis === "self_report" ? c.basisSelf : basis === "memo" ? c.basisMemo : basis === "event" ? c.basisEvent : c.basisTalked;
}

/** kit .why 「?」 that opens the reason below. */
function useWhy() {
  const std = useStandardCopy();
  const [open, setOpen] = useState(false);
  const button = <button type="button" className={`btn ${k.why}`} aria-expanded={open} aria-label={std.aiCard.showWhy} onClick={() => setOpen(!open)}>?</button>;
  const text = (reason: string) => fillCopy(std.aiCard.why, { reason });
  return { button, open, text };
}

/** b4 .k-wvhead: tile · 「役割 × 状況」 · three cells · points and bar; skipped adds the 習熟済み row. */
function HeadCard({ detail, plan, plus, tone, t, busy, onUnskip, language }: { detail: PlanPersonTypeDetail; plan: PlanV2Detail | null; plus: { points: number; half: boolean; at: number } | null; tone: TypeTone; t: Translate; busy: string | null; onUnskip: () => void; language: OrbitLanguage }) {
  const stats = plan?.typeStats?.find((item) => item.itemId === detail.itemId);
  const candidates = detail.candidates.length;
  const events = stats?.events ?? detail.events.length;
  const routes = detail.introRoutes.length;
  const points = detail.earned + detail.overflow;
  return (
    <section className={`${k.card} ${k.span12}`} data-plan-type-head="">
      <div className={styles.headRow}>
        <MacTile emoji={detail.emoji} tone={tone} />
        <div className={k.grow}>
          <div className={k.v22tk}>{t(c.typeHeadKicker, { label: detail.shortLabel })}</div>
          <b className={styles.headName}>{detail.roleSituation}</b>
        </div>
        <div className={`${k.v22m3} ${styles.m3Head}`}>
          <div data-cell="candidates" className={candidates === 0 ? k.z : undefined}><b>{candidates}<small>{t(c.typeCellPeople)}</small></b><span>{t(candidates === 0 ? c.typeNone : planFlowCopy.sampleCandidates)}</span></div>
          <div data-cell="events" className={events === 0 ? k.z : undefined}><b>{events}</b><span>{t(planFlowCopy.sampleEvents)}</span></div>
          <div data-cell="routes" className={routes === 0 ? k.z : undefined}><b>{routes}</b><span>{t(planFlowCopy.sampleRoutes)}</span></div>
        </div>
        <div className={styles.headScore}>
          <div className={styles.scoreLine}>
            <span className={styles.mid} data-plan-type-earned={points}>
              {points}
              {plus ? <span key={plus.at} className={`${styles.plusfx} ${plus.half ? styles.plusfxHalf : ""}`} aria-hidden>+{plus.points}</span> : null}
            </span>
            <span className={k.lbl}>{detail.skipped ? t(c.typeHeadSkipped, { allocation: detail.allocation }) : t(c.typeHeadScore, { allocation: detail.allocation, met: detail.metCount, target: detail.targetCount })}</span>
          </div>
          {detail.skipped ? <div className={`${k.v2mb} ${k.mbSk}`} aria-hidden data-plan-type-bar="skipped" /> : (
            <div className={k.v2mb} aria-hidden>
              <b style={{ width: `${(Math.min(detail.allocation, detail.earned) / Math.max(1, detail.allocation + detail.overflow)) * 100}%` }} />
              {detail.overflow > 0 ? <b className={k.bo} style={{ width: `${(detail.overflow / Math.max(1, detail.allocation + detail.overflow)) * 100}%` }} /> : null}
            </div>
          )}
        </div>
      </div>
      {detail.skipped ? (
        <div className={styles.skipRow} data-plan-banner="skipped">
          <i className={styles.hatch} aria-hidden />
          <div className={k.grow}><b>{t(c.skippedBanner)}</b><div className={k.lbl}>{[detail.skippedAt ? new Intl.DateTimeFormat(language, { day: "numeric", month: "long" }).format(new Date(detail.skippedAt)) : null, t(c.skippedNote)].filter(Boolean).join(" · ")}</div></div>
          <button type="button" className={`btn ${k.btn} ${k.sm}`} disabled={busy !== null} aria-busy={busy === "unskip" || undefined} onClick={onUnskip} data-plan-unskip="">{t(c.unskip)}</button>
        </div>
      ) : null}
    </section>
  );
}

function WhyBlock({ detail, t }: { detail: PlanPersonTypeDetail; t: Translate }) {
  return (
    <div data-plan-why="">
      <div className={k.row}><b className={`${styles.sec} ${k.grow}`}>{t(c.whyTitle)}</b></div>
      <div className={styles.whyText}>{detail.why}</div>
    </div>
  );
}

/** 人物像 (b4 .k-wpersona): the persona text, 「?」 = why this type. */
function PersonaBlock({ detail, t }: { detail: PlanPersonTypeDetail; t: Translate }) {
  const why = useWhy();
  return (
    <div>
      <div className={k.cardH} style={{ marginBottom: 2 }}><h3>{t(c.personaTitle)}</h3>{detail.why ? why.button : null}</div>
      {why.open ? <div className={k.whyBody} style={{ margin: "0 0 8px" }}>{why.text(detail.why)}</div> : null}
      {labelledLines(detail.persona ?? detail.why).map((line, index) => (
        <div key={index} className={line.label ? styles.kvRow : styles.kv}>{line.label ? <span className={k.lbl}>{line.label}</span> : null}<span>{line.value}</span></div>
      ))}
    </div>
  );
}

/** 話せたの判定 (b4 .k-wvjudge): three rules with their points. */
function CountRules({ detail, t }: { detail: PlanPersonTypeDetail; t: Translate }) {
  const units = unitsOf(detail.allocation, detail.targetCount);
  const base = units.last === null ? `+${units.points}` : `+${units.points} / +${units.last}`;
  const half = Math.floor((detail.unitPoints[0] ?? 0) / 2);
  return (
    <div data-plan-count="">
      <b className={styles.sec} style={{ margin: "12px 0 8px" }}>{t(c.countTitle)}</b>
      <div className={styles.v22rule}><Icon name="check" size={16} /><span>{t(c.countBase)}</span><b className={styles.pt}>{base}</b></div>
      <div className={styles.v22rule}><Icon name="plus" size={16} /><span>{t(c.countOverflow, { n: detail.targetCount })}</span><b className={styles.pt}>+{half}</b></div>
      <div className={styles.v22rule}><Icon name="user" size={16} /><span>{t(c.countAnonymous, { n: detail.targetCount })}</span><b className={styles.pt}>+{units.points}</b></div>
    </div>
  );
}

/** 候補表 (b4 .k-wcands): ☐ · 推薦度 · 名前 · 理由 + 切り出し方 (「?」 = 根拠); a selected row is grey. */
function CandidateTable({ candidates, selected, disabled, language, t, onToggle }: {
  candidates: PlanCandidateView[];
  selected: string[];
  disabled: boolean;
  language: OrbitLanguage;
  t: Translate;
  onToggle: (contactId: string, on: boolean) => void;
}) {
  return (
    <table className={styles.tableV2}>
      <thead>
        <tr><th aria-hidden /><th>{t(c.colScore)}</th><th>{t(c.colName)}</th><th>{t(c.colReason)}</th></tr>
      </thead>
      <tbody>
        {candidates.map((candidate) => <CandidateRow key={candidate.contactId} candidate={candidate} on={selected.includes(candidate.contactId)} disabled={disabled} language={language} t={t} onToggle={onToggle} />)}
      </tbody>
    </table>
  );
}

function CandidateRow({ candidate, on, disabled, language, t, onToggle }: { candidate: PlanCandidateView; on: boolean; disabled: boolean; language: OrbitLanguage; t: Translate; onToggle: (contactId: string, on: boolean) => void }) {
  const why = useWhy();
  const basis = candidate.basis.map((item) => item.label).join(" · ");
  return (
    <tr data-candidate={candidate.contactId} data-selected={on ? "" : undefined}>
      <td><button type="button" role="checkbox" aria-checked={on} aria-label={t(c.selectPerson, { name: candidate.name })} className={`btn ${k.cbx} ${on ? k.cbxOn : ""}`} disabled={disabled} onClick={() => onToggle(candidate.contactId, !on)}><Icon name="check" size={16} /></button></td>
      <td><b className={styles.recNum} data-recommend={candidate.recommendScore}>{candidate.recommendScore}</b></td>
      <td className={styles.nameCell}>
        <div className={k.row}>
          <Avatar name={candidate.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <b>{candidate.name}</b>{candidate.isOrbitUser ? <> <span className={`${k.chip} ${k.chip_teal}`}>{t(c.orbitChip)}</span></> : null}
            <div className={k.lbl}>{[candidate.company, candidate.role].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      </td>
      <td className={styles.reasonCell}>
        <div className={k.row} style={{ alignItems: "flex-start" }}><span style={{ flex: 1 }}>{candidate.reason ?? ""}</span>{basis ? why.button : null}</div>
        {candidate.opener ? <div className={styles.opLine}>💬 <b>{t(c.quoteMarks, { text: candidate.opener })}</b> <span className={k.lbl}>· {candidate.lastContactAt ? t(c.lastContactOn, { date: agoText(candidate.lastContactAt, language, t) }) : t(c.noContact)}</span></div> : null}
        {why.open ? <div className={k.whyBody}>{why.text(basis)}</div> : null}
      </td>
    </tr>
  );
}

const CRITERIA = { confidence: c.criterionConfidence, connections: c.criterionConnections, fit: c.criterionFit, format: c.criterionFormat, timeCost: c.criterionTimeCost } as const;

/** kit V2.evRing: 42 / 5 ring, the score in 12 px numerals in the middle. */
function EventRing({ score, label }: { score: number; label: string }) {
  return (
    <span className={styles.ringWrap}>
      <RingChart size={42} stroke={5} segments={[{ color: ringColor(score), value: score / 100 }]} label={label} />
      <span className={styles.ringNum} aria-hidden>{score}</span>
    </span>
  );
}

/**
 * 右栏活动行的「日时 · 会場」（同概要 RecommendedEvents / b4 #11 右栏）：当天 17 点后写「今夜 19:00」；
 * 日文日期以全角括号结尾，「· 」前不再空格（「10月16日（金）· 東京国際フォーラム」）。
 */
function eventWhereLine(startsAt: string, venue: string | null, language: OrbitLanguage, t: Translate): string {
  const start = new Date(startsAt);
  const tonight = start.toDateString() === new Date().toDateString() && start.getHours() >= 17;
  const when = tonight ? t(c.eventTonight, { time: `${start.getHours()}:${String(start.getMinutes()).padStart(2, "0")}` }) : eventDay(startsAt, language);
  if (!venue) return when.trimEnd();
  return `${when}${when.endsWith(" ") || when.endsWith("）") ? "" : " "}· ${venue}`;
}

/** 「10月16日（金）」 in Japanese (full-width brackets as in the design); the platform's format elsewhere. */
function eventDay(startsAt: string, language: OrbitLanguage): string {
  const date = new Date(startsAt);
  if (language !== "ja") return new Intl.DateTimeFormat(language, { day: "numeric", month: "long", weekday: "short" }).format(date);
  const day = new Intl.DateTimeFormat("ja-JP", { day: "numeric", month: "long" }).format(date);
  const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date);
  return `${day}（${weekday}）`;
}

function ringColor(score: number): `var(--${string})` {
  const tone = ringTone(score);
  return tone === "high" ? "var(--plum-700)" : tone === "mid" ? "var(--plum-500)" : "var(--rose-500)";
}

/** 会える活動 (b4 .k-wevs · b12 W-R24-08): ring · event · this type (est.) · fee · 内訳 (5 fixed items). */
function EventTable({ events, language, t }: { events: readonly PlanEventOption[]; language: OrbitLanguage; t: Translate }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <table className={styles.tableV2}>
      <thead><tr><th>{t(c.colEventScore)}</th><th>{t(c.colEvent)}</th><th>{t(c.colEventType)}</th><th>{t(c.colFee)}</th><th aria-hidden /></tr></thead>
      <tbody>
        {events.map((option) => {
          const on = open === option.eventId;
          return (
            <Fragment key={option.eventId}>
              <tr data-plan-event-option={option.eventId} data-selected={on ? "" : undefined}>
                <td><span data-ring={ringTone(option.score.total)} style={{ display: "inline-block" }}><EventRing score={option.score.total} label={t(c.colEventScore)} /></span></td>
                <td><b>{option.title}</b><div className={k.lbl}>{eventWhereLine(option.startsAt, option.venue, language, t)}</div></td>
                <td>{option.expectedCount !== null ? <span className={`${k.chip} ${k.chip_lav}`}>{t(c.expectedV2, { n: option.expectedCount })}</span> : <span className={k.lbl}>—</span>}</td>
                <td className={k.lbl}>{option.fee === undefined || option.fee === null ? "—" : option.fee === 0 ? t(c.feeFree) : `¥${option.fee.toLocaleString("ja-JP")}`}</td>
                <td style={{ textAlign: "right" }}><button type="button" className={`btn ${styles.evtg}`} aria-expanded={on} onClick={() => setOpen(on ? null : option.eventId)}>{t(c.breakdown)}<Icon name={on ? "down" : "right"} size={16} /></button></td>
              </tr>
              {on ? (
                <tr data-selected="" data-plan-breakdown={option.eventId}>
                  <td />
                  <td colSpan={4} style={{ borderTop: 0, paddingTop: 0 }}>
                    <div className={styles.e5}>
                      {option.score.scoreBreakdown.map((item) => (
                        <div key={item.criterion} className={styles.e5r} data-criterion={item.criterion} data-estimated={item.estimated ? "" : undefined}>
                          <span className={styles.e5l}>{t(CRITERIA[item.criterion])}</span>
                          <div className={styles.e5b}><i style={{ width: `${item.max ? (item.score / item.max) * 100 : 0}%` }} /></div>
                          <b>{item.score}<small> / {item.max}</small></b>
                          {item.facts.length ? <div className={styles.e5f}>{item.facts.join(" · ")}</div> : null}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Right rail (b4 / b12 typeRail): ask about this type · events that meet this type · drafts only. */
function TypeRail({ detail, t, language }: { detail: PlanPersonTypeDetail; t: Translate; language: OrbitLanguage }) {
  return (
    <div className={k.rail} data-plan-type-rail="">
      <h2 className={k.railH}><Icon name="sparkle" size={16} />iOrbit</h2>
      <button type="button" className={`btn ${k.assistIn}`} onClick={() => window.dispatchEvent(new CustomEvent("orbit:open-palette"))}><Icon name="sparkle" size={16} />{t(c.railAskType)}</button>
      {detail.events.length ? (
        <>
          <h2 className={k.railH}>{t(c.railTypeEvents)}</h2>
          <div className={`${k.card} ${styles.railEvents}`}>
            {detail.events.slice(0, 2).map((option) => (
              <div key={option.eventId} className={styles.evRow}>
                <EventRing score={option.score.total} label={t(c.colEventScore)} />
                <div className={styles.evMeta}>
                  <b>{option.title}</b>
                  <span className={k.lbl}>{eventWhereLine(option.startsAt, option.venue, language, t)}</span>
                  {option.fitLabel ? <span className={`${k.chip} ${k.chip_lav}`}>{option.fitLabel}</span> : option.expectedCount !== null ? <span className={`${k.chip} ${k.chip_lav}`}>{t(c.expectedV2, { n: option.expectedCount })}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className={`${k.card} ${k.flat} ${k.railNote}`}>{t(c.railDraftNote)}</div>
    </div>
  );
}
