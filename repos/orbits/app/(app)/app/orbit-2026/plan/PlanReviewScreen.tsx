"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanConfirmResult, PlanDraftChange, PlanDraftTurn, PlanQuotaResponse, PlanReviewView, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { planDraftEditHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planReviewCopy as r } from "../copy/plan";
import { standardCopyFor } from "../copy/standard";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, Orbit2026Scope, RetryCard, Skeleton, ToastProvider, WhyDisclosure } from "../ui";
import { newActionKey, planApi, type PlanApiResult } from "./plan-api";
import { setPlanFlash } from "./plan-flash";
import { planErrorView, type PlanApiError, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import { QuotaBar, ReviewEntryBody, UsedUpNote, reviewPageHref } from "./PlanReviewEntry";
import { isToggleable, markEvidence, monthDay, premiseEdits, premiseRows, premiseSource, sinceFromDetail, turnHasChanges } from "./review-model";
import styles from "./review.module.css";

type Load = { state: "loading" } | { state: "failed" } | { state: "none"; quota: PlanQuotaResponse | null; detail: PlanV2Detail | null } | { state: "ready"; view: PlanReviewView };

const enc = encodeURIComponent;
const errorOf = <T,>(result: PlanApiResult<T>): PlanApiError | null => (result.ok === false ? result.error : null);

/**
 * 見直し（b4 A3 ①–④ + Web, A4 ②）: `/app/plans/[planId]/review`. ① the confirmed
 * premises with the AI's marks, edited in place; ② one send per revision (uses one of
 * the month's reviews, even with no change — failures use none); each change can be
 * ✓ / ✕ (the server rebuilds the plan, total 100); ③ 手動で編集 once / 確定.
 */
export function PlanReviewScreen({ planId, draftId }: { planId: string; draftId: string | null }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const std = standardCopyFor(language);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [earned, setEarned] = useState<number | null>(null);

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    const path = draftId ? `/drafts/${enc(draftId)}/review` : `/v2/${enc(planId)}/reviews/current`;
    const [result, detail] = await Promise.all([planApi<PlanReviewView>(path, { language }), planApi<PlanV2Detail>(`/v2/${enc(planId)}`, { language })]);
    setEarned(detail.ok ? detail.data.score.total : null);
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
  const shell = <ShellPage title={t(r.reviewTitle)} subtitle={goal} />;

  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        {shell}
        {load.state === "loading" ? <Skeleton lines={8} />
          : load.state === "failed" ? <div data-plan-review-error=""><RetryCard title={t(r.loadFailed)} onRetry={() => void read()} /></div>
          : load.state === "none" ? <StartReview planId={planId} load={load} t={t} language={language} />
          : <ReviewBody key={load.view.draft.draftId} planId={planId} initial={load.view} earned={earned} t={t} language={language} backLabel={std.nav.back} />}
      </ToastProvider>
    </Orbit2026Scope>
  );
}

/** No open review: the same entry content as the overview's modal, on the page. */
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
    <Card className={styles.startCard} data-plan-review-start-card="">
      <p className={styles.strong}>{t(usedUp ? r.usedUpTitle : r.noReview)}</p>
      {!quota ? <PlanErrorNotice view={{ op: "other", tone: "failure" }} t={t} />
        : usedUp ? <UsedUpNote quota={quota} t={t} language={language} />
        : <ReviewEntryBody quota={quota} since={load.detail ? sinceFromDetail(load.detail) : { events: 0, stepsCompleted: 0, talked: 0 }} t={t} language={language} />}
      {error ? <PlanErrorNotice view={error} t={t} onRetry={() => void start()} /> : null}
      <div className={styles.actionsRow}>
        <Button variant={usedUp ? "primary" : "ghost"} label={usedUp ? std.action.gotIt : std.action.notNow} onClick={() => router.push(back)} />
        {quota && !usedUp ? <Button variant="primary" icon="sparkle" label={t(r.startReview)} loading={busy} onClick={() => void start()} data-plan-review-start="" /> : null}
      </div>
    </Card>
  );
}

type Problem = { kind: "error"; view: PlanErrorView; retry: (() => void) | null } | { kind: "stale" } | null;

function ReviewBody({ planId, initial, earned, t, language, backLabel }: { planId: string; initial: PlanReviewView; earned: number | null; t: Translate; language: OrbitLanguage; backLabel: string }) {
  const router = useRouter();
  const textId = useId();
  const [view, setView] = useState(initial);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [composerOpen, setComposerOpen] = useState(initial.draft.turns.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const running = useRef(false);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const { draft } = view;
  const left = view.reviewLeftThisMonth;
  const limit = view.reviewMonthlyLimit;
  const usedUp = left <= 0;
  const turns = draft.turns;
  const changedRows = premiseEdits(draft.premise, edits);
  const canSend = !usedUp && (changedRows.length > 0 || text.trim() !== "");
  const back = planTaskSegmentHref("web", planId);

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
    const result = await write<PlanReviewView>("send", `/drafts/${enc(draft.draftId)}/review/fix`, { premise, text: note || null });
    if (!result) return;
    if (result.ok) {
      setView(result.data);
      setEdits({});
      setText("");
      setEditing(null);
      setComposerOpen(false);
      return;
    }
    const failure = errorOf(result)!;
    if (failure.reason === "REVIEW_LIMIT") {
      setView((current) => ({ ...current, reviewLeftThisMonth: 0 }));
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
      setComposerOpen(result.data.draft.turns.length === 0);
      router.replace(reviewPageHref(planId, result.data.draft.draftId));
    } else if (errorOf(result)?.reason === "PLAN_NOT_FOUND" || errorOf(result)?.reason === "PLAN_ACHIEVED") router.push(back);
  };

  const openComposer = () => {
    setComposerOpen(true);
    window.setTimeout(() => textArea.current?.focus(), 0);
  };

  const stage = turns.length === 0 ? 0 : 1;
  const anyChange = turnHasChanges(turns);

  const composer = usedUp ? (
    <section className={`${styles.composer} ${styles.composerOff}`} data-plan-review-composer="off" aria-disabled>
      <b>{t(r.usedUpInput)}</b>
      <p className={styles.body}>{t(r.usedUpBody)}</p>
      <p className={styles.label}>{t(r.usedUpManual)} {t(r.resetsOn, { date: monthDay(view.resetsAt, language) })}</p>
      {turns.length === 0 ? <div className={styles.actionsRow}><Button variant="primary" label={standardCopyFor(language).action.gotIt} onClick={() => router.push(back)} data-plan-review-gotit="" /></div> : null}
    </section>
  ) : composerOpen ? (
    <section className={styles.composer} data-plan-review-composer="">
      <div className={styles.rowBetween}>
        <b data-plan-review-left={left}>{t(r.composerLeft, { n: left })}</b>
        <QuotaBar left={left} limit={limit} t={t} />
      </div>
      <p className={styles.label}>{t(r.composerRules, { limit })}</p>
      <label className={styles.label} htmlFor={textId}>{t(r.otherChanges)}</label>
      <textarea id={textId} ref={textArea} className={styles.textarea} value={text} maxLength={1000} placeholder={t(r.otherPlaceholder)} disabled={busy !== null}
        onChange={(event) => setText(event.target.value)} data-plan-review-text="" />
      <Button variant="primary" icon="sparkle" block label={t(r.send)} loading={busy === "send"} disabled={!canSend || busy !== null} onClick={() => void send()} data-plan-review-send="" />
      <p className={styles.label} data-plan-review-send-note="">{canSend ? t(r.sendNote, { from: left, to: left - 1 }) : t(r.sendNothing)}</p>
    </section>
  ) : null;

  return (
    <div className={styles.review} data-plan-review={draft.draftId} data-stage={stage}>
      <ol className={styles.stages} aria-label={t(r.reviewTitle)}>
        {[r.stagePremise, r.stageFix, r.stageManual].map((entry, index) => (
          <li key={entry.en} className={index === stage ? styles.stageNow : index < stage ? styles.stageDone : undefined} aria-current={index === stage ? "step" : undefined}>{t(entry)}</li>
        ))}
      </ol>
      {problem?.kind === "stale" ? (
        <div role="status" className={styles.notice} data-plan-review-stale="">
          <span>{t(r.staleTitle)}</span>
          <Button size="sm" label={t(r.loadLatest)} loading={busy === "reload"} onClick={() => void reloadLatest()} data-plan-review-reload="" />
        </div>
      ) : null}
      <div className={styles.columns}>
        <div className={styles.column}>
          <p className={styles.body}>{t(r.reviewLead)}</p>
          <PremiseCard view={view} edits={edits} editing={editing} t={t} language={language} disabled={usedUp || busy !== null}
            onEdit={(key) => { setEditing(key); if (key && turns.length > 0) setComposerOpen(true); }}
            onChange={(key, value) => { setEdits((current) => ({ ...current, [key]: value })); if (turns.length > 0) setComposerOpen(true); }} />
          {turns.length === 0 ? composer : null}
        </div>
        <div className={styles.column}>
          <section className={styles.side} aria-label={t(r.quotaTitle)} data-plan-review-quota={left}>
            <span className={styles.label}>{t(r.quotaTitle)}</span>
            <span className={styles.bigLeft}><b>{left}</b><span className={styles.label}> / {limit}</span></span>
            <QuotaBar left={left} limit={limit} t={t} />
            <span className={styles.label}>{t(r.composerRules, { limit })}</span>
          </section>
          {turns.map((turn) => <TurnCard key={turn.n} turns={turns} turn={turn} earned={earned} t={t} busy={busy} onToggle={toggle} />)}
          {turns.length ? <p className={styles.label}>{t(r.toggleNote)}</p> : null}
          {turns.length > 0 ? composer : null}
          {problem?.kind === "error" ? (
            <div data-plan-review-problem={problem.view.tone}>
              {problem.view.tone === "failure" && problem.view.op === "fix"
                ? <PlanErrorNotice view={{ op: "fix", tone: "failure" }} t={t} onRetry={problem.retry ?? undefined} />
                : <PlanErrorNotice view={problem.view} t={t} onRetry={problem.retry ?? undefined} />}
              {problem.view.tone === "failure" && problem.view.op === "fix" ? <p className={styles.label} data-plan-review-free="">{t(r.fixFailedBody)}</p> : null}
            </div>
          ) : null}
          <div className={styles.actionsRow} data-plan-review-actions="">
            <Button variant="ghost" label={backLabel} onClick={() => router.push(back)} />
            <span className={styles.push} />
            <Button label={t(r.manualOnce)} disabled={!draft.manualEditAvailable || busy !== null} onClick={() => router.push(planDraftEditHref("web", draft.draftId))} data-plan-review-manual="" />
            {turns.length > 0 && !usedUp && !composerOpen ? <Button label={t(r.again, { n: left })} disabled={busy !== null} onClick={openComposer} data-plan-review-again="" /> : null}
            {turns.length > 0 ? (anyChange
              ? <Button variant="accent" label={t(r.confirm)} loading={busy === "confirm"} disabled={busy !== null} onClick={() => void confirm()} data-plan-review-confirm="" />
              : <Button variant="accent" label={t(r.keepAsIs)} disabled={busy !== null} onClick={() => router.push(back)} data-plan-review-keep="" />) : null}
          </div>
          <p className={styles.label}>{t(r.manualNote)}</p>
        </div>
      </div>
    </div>
  );
}

function PremiseCard({ view, edits, editing, t, language, disabled, onEdit, onChange }: {
  view: PlanReviewView;
  language: OrbitLanguage;
  edits: Record<string, string>;
  editing: string | null;
  t: Translate;
  disabled: boolean;
  onEdit: (key: string | null) => void;
  onChange: (key: string, value: string) => void;
}) {
  const rows = premiseRows(view.draft.premise, view.premiseMarks, edits);
  const edited = rows.filter((row) => row.edited !== null).length;
  return (
    <Card className={styles.premise} data-plan-review-premise="">
      <div className={styles.rowBetween}>
        <span className={styles.row}><span aria-hidden>📌</span><b>{t(r.premiseCard)}</b></span>
        <span className={styles.label}>{edited ? t(r.premiseEdited, { n: edited }) : t(r.premiseLegend)}</span>
      </div>
      <ul className={styles.premiseRows}>
        {rows.map(({ row, mark, edited: newValue }) => {
          const source = premiseSource(row);
          const open = editing === row.key;
          return (
            <li key={row.key} className={`${styles.premiseRow} ${mark ? styles.marked : ""}`} data-premise={row.key} data-marked={mark ? "" : undefined} data-edited={newValue !== null ? "" : undefined}>
              <div className={styles.rowBetween}>
                <span className={styles.label}>{row.label}</span>
                <Chip label={source.n === undefined ? t(source.entry) : t(source.entry, { n: source.n })} />
              </div>
              {open ? (
                <input className={styles.inlineInput} autoFocus aria-label={t(r.editRow, { label: row.label })} value={edits[row.key] ?? row.value} maxLength={500}
                  onChange={(event) => onChange(row.key, event.target.value)}
                  onBlur={() => onEdit(null)}
                  onKeyDown={(event) => { if ((event.key === "Enter" && !event.nativeEvent.isComposing) || event.key === "Escape") onEdit(null); }} data-premise-input={row.key} />
              ) : (
                <button type="button" className={`btn ${styles.premiseValue}`} disabled={disabled} aria-label={t(r.editRow, { label: row.label })} onClick={() => onEdit(row.key)}>
                  {newValue !== null ? <><span className={styles.before}>{row.value}</span> <span className={styles.after}>{newValue}</span></> : row.value}
                </button>
              )}
              {mark ? (
                <div className={styles.mark} data-premise-mark={row.key}>
                  <Chip label={t(r.maybeChanged)} tone="pink" />
                  <span className={styles.label} data-premise-evidence={row.key}>{t(r.evidence, { text: markEvidence(mark, language) ?? t(r.evidenceRecords, { n: mark.evidenceIds.length }) })}</span>
                  {mark.suggested && mark.suggested !== row.value && newValue !== mark.suggested ? (
                    <button type="button" className={`btn ${styles.suggest}`} disabled={disabled} onClick={() => onChange(row.key, mark.suggested!)} data-premise-suggest={row.key}>{t(r.useSuggested, { value: mark.suggested })}</button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TurnCard({ turns, turn, earned, t, busy, onToggle }: { turns: readonly PlanDraftTurn[]; turn: PlanDraftTurn; earned: number | null; t: Translate; busy: string | null; onToggle: (change: PlanDraftChange, accepted: boolean) => Promise<void> }) {
  return (
    <section className={styles.turn} data-turn={turn.n}>
      {turn.input ? <p className={styles.bubble}>{turn.input}</p> : null}
      <Card>
        <div className={styles.rowBetween}>
          <span className={styles.row}><span aria-hidden>🧭</span><b>{t(r.turnTitle, { n: turn.n })}</b></span>
          {turn.changes.length === 0 ? <Chip label={t(r.noChangeCounts)} /> : <Chip label={t(r.turnUpdated)} tone="lav" />}
        </div>
        {turn.changes.length === 0 ? (
          <p className={styles.body} data-turn-no-change=""><b>{t(planFlowCopy.noChange)}</b>{turn.noChangeReason ? ` · ${turn.noChangeReason}` : ""}</p>
        ) : (
          <ul className={styles.changes}>
            {turn.changes.map((change) => {
              const off = change.accepted === false;
              const live = isToggleable(turns, turn, change);
              return (
                <li key={change.id ?? change.path} className={`${styles.change} ${off ? styles.changeOff : ""}`} data-change={change.id ?? change.path} data-accepted={off ? "false" : "true"}>
                  <div className={styles.changeBody}>
                    <span className={styles.row}><Chip label={t(planFlowCopy.changedTag)} tone="lav" /><b>{change.label}</b>{off ? <Chip label={t(r.rejected)} /> : null}{change.reason ? <WhyDisclosure reason={change.reason} /> : null}</span>
                    {change.before ? <span className={styles.before}>{change.before}</span> : null}
                    {change.after ? <span><span className={styles.after}>{change.after}</span></span> : null}
                  </div>
                  {live ? (
                    <span className={styles.toggles}>
                      <button type="button" className={`btn ${styles.toggle} ${!off ? styles.toggleOn : ""}`} aria-pressed={!off} aria-label={t(r.accept)} disabled={busy !== null} onClick={() => void onToggle(change, true)} data-toggle="accept">✓</button>
                      <button type="button" className={`btn ${styles.toggle} ${off ? styles.toggleOff : ""}`} aria-pressed={off} aria-label={t(r.reject)} disabled={busy !== null} onClick={() => void onToggle(change, false)} data-toggle="reject">✕</button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {turn.unchanged.length ? <p className={styles.label} data-turn-unchanged="">{t(planFlowCopy.unchanged, { list: turn.unchanged.join(" · ") })}</p> : null}
        {earned !== null ? <p className={styles.label} data-turn-earned="">{t(r.earnedSame, { from: earned, to: earned })}</p> : null}
      </Card>
    </section>
  );
}
