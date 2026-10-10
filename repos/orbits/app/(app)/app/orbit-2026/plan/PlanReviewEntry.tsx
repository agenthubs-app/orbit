"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanQuotaResponse, PlanReviewView } from "../../../../../shared/contract/plan-v2";
import { planReviewHref } from "../../../../../shared/compute/plan-href";
import { planReviewCopy as r } from "../copy/plan";
import { Button, Modal, Skeleton, useStandardCopy } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, type Translate } from "./PlanParts";
import { daysUntil, monthDay, quotaCells } from "./review-model";
import styles from "./review.module.css";

type Since = PlanReviewView["sinceConfirmed"];

/** The review page for a draft (`?draft=` so the page reads that exact draft). */
export function reviewPageHref(planId: string, draftId?: string | null): string {
  const base = planReviewHref("web", planId);
  return draftId ? `${base}?draft=${encodeURIComponent(draftId)}` : base;
}

/** 3 cells: used grey, left dark plum (b4 A4 ①). */
export function QuotaBar({ left, limit, t }: { left: number; limit: number; t: Translate }) {
  return (
    <div className={styles.quotaBar} role="img" aria-label={t(r.quotaCells, { limit, used: Math.max(0, limit - left) })} data-plan-quota-bar={left}>
      {quotaCells(left, limit).map((cell, index) => <i key={index} className={cell === "left" ? styles.cellLeft : styles.cellUsed} data-cell={cell} />)}
    </div>
  );
}

/** A4 ②: what still works when the month's reviews are used up. Never a paid plan link (Q6). */
export function UsedUpNote({ quota, t, language }: { quota: Pick<PlanQuotaResponse, "reviewMonthlyLimit" | "resetsAt">; t: Translate; language: OrbitLanguage }) {
  return (
    <div className={styles.usedUp} data-plan-review-used-up="">
      <span className={styles.usedUpIcon} aria-hidden>⏳</span>
      <p className={styles.label}>{t(r.usedUpCount, { date: monthDay(quota.resetsAt, language), days: daysUntil(quota.resetsAt), limit: quota.reviewMonthlyLimit })}</p>
      <p className={styles.body}>{t(r.usedUpBody)}</p>
      <p className={styles.body}>{t(r.usedUpScore)}</p>
    </div>
  );
}

/** The entry body: quota, reset date and the data this review will read. */
export function ReviewEntryBody({ quota, since, t, language }: { quota: PlanQuotaResponse; since: Since; t: Translate; language: OrbitLanguage }) {
  return (
    <div className={styles.entry} data-plan-review-entry="">
      <p className={styles.body}>{t(r.entryLead)}</p>
      <section className={styles.entryBox} aria-label={t(r.quotaTitle)}>
        <div className={styles.rowBetween}>
          <span className={styles.label}>{t(r.quotaTitle)}</span>
          <b className={styles.strong} data-plan-review-left={quota.reviewLeftThisMonth}>{t(r.quotaLeft, { n: quota.reviewLeftThisMonth })}</b>
        </div>
        <QuotaBar left={quota.reviewLeftThisMonth} limit={quota.reviewMonthlyLimit} t={t} />
        <p className={styles.label}>{t(r.quotaRules, { limit: quota.reviewMonthlyLimit })}</p>
        <p className={styles.label}>{t(r.resetsOn, { date: monthDay(quota.resetsAt, language) })}</p>
      </section>
      <section className={styles.entryBox} aria-label={t(r.dataTitle)} data-plan-review-data="">
        <span className={styles.label}>{t(r.dataTitle)}</span>
        <div className={styles.dataRow}>
          <span>{t(r.dataTalked, { n: since.talked })}</span>
          <span>{t(r.dataEvents, { n: since.events })}</span>
          <span>{t(r.dataSteps, { n: since.stepsCompleted })}</span>
        </div>
      </section>
      <p className={styles.label}>{t(r.startNote)}</p>
    </div>
  );
}

/**
 * 「方案を見直す」 entry (b4 A4 ① / ②, Web modal). Opening reads the quota (and an open
 * review's counts); only 「iOrbit で見直す」 writes (`POST …/reviews`, which uses nothing).
 */
export function ReviewEntryModal({ open, onClose, planId, serverSince = null, fallbackSince, t, language }: {
  open: boolean;
  onClose: () => void;
  planId: string;
  /** The overview's `sinceConfirmed` (server): used first, no extra read. */
  serverSince?: Since | null;
  fallbackSince: Since;
  t: Translate;
  language: OrbitLanguage;
}) {
  const router = useRouter();
  const copy = useStandardCopy();
  const [quota, setQuota] = useState<PlanQuotaResponse | null>(null);
  const [since, setSince] = useState<Since | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlanErrorView | null>(null);
  const running = useRef(false);

  const hasServerSince = serverSince !== null;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFailed(false);
    setError(null);
    void Promise.all([
      planApi<PlanQuotaResponse>("/v2/quota", { language }),
      hasServerSince ? Promise.resolve(null) : planApi<PlanReviewView>(`/v2/${encodeURIComponent(planId)}/reviews/current`, { language }),
    ]).then(([quotaResult, current]) => {
      if (!alive) return;
      if (quotaResult.ok) setQuota(quotaResult.data); else setFailed(true);
      setSince(current && current.ok ? current.data.sinceConfirmed : null);
    });
    return () => { alive = false; };
  }, [open, planId, language, hasServerSince]);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    const result = await planApi<PlanReviewView>(`/v2/${encodeURIComponent(planId)}/reviews`, { body: { idempotencyKey: newActionKey() }, language });
    running.current = false;
    setBusy(false);
    if (result.ok === false) { setError(planErrorView(result.error, "other")); return; }
    router.push(reviewPageHref(planId, result.data.draft.draftId));
  };

  const usedUp = quota !== null && quota.reviewLeftThisMonth <= 0;
  const actions = !quota ? undefined : usedUp
    ? <Button variant="primary" label={copy.action.gotIt} onClick={onClose} data-plan-review-gotit="" />
    : <><Button variant="ghost" label={copy.action.notNow} onClick={onClose} /><Button variant="primary" icon="sparkle" label={t(r.startReview)} loading={busy} onClick={() => void start()} data-plan-review-start="" /></>;

  return (
    <Modal open={open} onClose={onClose} title={t(usedUp ? r.usedUpTitle : r.entryTitle)} size={560} actions={actions}>
      {failed ? <PlanErrorNotice view={{ op: "other", tone: "failure" }} t={t} />
        : !quota ? <Skeleton lines={4} />
        : usedUp ? <UsedUpNote quota={quota} t={t} language={language} />
        : <ReviewEntryBody quota={quota} since={serverSince ?? since ?? fallbackSince} t={t} language={language} />}
      {error ? <PlanErrorNotice view={error} t={t} onRetry={() => void start()} /> : null}
    </Modal>
  );
}
