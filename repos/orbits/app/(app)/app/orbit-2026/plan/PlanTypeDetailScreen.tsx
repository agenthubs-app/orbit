"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  PlanAwardResult,
  PlanCandidateDecisionResult,
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
import { ShellPage } from "../shell/slots";
import { Avatar, Button, Card, Checkbox, Chip, EmptyState, IconButton, MacTile, Orbit2026Scope, ProgressBar, RetryCard, SampleTag, Skeleton, ToastProvider, useStandardCopy, useToast } from "../ui";
import { eventView, ringTone, sortedCandidates, typeDetailState, unitsOf } from "./overview-model";
import { planApi } from "./plan-api";
import { copyText, enc, usePlanWrites, v2Path } from "./plan-v2-actions";
import { IntroDraftDrawer, ProposalDrawer, RecordModal, SkipDialog, type RecordMode, type RecordSubmit } from "./PlanTypeDialogs";
import { translator, type Translate } from "./PlanParts";
import styles from "./overview.module.css";

/** 人物タイプ詳細 (`/app/plans/[planId]/types/[itemId]`, b10 ⑧ · b4 A2 Web). */
export function PlanTypeDetailScreen({ planId, itemId }: { planId: string; itemId: string }) {
  const { language } = useOrbitLanguage();
  return (
    <Orbit2026Scope language={language} className={styles.page}>
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
  const [talkedOpen, setTalkedOpen] = useState(false);
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

  const backHref = planTaskSegmentHref("web", planId);
  const shell = load.status === "ready" ? <ShellPage title={load.detail.shortLabel} subtitle={subtitle(load.detail, load.plan, t)} rightRail={false} /> : <ShellPage title={t(c.typesTitle)} rightRail={false} />;
  const back = <Link href={backHref} className={styles.mailLink} data-plan-back=""><span aria-hidden>←</span>{t(c.backToPlan)}</Link>;
  if (load.status === "loading") return <>{shell}<Skeleton lines={6} /></>;
  if (load.status === "failed") return <>{shell}<div className={styles.toolbar}>{back}</div><RetryCard title={t(c.loadTypeFailed)} onRetry={() => void read()} /></>;
  if (load.status === "missing") return <>{shell}<div className={styles.toolbar}>{back}</div><EmptyState title={t(c.typeNotFound)} /></>;

  const { detail, plan } = load;
  const state = typeDetailState(detail);
  const candidates = sortedCandidates(detail.candidates);
  const typePath = (rest = "") => v2Path(planId, `/types/${enc(itemId)}${rest}`);

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
      const award = await run<PlanAwardResult>("record", { body: { basis: "talked", contactId: submit.contactId }, path: typePath("/awards") });
      if (!award) return;
      setRecord(null);
      await read();
      feedback(award);
      return;
    }
    const body = submit.kind === "offline" ? { name: submit.name } : submit.kind === "offlineMatch" ? { contactId: submit.contactId } : submit.kind === "offlineNew" ? { createContact: true, name: submit.name } : { anonymous: true };
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
  const decide = async (candidate: PlanCandidateView, decision: "accept" | "dismiss") => {
    const done = await run<PlanCandidateDecisionResult>(`decide:${candidate.contactId}`, { body: { decision }, path: typePath(`/candidates/${enc(candidate.contactId)}/decision`) });
    if (!done) return;
    setSelected((current) => current.filter((id) => id !== candidate.contactId));
    await read();
    toast.success(t(decision === "accept" ? c.acceptedToast : c.dismissedToast));
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
  return (
    <div data-plan-type={detail.itemId} data-state={state}>
      {shell}
      <div className={styles.toolbar}>
        {back}
        {detail.sample ? <SampleTag /> : null}
        <span className={styles.push} />
        {skipped
          ? <Button label={t(c.unskip)} variant="secondary" loading={busy === "unskip"} onClick={() => void unskip()} />
          : <Button label={t(c.skipButton)} variant="ghost" onClick={() => setSkipOpen(true)} />}
        <Button label={t(c.recordOffline)} icon="plus" variant="primary" disabled={skipped} onClick={() => { setMatches(null); setCreateFailed(false); setRecord({ contactId: null, mode: "offline" }); }} data-plan-record-offline="" />
      </div>

      <HeadCard detail={detail} plan={plan} plus={plus} t={t} />

      {state === "none" ? <div className={styles.banner} data-plan-banner="none" style={{ marginTop: "var(--space-16)" }}><span aria-hidden>🔭</span><div><div className={styles.strong}>{t(c.noneBanner)}</div><div className={styles.label}>{t(c.noneBannerSub)}</div></div></div> : null}
      {skipped ? (
        <div className={`${styles.banner} ${styles.bannerSkip}`} data-plan-banner="skipped" style={{ marginTop: "var(--space-16)" }}>
          <span className={styles.grow}>{t(c.skippedBanner)}</span>
          <Button size="sm" label={t(c.unskip)} loading={busy === "unskip"} onClick={() => void unskip()} />
        </div>
      ) : null}

      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          <Card data-plan-why="">
            <h3 className={styles.h3}>{t(c.whyTitle)}</h3>
            <p className={styles.muted}>{detail.why}</p>
          </Card>
          {state === "none" && detail.persona ? <Card data-plan-persona=""><h3 className={styles.h3}>{t(c.personaTitle)}</h3><p className={styles.muted}>{detail.persona}</p></Card> : null}
          {detail.opener ? (
            <Card data-plan-opener="">
              <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.openerTitle)}</h3><Button size="sm" variant="ghost" icon="copy" label={copy.action.copy} onClick={() => void copyText(detail.opener!).then((ok) => ok && toast.success(copy.toast.copied))} /></div>
              <p className={styles.quote}>{detail.opener}</p>
            </Card>
          ) : null}
          <Card data-plan-questions="">
            <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.questionsTitle)}</h3><Button size="sm" variant="ghost" icon="copy" label={copy.action.copy} onClick={() => void copyText(detail.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")).then((ok) => ok && toast.success(copy.toast.copied))} /></div>
            <ol className={styles.numbered}>{detail.questions.map((question, index) => <li key={index}>{question}</li>)}</ol>
          </Card>
          <CountRules detail={detail} t={t} />
          {detail.recognizeHints.length ? (
            <Card data-plan-hints="">
              <h3 className={styles.h3}>{t(c.hintsTitle)}</h3>
              <div className={styles.hints} style={{ marginTop: "var(--space-8)" }}>{detail.recognizeHints.map((hint) => <Chip key={hint} label={hint} />)}</div>
            </Card>
          ) : null}
          {detail.tasks.length ? (
            <Card data-plan-tasks="">
              <h3 className={styles.h3}>{t(c.tasksTitle)}</h3>
              <ul className={styles.plain}>{detail.tasks.map((task) => <li key={task.taskId} className={styles.recent}><span className={styles.grow}>{task.title}</span>{task.dueDate ? <span className={styles.label}>{task.dueDate}</span> : null}</li>)}</ul>
            </Card>
          ) : null}
        </div>

        <div className={styles.stack}>
          {candidates.length ? (
            <Card data-plan-candidates="" className={skipped ? styles.faded : undefined}>
              <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.candidatesTitle)}</h3><span className={styles.label}>{t(c.candidatesNote, { n: candidates.length })}</span></div>
              <CandidateTable candidates={candidates} selected={selected} disabled={skipped || busy !== null} language={language} t={t}
                onToggle={(id, on) => setSelected(on ? [...selected, id] : selected.filter((value) => value !== id))} onDecide={(candidate, decision) => void decide(candidate, decision)}
                onTalked={(candidate) => void submitRecord({ contactId: candidate.contactId, kind: "talked" })} />
              {selected.length && !skipped ? (
                <div className={styles.selectBar} data-plan-select-bar="">
                  <span className={`${styles.grow} ${styles.strong}`}>{t(c.selectedCount, { n: selected.length })}</span>
                  <Button size="sm" label={t(c.recordSelected, { n: selected.length })} loading={busy === "record"} onClick={() => void recordSelected()} />
                  <Button size="sm" variant="primary" label={t(c.propose)} onClick={() => setProposalOpen(true)} />
                </div>
              ) : null}
            </Card>
          ) : null}
          {detail.talked.length ? (
            <Card data-plan-talked="">
              <button type="button" className={`btn ${styles.disclose}`} aria-expanded={talkedOpen} onClick={() => setTalkedOpen(!talkedOpen)}>
                {t(c.talkedTitle, { n: detail.talked.length })}<span aria-hidden>{talkedOpen ? "▴" : "▾"}</span>
              </button>
              {talkedOpen ? (
                <ul className={styles.plain} style={{ marginTop: "var(--space-8)" }}>
                  {detail.talked.map((item) => (
                    <li key={item.awardLogId} className={styles.talked} data-plan-talked-row={item.awardLogId}>
                      <span className={`${styles.grow} ${styles.strong}`}>{item.anonymous || !item.name ? t(c.talkedAnonymous) : item.name}</span>
                      <span className={styles.label}>{new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric" }).format(new Date(item.at))}</span>
                      <span className={`${styles.plus} ${item.part === "overflow" ? styles.plusHalf : ""}`}>+{item.points}</span>
                      {skipped ? null : <Button size="sm" variant="ghost" label={copy.action.withdraw} loading={busy === `undo:${item.awardLogId}`} disabled={busy !== null} onClick={() => void undo([item.awardLogId])} />}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
          {detail.introRoutes.length ? (
            <Card data-plan-routes="">
              <h3 className={styles.h3}>{t(c.routesTitle)}</h3>
              <div className={styles.tight} style={{ marginTop: "var(--space-8)" }}>
                {detail.introRoutes.map((route) => (
                  <div key={route.viaContactId} className={styles.route} data-plan-route={route.viaContactId}>
                    <Avatar name={route.viaName} size="sm" />
                    <div className={styles.grow}><div className={styles.strong}>{t(c.routeVia, { name: route.viaName })}</div><div className={styles.label}>{route.why}</div></div>
                    <Button size="sm" icon="mail" label={t(c.makeIntro)} loading={busy === `intro:${route.viaContactId}`} onClick={() => void makeIntro(route.viaContactId)} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <Card data-plan-events="">
            <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.eventsTitle)}</h3><span className={styles.label}>{t(c.eventsNote)}</span></div>
            {detail.events.length ? detail.events.map((option) => <EventRow key={option.eventId} option={option} language={language} t={t} />) : <p className={styles.label}>{t(c.eventsEmpty)}</p>}
            {event && event.allocation > 0 ? <p className={styles.label}>{t(c.attendNote)} +{event.unit}</p> : null}
          </Card>
        </div>
      </div>

      <RecordModal open={Boolean(record)} detail={detail} initialMode={record?.mode ?? "talked"} initialContactId={record?.contactId} matches={matches ?? null} busy={busy === "record"} createFailed={createFailed} t={t}
        onClose={() => { setRecord(null); setMatches(null); setCreateFailed(false); }} saveRecord={(submit) => void submitRecord(submit)} />
      <SkipDialog open={skipOpen} points={Math.max(0, detail.allocation - detail.earned)} busy={busy === "skip"} t={t} onCancel={() => setSkipOpen(false)} onConfirm={() => void skip()} />
      <ProposalDrawer open={proposalOpen} people={candidates.filter((candidate) => selected.includes(candidate.contactId))} t={t} onClose={() => setProposalOpen(false)} onPropose={propose} />
      <IntroDraftDrawer draft={intro} t={t} onClose={() => setIntro(null)} />
    </div>
  );
}

function subtitle(detail: PlanPersonTypeDetail, plan: PlanV2Detail | null, t: Translate): string {
  const steps = stepNumbers(detail, plan);
  return steps.length
    ? t(c.typeSubtitle, { letter: detail.letter, points: detail.allocation, steps: steps.join(t(planFlowCopy.listSeparator)) })
    : t(c.typeSubtitleNoStep, { letter: detail.letter, points: detail.allocation });
}

function stepNumbers(detail: PlanPersonTypeDetail, plan: PlanV2Detail | null): number[] {
  if (!plan) return [];
  return plan.content.steps.flatMap((step, index) => (detail.stepKeys.includes(step.key) ? [index + 1] : []));
}

function unitsText(allocation: number, targetCount: number, t: Translate): string {
  const units = unitsOf(allocation, targetCount);
  return units.last === null ? t(planFlowCopy.unitsEven, { points: units.points }) : t(c.unitsLast, { last: units.last, points: units.points });
}

function HeadCard({ detail, plan, plus, t }: { detail: PlanPersonTypeDetail; plan: PlanV2Detail | null; plus: { points: number; half: boolean; at: number } | null; t: Translate }) {
  const stats = plan?.typeStats?.find((item) => item.itemId === detail.itemId);
  const candidates = detail.candidates.length;
  const overflowAt = detail.targetCount + 1;
  const half = Math.floor((detail.unitPoints[0] ?? 0) / 2);
  const steps = plan ? plan.content.steps.filter((step) => detail.stepKeys.includes(step.key)).map((step) => step.title) : [];
  return (
    <section className={styles.headCard} data-plan-type-head="">
      <div className={styles.row} style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <MacTile emoji={detail.emoji} />
        <div className={styles.grow}>
          <div className={styles.kicker}>{t(c.typeKicker, { label: detail.shortLabel, letter: detail.letter })} · {t(c.roleSituation)}</div>
          <p className={styles.headName}>{detail.roleSituation}</p>
          <div className={styles.mini3} style={{ maxWidth: 420 }}>
            <div data-cell="candidates" className={candidates === 0 ? styles.cellOff : undefined}><b>{candidates}</b><span className={styles.label}>{t(candidates === 0 ? c.typeNone : planFlowCopy.sampleCandidates)}</span></div>
            <div data-cell="events"><b>{stats?.events ?? detail.events.length}</b><span className={styles.label}>{t(planFlowCopy.sampleEvents)}</span></div>
            <div data-cell="routes"><b>{detail.introRoutes.length}</b><span className={styles.label}>{t(planFlowCopy.sampleRoutes)}</span></div>
          </div>
          {steps.length ? <div className={styles.label} style={{ marginTop: "var(--space-8)" }}>{t(c.linkedSteps, { steps: steps.join(t(planFlowCopy.listSeparator)) })}</div> : null}
        </div>
      </div>
      <div className={styles.headScore}>
        <div className={styles.row}>
          <span className={styles.headNumber} data-plan-type-earned={detail.earned + detail.overflow}>
            {detail.earned + detail.overflow}
            {plus ? <span key={plus.at} className={`${styles.floatPlus} ${plus.half ? styles.floatHalf : ""}`} aria-hidden>+{plus.points}</span> : null}
          </span>
          <span className={styles.label}>{t(c.headScore, { allocation: detail.allocation, met: detail.metCount, target: detail.targetCount, units: unitsText(detail.allocation, detail.targetCount, t) })}</span>
        </div>
        {detail.skipped ? <span className={styles.stripeBar} aria-hidden data-plan-type-bar="skipped" /> : <ProgressBar value={detail.allocation ? Math.min(1, detail.earned / detail.allocation) : 0} label={t(c.typeScore, { allocation: detail.allocation, earned: detail.earned })} />}
        <span className={styles.label} data-plan-overflow-note="">{t(c.overflowNote, { n: overflowAt, points: half })}</span>
      </div>
    </section>
  );
}

function CountRules({ detail, t }: { detail: PlanPersonTypeDetail; t: Translate }) {
  const units = unitsOf(detail.allocation, detail.targetCount);
  const base = units.last === null ? `+${units.points}` : `+${units.points} / +${units.last}`;
  const half = Math.floor((detail.unitPoints[0] ?? 0) / 2);
  return (
    <Card data-plan-count="">
      <h3 className={styles.h3}>{t(c.countTitle)}</h3>
      <p className={styles.label}>{detail.countRule}</p>
      <div className={styles.tight}>
        <div className={styles.rule}><span>{t(c.countBase)}</span><b className={styles.plus}>{base}</b></div>
        <div className={styles.rule}><span>{t(c.countOverflow, { n: detail.targetCount })}</span><b className={`${styles.plus} ${styles.plusHalf}`}>+{half}</b></div>
        <div className={styles.rule}><span>{t(c.countAnonymous, { n: detail.targetCount })}</span><b className={styles.plus}>+{units.points}</b></div>
      </div>
    </Card>
  );
}

function CandidateTable({ candidates, selected, disabled, language, t, onToggle, onDecide, onTalked }: {
  candidates: PlanCandidateView[];
  selected: string[];
  disabled: boolean;
  language: OrbitLanguage;
  t: Translate;
  onToggle: (contactId: string, on: boolean) => void;
  onDecide: (candidate: PlanCandidateView, decision: "accept" | "dismiss") => void;
  onTalked: (candidate: PlanCandidateView) => void;
}) {
  const day = new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric", year: "numeric" });
  return (
    <table className={styles.table}>
      <thead>
        <tr><th aria-hidden /><th>{t(c.colScore)}</th><th>{t(c.colName)}</th><th>{t(c.colReason)}</th><th>{t(c.colLast)}</th><th>{t(c.colDecide)}</th></tr>
      </thead>
      <tbody>
        {candidates.map((candidate) => {
          const on = selected.includes(candidate.contactId);
          return (
            <tr key={candidate.contactId} data-candidate={candidate.contactId} data-selected={on ? "" : undefined}>
              <td><Checkbox checked={on} label={t(c.selectPerson, { name: candidate.name })} onChange={(next) => { if (!disabled) onToggle(candidate.contactId, next); }} /></td>
              <td className={styles.scoreCell} data-recommend={candidate.recommendScore}>{candidate.recommendScore}</td>
              <td>
                <div className={styles.strong}>{candidate.name} {candidate.isOrbitUser ? <Chip label={t(c.orbitUser)} tone="teal" /> : null}</div>
                <div className={styles.label}>{[candidate.company, candidate.role].filter(Boolean).join(" · ")}</div>
              </td>
              <td className={styles.wideCell}>
                {candidate.reason ? <div>{candidate.reason}</div> : null}
                {candidate.opener ? <div className={styles.label}>{t(c.openerLine, { text: candidate.opener })}</div> : null}
              </td>
              <td className={styles.label}>{candidate.lastContactAt ? day.format(new Date(candidate.lastContactAt)) : t(c.noContact)}</td>
              <td>
                <div className={styles.cellActions}>
                  <IconButton icon="check" size={34} soft label={t(c.acceptCandidate)} disabled={disabled} onClick={() => onDecide(candidate, "accept")} />
                  <IconButton icon="x" size={34} soft label={t(c.dismissCandidate)} disabled={disabled} onClick={() => onDecide(candidate, "dismiss")} />
                  {/* R24 复核 m7: record a talk with this person directly (UI-SPEC ✓ / ✕ / すでに話した). */}
                  <Button size="sm" variant="ghost" label={t(c.alreadyTalked)} disabled={disabled} onClick={() => onTalked(candidate)} data-plan-already-talked={candidate.contactId} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const CRITERIA = { confidence: c.criterionConfidence, connections: c.criterionConnections, fit: c.criterionFit, format: c.criterionFormat, timeCost: c.criterionTimeCost } as const;
const VERDICT = { conditional: c.verdictConditional, recommend: c.verdictRecommend, skip: c.verdictSkip } as const;

function EventRow({ option, language, t }: { option: PlanEventOption; language: OrbitLanguage; t: Translate }) {
  const copy = useStandardCopy();
  const [open, setOpen] = useState(false);
  const when = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", weekday: "short" }).format(new Date(option.startsAt));
  const tone = ringTone(option.score.total);
  return (
    <div className={styles.eventRow} data-plan-event-option={option.eventId}>
      <span className={`${styles.ring} ${styles[`ring_${tone}`]}`} data-ring={tone}>{option.score.total}</span>
      <div className={styles.grow}>
        <div className={styles.strong}>{option.title}</div>
        <div className={styles.label}>{[when, option.venue].filter(Boolean).join(" · ")}</div>
        <div className={styles.row} style={{ marginTop: "var(--space-4)" }}>
          {option.expectedCount !== null ? <Chip label={t(c.expected, { n: option.expectedCount })} tone="pink" /> : null}
          <Chip label={t(VERDICT[option.score.verdict])} tone={option.score.verdict === "recommend" ? "lav" : "neutral"} />
          <span className={styles.push}><button type="button" className={`btn ${styles.disclose}`} aria-expanded={open} onClick={() => setOpen(!open)}>{t(c.breakdown)}<span aria-hidden>{open ? "▴" : "▾"}</span></button></span>
        </div>
        {open ? (
          <div className={styles.breakdown} data-plan-breakdown={option.eventId}>
            {option.score.scoreBreakdown.map((item) => (
              <div key={item.criterion} className={styles.criterion} data-criterion={item.criterion} data-estimated={item.estimated ? "" : undefined}>
                <span className={styles.strong}>{t(CRITERIA[item.criterion])} {item.estimated ? <Chip label={copy.chip.estimated} tone="apricot" /> : null}</span>
                <ProgressBar thin value={item.max ? item.score / item.max : 0} label={t(CRITERIA[item.criterion])} />
                <span className={styles.num}>{item.score} / {item.max}</span>
                {item.facts.length ? <small>{item.facts.join(" · ")}</small> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
