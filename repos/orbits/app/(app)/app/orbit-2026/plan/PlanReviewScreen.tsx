"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanConfirmResult, PlanDraftChange, PlanDraftTurn, PlanPremiseRow, PlanQuotaResponse, PlanReviewView, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planReviewCopy as r } from "../copy/plan";
import { standardCopyFor } from "../copy/standard";
import { ShellPage, useInShell } from "../shell/slots";
import { Icon, Orbit2026Scope, RetryCard, Skeleton, ToastProvider } from "../ui";
import { newActionKey, planApi, type PlanApiResult } from "./plan-api";
import { setPlanFlash } from "./plan-flash";
import { planErrorView, type PlanApiError, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import { ReviewEntryBody, UsedUpNote, reviewPageHref } from "./PlanReviewEntry";
import { daysUntil, draftHasChanges, isToggleable, markEvidence, monthDay, premiseEdits, premiseRows, premiseSource, sinceFromDetail, struckPart } from "./review-model";
import k from "./ReviewKit.module.css";
import s from "./ReviewScreen.module.css";

type Load = { state: "loading" } | { state: "failed" } | { state: "none"; quota: PlanQuotaResponse | null; detail: PlanV2Detail | null } | { state: "ready"; view: PlanReviewView };

const enc = encodeURIComponent;
const errorOf = <T,>(result: PlanApiResult<T>): PlanApiError | null => (result.ok === false ? result.error : null);
const IORBIT_HREF = "/app/agent";

/**
 * 見直し（b4「見直し · Web（前提 + 差分 · 右栏配额）」, b12 W-R25-05 / 06a–c）:
 * `/app/plans/[planId]/review`. Left: the confirmed premises (AI marks, edited in place);
 * right: each send as the person's bubble + the AI's diff card (✓ / ✕ per change, D57);
 * the rail: the month's reviews, the send input, 手動で編集 / 確定. A send uses one of the
 * month's reviews even with no change; a failure uses none.
 */
export function PlanReviewScreen({ planId, draftId }: { planId: string; draftId: string | null }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [earned, setEarned] = useState<number | null>(null);
  const [planPremise, setPlanPremise] = useState<PlanV2Detail["premise"] | null>(null);

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    const path = draftId ? `/drafts/${enc(draftId)}/review` : `/v2/${enc(planId)}/reviews/current`;
    const [result, detail] = await Promise.all([planApi<PlanReviewView>(path, { language }), planApi<PlanV2Detail>(`/v2/${enc(planId)}`, { language })]);
    setEarned(detail.ok ? detail.data.score.total : null);
    setPlanPremise(detail.ok ? detail.data.premise : null);
    if (result.ok && result.data.draft.status === "open") { setLoad({ state: "ready", view: result.data }); return; }
    const failure = errorOf(result);
    if (!failure || failure.status === 404 || failure.reason === "DRAFT_NOT_FOUND") {
      // Nothing open (or that draft is closed): offer to start one — opening uses nothing.
      const quota = await planApi<PlanQuotaResponse>("/v2/quota", { language });
      setLoad({ detail: detail.ok ? detail.data : null, quota: quota.ok ? quota.data : null, state: "none" });
      return;
    }
    setLoad({ state: "failed" });
  }, [draftId, planId, language]);

  useEffect(() => { void read(); }, [read]);

  const goal = load.state === "ready" ? load.view.draft.goal : load.state === "none" ? load.detail?.goal ?? "" : "";
  // b4: the review is an iOrbit conversation — ≡ (history) / iOrbit · 方案を見直す · goal / ＋ 新しい会話.
  const shell = (
    <ShellPage title={t(r.iorbitTitle)} subtitle={goal ? t(r.reviewHeadSub, { goal }) : t(r.reviewTitle)}
      left={<Link href={IORBIT_HREF} className={`btn ${k.rbtn}`} aria-label={t(r.historyOpen)} data-plan-review-history=""><Icon name="menu" size={20} /></Link>}
      right={<Link href={IORBIT_HREF} className={`btn ${k.btn}`} data-plan-review-newchat=""><Icon name="plus" size={16} />{t(r.newChat)}</Link>} />
  );

  return (
    <Orbit2026Scope language={language} className={k.page}>
      <ToastProvider>
        {shell}
        {load.state === "loading" ? <Skeleton lines={8} />
          : load.state === "failed" ? <div data-plan-review-error=""><RetryCard title={t(r.loadFailed)} onRetry={() => void read()} /></div>
          : load.state === "none" ? <StartReview planId={planId} load={load} t={t} language={language} />
          : <ReviewBody key={load.view.draft.draftId} planId={planId} initial={load.view} earned={earned} planPremise={planPremise} t={t} language={language} />}
      </ToastProvider>
    </Orbit2026Scope>
  );
}

/** No open review: the entry content (the overview's modal), on the page. */
function StartReview({ planId, load, t, language }: { planId: string; load: Extract<Load, { state: "none" }>; t: Translate; language: OrbitLanguage }) {
  const router = useRouter();
  const std = standardCopyFor(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlanErrorView | null>(null);
  const back = planTaskSegmentHref("web", planId);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    const result = await planApi<PlanReviewView>(`/v2/${enc(planId)}/reviews`, { body: { idempotencyKey: newActionKey() }, language });
    setBusy(false);
    if (result.ok === false) { setError(planErrorView(result.error, "other")); return; }
    router.replace(reviewPageHref(planId, result.data.draft.draftId));
  };
  const quota = load.quota;
  const usedUp = quota !== null && quota.reviewLeftThisMonth <= 0;
  return (
    <section className={k.card} style={{ maxWidth: 480, margin: "0 auto" }} data-plan-review-start-card="">
      {!quota ? <PlanErrorNotice view={{ op: "other", tone: "failure" }} t={t} />
        : usedUp ? <UsedUpNote quota={quota} t={t} language={language} />
        : <ReviewEntryBody quota={quota} since={load.detail ? sinceFromDetail(load.detail) : { events: 0, stepsCompleted: 0, talked: 0 }} t={t} language={language} />}
      {error ? <PlanErrorNotice view={error} t={t} onRetry={() => void start()} /> : null}
      <div className={k.macts}>
        {quota && !usedUp ? <span className={`${k.lbl} ${k.hint}`}>{t(r.startNote)}</span> : null}
        {quota && !usedUp ? <button type="button" className={`btn ${k.btn} ${k.ghost}`} onClick={() => router.push(back)}>{std.action.notNow}</button> : null}
        {quota && !usedUp
          ? <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={busy} aria-busy={busy || undefined} onClick={() => void start()} data-plan-review-start=""><Icon name="sparkle" size={16} />{t(r.startReview)}</button>
          : <button type="button" className={`btn ${k.btn} ${k.primary}`} onClick={() => router.push(back)} data-plan-review-gotit="">{std.action.gotIt}</button>}
      </div>
    </section>
  );
}

type Problem = { kind: "error"; view: PlanErrorView; retry: (() => void) | null } | { kind: "stale" } | null;

/** b4 見直し 开场：「前回の確定（9/14）から 3週間です。」（没有确定时刻就不说）. */
function sinceLine(at: string | null | undefined, t: Translate, now: Date = new Date()): string {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" }).formatToParts(date);
  const md = `${parts.find((p) => p.type === "month")?.value}/${parts.find((p) => p.type === "day")?.value}`;
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  if (days < 1) return t(r.sinceConfirmedToday, { date: md });
  const span = days >= 14 ? t(r.spanWeeks, { n: Math.floor(days / 7) }) : t(r.spanDays, { n: days });
  return t(r.sinceConfirmed, { date: md, span });
}

/** 「チーム：2名（佐藤 · 中川）· 空き…」→「チーム：2名」 for the compact chips (b12 W-R25-05 / 06c). */
function shortValue(value: string): string {
  const head = value.split(/[（(·・]/u)[0]?.trim();
  return head || value;
}

function ReviewBody({ planId, initial, earned, planPremise, t, language }: { planId: string; initial: PlanReviewView; earned: number | null; planPremise: PlanV2Detail["premise"] | null; t: Translate; language: OrbitLanguage }) {
  const router = useRouter();
  const std = standardCopyFor(language);
  const inShell = useInShell();
  const [view, setView] = useState(initial);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [expanded, setExpanded] = useState(false);
  const running = useRef(false);

  const { draft } = view;
  const left = view.reviewLeftThisMonth;
  const limit = view.reviewMonthlyLimit;
  const usedUp = left <= 0;
  const turns = draft.turns;
  const changedRows = premiseEdits(draft.premise, edits);
  const canSend = !usedUp && (changedRows.length > 0 || text.trim() !== "");
  const back = planTaskSegmentHref("web", planId);
  const stale = problem?.kind === "stale";
  const fixFailed = problem?.kind === "error" && problem.view.tone === "failure" && problem.view.op === "fix";

  /** One write per click; STALE / closed drafts turn into 「最新を読み込む」. */
  const write = async <T,>(name: string, path: string, body: Record<string, unknown>): Promise<PlanApiResult<T> | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(name);
    setProblem(null);
    const result = await planApi<T>(path, { body: { ...body, idempotencyKey: newActionKey() }, language });
    running.current = false;
    setBusy(null);
    const failure = errorOf(result);
    if (failure && (failure.reason === "STALE" || failure.reason === "DRAFT_CLOSED")) setProblem({ kind: "stale" });
    return result;
  };

  const send = async () => {
    if (!canSend) return;
    const premise = changedRows;
    const note = text.trim();
    setPending(note || null);
    const result = await write<PlanReviewView>("send", `/drafts/${enc(draft.draftId)}/review/fix`, { premise, text: note || null });
    if (!result) return;
    if (result.ok) {
      setView(result.data);
      setEdits({});
      setText("");
      setEditing(null);
      setPending(null);
      return;
    }
    const failure = errorOf(result)!;
    if (failure.reason === "REVIEW_LIMIT") {
      // Read again for the reason (月 3 回 or the month's AI budget); keep the input either way.
      const again = await planApi<PlanReviewView>(`/drafts/${enc(draft.draftId)}/review`, { language });
      setView((current) => (again.ok ? { ...again.data, reviewLeftThisMonth: 0 } : { ...current, reviewLeftThisMonth: 0 }));
      setPending(null);
      return;
    }
    if (failure.reason === "STALE" || failure.reason === "DRAFT_CLOSED") return;
    const shown = planErrorView(failure, "fix");
    setProblem({ kind: "error", retry: shown.tone === "failure" ? () => void send() : null, view: shown });
  };

  const toggle = async (change: PlanDraftChange, accepted: boolean) => {
    if (!change.id || (change.accepted !== false) === accepted) return;
    const result = await write<PlanReviewView>(`toggle:${change.id}`, `/drafts/${enc(draft.draftId)}/changes/${enc(change.id)}/toggle`, { accepted });
    if (!result) return;
    const failure = errorOf(result);
    if (result.ok === true) setView(result.data);
    else if (failure && failure.reason !== "STALE" && failure.reason !== "DRAFT_CLOSED") setProblem({ kind: "error", retry: null, view: planErrorView(failure, "other") });
  };

  const confirm = async () => {
    const result = await write<PlanConfirmResult>("confirm", `/drafts/${enc(draft.draftId)}/confirm`, {});
    if (!result) return;
    if (result.ok) {
      setPlanFlash("updated");
      router.push(result.data.href);
      return;
    }
    const failure = errorOf(result)!;
    if (failure.reason !== "STALE" && failure.reason !== "DRAFT_CLOSED") setProblem({ kind: "error", retry: () => void confirm(), view: planErrorView(failure, "other") });
  };

  /** 「最新を読み込む」: open the review again on the current plan (opening uses nothing). */
  const reloadLatest = async () => {
    const result = await write<PlanReviewView>("reload", `/v2/${enc(planId)}/reviews`, {});
    if (!result) return;
    if (result.ok) {
      setView(result.data);
      setEdits({});
      setPending(null);
      router.replace(reviewPageHref(planId, result.data.draft.draftId));
    } else if (errorOf(result)?.reason === "PLAN_NOT_FOUND" || errorOf(result)?.reason === "PLAN_ACHIEVED") router.push(back);
  };

  const stage = turns.length === 0 ? 0 : 1;
  // R25 复核 m1: the whole draft decides — any accepted change in any turn, or a premise it changed.
  const anyChange = draftHasChanges(turns, draft.premise, planPremise);
  const sentBefore = new Map((planPremise ?? []).map((row) => [row.key, row.value]));
  const hasSentEdits = draft.premise.some((row) => sentBefore.has(row.key) && sentBefore.get(row.key) !== row.value);
  const showPending = (stale || fixFailed) && pending !== null;
  const rightColumn = turns.length > 0 || showPending || fixFailed;
  // b12 W-R25-05 / 06c: with nothing edited, the premises fold into chips beside the conversation.
  const compact = rightColumn && !hasSentEdits && changedRows.length === 0 && !expanded && editing === null;
  const leadBubble = !stale && !fixFailed && !compact;

  const premise = compact
    ? <PremiseChips rows={draft.premise} t={t} onExpand={() => setExpanded(true)} />
    : <PremiseCard view={view} planPremise={planPremise} edits={edits} editing={editing} t={t} language={language} disabled={usedUp || busy !== null || stale}
        onEdit={setEditing} onChange={(key, value) => setEdits((current) => ({ ...current, [key]: value }))} />;

  const otherError = problem?.kind === "error" && !fixFailed ? (
    <div data-plan-review-problem={problem.view.tone}><PlanErrorNotice view={problem.view} t={t} onRetry={problem.retry ?? undefined} /></div>
  ) : null;

  const right = rightColumn ? (
    <div className={s.stack}>
      {turns.map((turn) => (
        <TurnBlock key={turn.n} turns={turns} turn={turn} earned={earned} limit={limit} left={left} t={t} busy={busy !== null} onToggle={toggle} />
      ))}
      {showPending ? <p className={`${k.bubble} ${k.bubbleMe}`} data-plan-review-pending="">{pending}</p> : null}
      {fixFailed ? (
        <div className={k.ngCard} data-plan-review-problem="failure">
          <div className={k.row}>
            <span className={k.ngMark}><Icon name="alert" size={16} /></span>
            <div className={k.grow}>
              <b className={s.ngTitle}>{t(r.fixFailedTitle)}</b>
              <div className={k.lbl} data-plan-review-free="">{t(r.fixFailedBody)}</div>
            </div>
            <button type="button" className={`btn ${k.btn} ${k.sm} ${k.primary}`} disabled={busy !== null} onClick={() => void send()} data-plan-review-retry="">{t(r.fixRetry)}</button>
          </div>
        </div>
      ) : null}
      {otherError}
    </div>
  ) : null;

  const content = (
    <>
      {leadBubble ? <p className={`${k.bubble} ${k.bubbleAi}`} data-plan-review-lead="">{sinceLine(view.lastConfirmedAt, t)}{t(r.reviewLead)}</p> : null}
      {right ? <div className={s.cols}>{premise}{right}</div> : <>{premise}{otherError}</>}
    </>
  );

  const rail = (
    <ReviewRail view={view} t={t} language={language} stage={stage} text={text} onText={setText} canSend={canSend} busy={busy} stale={stale} anyChange={anyChange}
      onSend={() => void send()} onConfirm={() => void confirm()} onKeep={() => router.push(back)}
      onManual={() => router.push(planDraftEditHref("web", draft.draftId))} gotIt={std.action.gotIt} />
  );

  return (
    <div className={s.wchat} data-plan-review={draft.draftId} data-stage={stage}>
      <ShellPage rightRail={rail} />
      <ol className={s.fm} aria-label={t(r.reviewTitle)}>
        {[r.stagePremise, r.stageFix, r.stageManual].map((entry, index) => (
          <li key={entry.en} className={index === stage ? s.on : index < stage ? s.done : undefined} aria-current={index === stage ? "step" : undefined}>{t(entry)}</li>
        ))}
      </ol>
      {stale ? (
        <div role="status" className={k.degrade} data-plan-review-stale="">
          <div className={k.grow}>
            <b className={s.staleTitle}>{t(r.staleTitle)}</b>
            <div className={s.staleBody}>{t(r.staleBody)}</div>
          </div>
          <button type="button" className={`btn ${k.btn} ${k.sm} ${k.onSurface}`} disabled={busy !== null} onClick={() => void reloadLatest()} data-plan-review-reload="">{t(r.loadLatest)}</button>
        </div>
      ) : null}
      {stale ? <div className={k.dim}>{content}</div> : content}
      {/* Outside the shell (a page rendered on its own) the rail goes under the content. */}
      {inShell ? null : <aside data-plan-review-rail="">{rail}</aside>}
    </div>
  );
}

/** The rail（b4 revRail · b12 W-R25-05 / 06a–c）. */
function ReviewRail({ view, t, language, stage, text, onText, canSend, busy, stale, anyChange, onSend, onConfirm, onKeep, onManual, gotIt }: {
  view: PlanReviewView;
  t: Translate;
  language: OrbitLanguage;
  stage: number;
  text: string;
  onText: (value: string) => void;
  canSend: boolean;
  busy: string | null;
  stale: boolean;
  anyChange: boolean;
  onSend: () => void;
  onConfirm: () => void;
  onKeep: () => void;
  onManual: () => void;
  gotIt: string;
}) {
  const left = view.reviewLeftThisMonth;
  const limit = view.reviewMonthlyLimit;
  const usedUp = left <= 0;
  const used = Math.max(0, Math.min(limit, limit - left));
  const note = usedUp
    ? stage > 0 ? t(r.railUsedUpAfter) : t(r.railUsedUpBefore, { date: monthDay(view.resetsAt, language), days: daysUntil(view.resetsAt) })
    : stage > 0 ? t(r.railRulesAfter) : t(r.composerRules, { limit });
  const placeholder = usedUp ? t(view.reviewLimitReason === "ai_budget" ? r.aiBudgetTitle : r.usedUpInput) : stage > 0 ? t(r.againInput) : t(r.otherChanges);
  const inputOff = usedUp || stale || busy !== null;
  const manual = <button type="button" className={`btn ${k.btn}`} disabled={!view.draft.manualEditAvailable || busy !== null} onClick={onManual} data-plan-review-manual=""><Icon name="edit" size={16} />{t(r.manualOnce)}</button>;
  let actions: ReactNode;
  if (!usedUp && stage === 0) {
    actions = (
      <>
        <button type="button" className={`btn ${k.btn} ${k.primary} ${k.block} ${stale ? k.dim : ""}`} disabled={!canSend || busy !== null || stale} aria-busy={busy === "send" || undefined} onClick={onSend} data-plan-review-send="">{t(r.send)}</button>
        <div className={`${k.lbl} ${s.sendNote}`} data-plan-review-send-note="">{t(r.sendNote, { from: left, to: left - 1 })}</div>
      </>
    );
  } else {
    const main = stage === 0
      ? <button type="button" className={`btn ${k.btn} ${k.primary}`} onClick={onKeep} data-plan-review-gotit="">{gotIt}</button>
      : anyChange
        ? <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={busy !== null || stale} aria-busy={busy === "confirm" || undefined} onClick={onConfirm} data-plan-review-confirm="">{t(r.confirm)}</button>
        : <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={busy !== null} onClick={onKeep} data-plan-review-keep="">{t(r.keepAsIs)}</button>;
    actions = <div className={k.grid2} data-plan-review-actions="">{manual}{main}</div>;
  }
  return (
    <div className={s.rail}>
      <h2 className={s.railH}><Icon name="refresh" size={16} />{t(r.railTitle)}</h2>
      <section className={`${k.card} ${s.quota}`} aria-label={t(r.quotaTitle)} data-plan-review-quota={left}>
        <div className={s.revbig}><span className={k.lbl}>{t(r.railLeftBefore)}</span><em data-plan-review-left={left}>{left}</em><span className={k.lbl}>{t(r.railLeftAfter, { limit })}</span></div>
        <div className={s.dots3} role="img" aria-label={t(r.quotaCells, { limit, used })} data-plan-quota-bar={left}>
          {Array.from({ length: limit }, (_, index) => <i key={index} className={index < used ? s.used : undefined} data-cell={index < used ? "used" : "left"} />)}
        </div>
        <div className={`${k.lbl} ${s.railNote}`}>{note}</div>
        <div className={`${k.assistIn} ${s.railIn} ${inputOff && !busy ? k.dim : ""}`} data-plan-review-composer={usedUp ? "off" : ""}>
          <Icon name="pen" size={16} />
          <input value={usedUp ? "" : text} maxLength={1000} placeholder={placeholder} disabled={inputOff} aria-label={placeholder}
            onChange={(event) => onText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && canSend) onSend(); }} data-plan-review-text="" />
          <button type="button" className={`btn ${k.lbtn} ${s.send}`} aria-label={t(r.send)} {...(stage === 0 && !usedUp ? { "aria-hidden": true, tabIndex: -1 } : {})} disabled={!canSend || inputOff} onClick={onSend} data-plan-review-send-icon=""><Icon name="send" size={16} /></button>
        </div>
      </section>
      {actions}
      <div className={`${k.card} ${k.flat} ${s.manualNote}`}>{t(r.manualNote)}</div>
    </div>
  );
}

function PremiseChips({ rows, t, onExpand }: { rows: readonly PlanPremiseRow[]; t: Translate; onExpand: () => void }) {
  return (
    <section className={`${k.card} ${s.premCard}`} data-plan-review-premise="compact">
      <div className={`${k.row} ${s.premHead}`}>
        <span className={`${k.emo} ${k.emoSm} ${k.teal}`} aria-hidden>📌</span>
        <b className={s.premTitle}>{t(r.premiseCard)}</b>
      </div>
      <div className={s.premc}>
        {rows.map((row) => <span key={row.key} className={k.chip} title={`${row.label}：${row.value}`}>{row.label}：{shortValue(row.value)}</span>)}
        <button type="button" className={`btn ${s.v2go}`} onClick={onExpand} data-plan-review-see-all="">{t(r.seeAll)}<Icon name="down" size={16} /></button>
      </div>
    </section>
  );
}

function PremiseCard({ view, planPremise, edits, editing, t, language, disabled, onEdit, onChange }: {
  view: PlanReviewView;
  planPremise: readonly PlanPremiseRow[] | null;
  language: OrbitLanguage;
  edits: Record<string, string>;
  editing: string | null;
  t: Translate;
  disabled: boolean;
  onEdit: (key: string | null) => void;
  onChange: (key: string, value: string) => void;
}) {
  const rows = premiseRows(view.draft.premise, view.premiseMarks, edits);
  const local = rows.filter((row) => row.edited !== null).length;
  const before = new Map((planPremise ?? []).map((row) => [row.key, row.value]));
  const sent = view.draft.premise.some((row) => before.has(row.key) && before.get(row.key) !== row.value);
  const legend = local ? t(r.premiseEdited, { n: local }) : sent ? t(r.premiseLegendSent) : t(r.premiseLegend);
  return (
    <section className={`${k.card} ${s.premCard}`} data-plan-review-premise="">
      <div className={`${k.row} ${s.premHead}`}>
        <span className={`${k.emo} ${k.emoSm} ${k.teal}`} aria-hidden>📌</span>
        <b className={s.premTitle}>{t(r.premiseCard)}</b>
        <span className={k.lbl}>{legend}</span>
      </div>
      {rows.map(({ row, mark, edited }) => {
        const source = premiseSource(row);
        const open = editing === row.key;
        const old = edited !== null ? row.value : before.has(row.key) && before.get(row.key) !== row.value ? before.get(row.key)! : null;
        const shown = edited ?? row.value;
        const isRecord = row.source === "record";
        const flagged = !open && old === null && (mark !== null || isRecord);
        const evidence = mark ? markEvidence(mark, language) ?? t(r.evidenceRecords, { n: mark.evidenceIds.length }) : null;
        return (
          <div key={row.key} className={`${s.prem} ${flagged ? s.flag : ""}`} data-premise={row.key} data-marked={mark ? "" : undefined} data-edited={edited !== null ? "" : undefined}>
            <span className={k.lbl}>{row.label}</span>
            <span>
              {open ? (
                <input className={s.pinput} autoFocus aria-label={t(r.editRow, { label: row.label })} value={edits[row.key] ?? row.value} maxLength={500}
                  onChange={(event) => onChange(row.key, event.target.value)}
                  onBlur={() => onEdit(null)}
                  onKeyDown={(event) => { if ((event.key === "Enter" && !event.nativeEvent.isComposing) || event.key === "Escape") onEdit(null); }} data-premise-input={row.key} />
              ) : (
                <button type="button" className={`btn ${s.pvalue}`} disabled={disabled} aria-label={t(r.editRow, { label: row.label })} onClick={() => onEdit(row.key)}>
                  {old !== null ? <><s className={s.pold}>{struckPart(old, shown)}</s> <b className={s.pnew}>{shown}</b></> : shown}
                </button>
              )}
              {flagged ? (
                <span className={s.pflag} data-premise-mark={mark ? row.key : undefined}>
                  <Icon name="refresh" size={16} />
                  <span data-premise-evidence={mark ? row.key : undefined}>{mark ? evidence : t(r.autoFromRecords)}</span>
                </span>
              ) : null}
            </span>
            <span className={s.psrc}>{source.n === undefined ? t(source.entry) : t(source.entry, { n: source.n })}</span>
          </div>
        );
      })}
    </section>
  );
}

/** One send: the person's words, then the AI's card (diff with ✓ / ✕, or 「今回は変更しません」). */
function TurnBlock({ turns, turn, earned, limit, left, t, busy, onToggle }: { turns: readonly PlanDraftTurn[]; turn: PlanDraftTurn; earned: number | null; limit: number; left: number; t: Translate; busy: boolean; onToggle: (change: PlanDraftChange, accepted: boolean) => Promise<void> }) {
  const [why, setWhy] = useState(false);
  const last = turns[turns.length - 1]!.n;
  // The month's count of this send: the latest is (limit − left); earlier ones count back.
  const ordinal = Math.max(1, Math.min(limit, limit - left - (last - turn.n)));
  const reasons = [...new Set(turn.changes.map((change) => change.reason).filter((reason): reason is string => Boolean(reason)))];
  const whyText = turn.changes.length === 0 ? turn.noChangeReason : reasons.join(" · ");
  const unchanged = [...turn.unchanged, ...(earned !== null ? [t(r.earnedKept, { n: earned })] : [])];
  return (
    <>
      {/* b4: the bubble is what the person wrote (userText); older turns without it fall back to input. */}
      {(turn.userText !== undefined ? turn.userText : turn.input) ? <p className={`${k.bubble} ${k.bubbleMe}`} data-turn-input={turn.n}>{turn.userText !== undefined ? turn.userText : turn.input}</p> : null}
      <section className={`${k.card} ${s.turnCard}`} data-turn={turn.n}>
        <div className={k.row} style={{ gap: 8 }}>
          <span className={`${k.emo} ${k.emoSm} ${k.teal}`} aria-hidden>🧭</span>
          <div className={k.grow}>
            <div className={k.lbl}>{turn.changes.length === 0 ? t(r.noChangeLabel, { k: ordinal, limit }) : t(r.turnTitle, { k: ordinal, limit })}</div>
            <b className={s.turnTitle}>{turn.changes.length === 0 ? t(r.noChangeTitle) : t(r.turnUpdatedTitle)}</b>
          </div>
          {whyText ? <button type="button" className={`btn ${k.why}`} aria-expanded={why} onClick={() => setWhy((open) => !open)}>?</button> : null}
        </div>
        {turn.changes.length === 0 ? (
          <>
            {turn.noChangeReason ? <div className={`${s.sameLine} ${s.noChange}`} data-turn-no-change="">{turn.noChangeReason}</div> : <div data-turn-no-change="" />}
            <div className={`${k.row} ${s.turnFoot}`}>
              <span className={k.chip}>{t(r.leftChip, { n: left })}</span>
              <span className={k.lbl}>{t(r.noChangeCounts)}</span>
            </div>
          </>
        ) : (
          <div className={s.diff}>
            {turn.changes.map((change) => {
              const off = change.accepted === false;
              const live = isToggleable(turns, turn, change);
              return (
                <div key={change.id ?? change.path} className={`${s.dl} ${off ? s.off : ""}`} data-change={change.id ?? change.path} data-accepted={off ? "false" : "true"}>
                  <span className={s.chgtag}>{t(r.editChanged)}</span>
                  <span className={`${k.lbl} ${s.dlLabel}`}>{change.label}</span>
                  {live ? (
                    <span className={s.toggles}>
                      <button type="button" className={`btn ${k.lbtn} ${s.toggle} ${!off ? s.toggleOn : ""}`} aria-pressed={!off} aria-label={t(r.accept)} disabled={busy} onClick={() => void onToggle(change, true)} data-toggle="accept"><Icon name="check" size={16} /></button>
                      <button type="button" className={`btn ${k.lbtn} ${s.toggle} ${off ? s.toggleOn : ""}`} aria-pressed={off} aria-label={t(r.reject)} disabled={busy} onClick={() => void onToggle(change, false)} data-toggle="reject"><Icon name="x" size={16} /></button>
                    </span>
                  ) : null}
                  {change.before ? <s>{change.before}</s> : null}
                  {change.after ? <span className={s.nw}>{change.after}</span> : null}
                </div>
              );
            })}
          </div>
        )}
        {turn.changes.length > 0 && unchanged.length ? <div className={s.sameLine} data-turn-unchanged="">{t(r.unchangedList, { list: unchanged.join(" · ") })}</div> : null}
        {why && whyText ? <div className={k.whyBody}>{t(r.evidence, { text: whyText })}</div> : null}
      </section>
    </>
  );
}
