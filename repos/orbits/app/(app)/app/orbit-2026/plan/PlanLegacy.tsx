"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { PlanLegacyDetail, PlanLegacyItem } from "../../../../../shared/contract/plan-v2";
import { planLegacyHref, planNewGoalHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planReviewCopy as r } from "../copy/plan";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, EmptyState, MacTile, Orbit2026Scope, RetryCard, Skeleton } from "../ui";
import { planApi } from "./plan-api";
import { translator, type Translate } from "./PlanParts";
import { LEGACY_KIND_COPY, fullDate, legacyGroups, legacyStatusCopy } from "./review-model";
import styles from "./review.module.css";

function LegacyMeta({ plan, t, language }: { plan: PlanLegacyItem; t: Translate; language: "ja" | "zh" | "en" }) {
  return (
    <div className={styles.legacyMeta}>
      <Chip label={t(plan.status === "active" ? r.legacyActive : r.legacyArchived)} tone={plan.status === "active" ? "lav" : "neutral"} />
      <span className={styles.label}>{t(r.legacyStarted, { date: fullDate(plan.startsOn, language) })}</span>
      <span className={styles.label} data-legacy-steps="">{t(r.legacySteps, { done: plan.actionsDone, total: plan.actionsTotal })}</span>
      <span className={styles.label} data-legacy-needs="">{t(r.legacyNeeds, { n: plan.needs })}</span>
    </div>
  );
}

/**
 * Task › プラン for someone with a v1 plan and no v2 goal: 「以前のプラン」 (read only)
 * and 「新しいプランを作る」 (→ 目標入力). No edit, no re-analysis (v1 is closed, R25).
 */
export function PlanLegacyCard({ plan }: { plan: PlanLegacyItem }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const router = useRouter();
  return (
    <Orbit2026Scope language={language} className={styles.slot}>
      <Card data-plan-legacy-card={plan.planId}>
        <div className={styles.recapHead}>
          <MacTile emoji="🗂️" tone="apricot" />
          <div className={styles.grow}>
            <span className={styles.label}>{t(r.legacyTitle)}</span>
            <b className={styles.recapTitle} data-legacy-goal="">{plan.goal}</b>
          </div>
        </div>
        <LegacyMeta plan={plan} t={t} language={language} />
        <p className={styles.body}>{t(r.legacyLead)}</p>
        <p className={styles.label}>{t(r.newPlanNote)}</p>
        <div className={styles.actionsRow}>
          <Link href={planLegacyHref("web", plan.planId)} className={styles.textLink} data-plan-legacy-open="">{t(r.legacyOpen)}</Link>
          <span className={styles.push} />
          <Button variant="primary" icon="plus" label={t(r.newPlan)} onClick={() => router.push(planNewGoalHref("web"))} data-plan-legacy-new="" />
        </div>
      </Card>
    </Orbit2026Scope>
  );
}

/** `/app/plans/legacy/[planId]`: the v1 plan, read only — items grouped by kind with their status. */
export function PlanLegacyScreen({ planId }: { planId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const router = useRouter();
  const [plan, setPlan] = useState<PlanLegacyDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  const load = useCallback(async () => {
    setState("loading");
    const result = await planApi<PlanLegacyDetail>(`/legacy/${encodeURIComponent(planId)}`, { language });
    if (result.ok === false) { setState(result.error.status === 404 ? "missing" : "failed"); return; }
    setPlan(result.data);
    setState("ready");
  }, [planId, language]);
  useEffect(() => { void load(); }, [load]);

  const back = <Button variant="ghost" label={t(r.later)} onClick={() => router.push(planTaskSegmentHref("web"))} data-plan-legacy-back="" />;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ShellPage title={t(r.legacyTitle)} subtitle={plan?.goal} />
      {state === "loading" ? <Skeleton lines={6} />
        : state === "failed" ? <div data-plan-legacy-error=""><RetryCard title={t(r.legacyLoadFailed)} onRetry={() => void load()} /></div>
        : state === "missing" || !plan ? <div data-plan-legacy-missing=""><EmptyState title={t(r.legacyNotFound)} />{back}</div>
        : (
          <div className={styles.legacy} data-plan-legacy={plan.planId}>
            <Card>
              <div className={styles.rowBetween}><b className={styles.recapTitle}>{plan.goal}</b><Chip label={t(r.legacyReadOnly)} /></div>
              <LegacyMeta plan={plan} t={t} language={language} />
              <p className={styles.label}>{t(r.legacyLead)}</p>
              {plan.analysisSummary ? <><span className={styles.label}>{t(r.legacySummary)}</span><p className={styles.body} data-legacy-summary="">{plan.analysisSummary}</p></> : null}
            </Card>
            {legacyGroups(plan.items).map((group) => (
              <Card key={group.kind} title={t(LEGACY_KIND_COPY[group.kind])} data-legacy-group={group.kind}>
                <ul className={styles.legacyItems}>
                  {group.items.map((item, index) => {
                    const status = legacyStatusCopy(item.status);
                    return (
                      <li key={`${group.kind}-${index}`} data-legacy-item={item.status}>
                        <span className={styles.grow}>{item.title}</span>
                        {item.phase ? <span className={styles.label}>{item.phase}</span> : null}
                        {status ? <Chip label={t(status)} tone={item.status === "done" || item.status === "established" || item.status === "attended" || item.status === "answered" ? "ok" : "neutral"} /> : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
            {plan.items.length === 0 ? <p className={styles.label}>{t(r.legacyEmpty)}</p> : null}
            <div className={styles.actionsRow}>
              {back}
              <span className={styles.push} />
              <Button variant="primary" icon="plus" label={t(r.newPlan)} onClick={() => router.push(planNewGoalHref("web"))} data-plan-legacy-new="" />
            </div>
          </div>
        )}
    </Orbit2026Scope>
  );
}
