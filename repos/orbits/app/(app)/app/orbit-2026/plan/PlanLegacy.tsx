"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { PlanLegacyDetail, PlanLegacyItem } from "../../../../../shared/contract/plan-v2";
import { planNewGoalHref, planLegacyHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planReviewCopy as r } from "../copy/plan";
import { standardCopyFor } from "../copy/standard";
import { ShellPage } from "../shell/slots";
import { EmptyState, Icon, Orbit2026Scope, RetryCard, Skeleton, avatarTone, initials } from "../ui";
import { planApi } from "./plan-api";
import { translator, type Translate } from "./PlanParts";
import { LEGACY_KIND_COPY, legacyGroups, longDate, legacyStatusCopy, type LegacyKind } from "./review-model";
import k from "./ReviewKit.module.css";
import l from "./LegacyScreen.module.css";

/** 旧计划的阶段 id 是 p1 / p2…（模拟器走查：直接显示内部代号用户看不懂）→「阶段 1」；其他格式原样。 */
export function legacyPhaseLabel(phase: string, t: Translate): string {
  const match = /^p(\d+)$/i.exec(phase.trim());
  return match ? t(r.legacyPhase, { n: Number(match[1]) }) : phase;
}

const KIND_TILE: Record<LegacyKind, { emoji: string; tone: string }> = {
  action: { emoji: "✅", tone: k.teal! },
  event: { emoji: "🎟️", tone: k.apricot! },
  info: { emoji: "📚", tone: k.blue! },
  network_need: { emoji: "👥", tone: k.lav! },
};
const DONE_STATUSES = new Set(["done", "established", "attended", "answered"]);
const LIVE_STATUSES = new Set(["in_progress", "linked", "registered"]);

function statusChip(status: string, t: Translate) {
  const copy = legacyStatusCopy(status);
  if (!copy) return null;
  const tone = DONE_STATUSES.has(status) ? l.chipTeal : LIVE_STATUSES.has(status) ? l.chipLav : "";
  return <span className={`${k.chip} ${tone}`}>{t(copy)}</span>;
}

/** Step n / total + kit .bar, and 会いたい人 n (b12 W-R25-12 / 13). */
function LegacySteps({ plan, t }: { plan: PlanLegacyItem; t: Translate }) {
  const ratio = plan.actionsTotal > 0 ? Math.min(100, (plan.actionsDone / plan.actionsTotal) * 100) : 0;
  return (
    <div data-legacy-steps="">
      <div className={`${k.row} ${k.between} ${l.statHead}`}><b>{t(r.legacyStep)}</b><span className={l.muted}><b className={l.num}>{plan.actionsDone}</b> / {plan.actionsTotal}</span></div>
      <div className={l.bar}><i style={{ width: `${ratio}%` }} /></div>
    </div>
  );
}

/** 会いたい人 n + the people already matched (kit .v2avs, up to 4). */
function LegacyNeeds({ plan, t, className, people = [] }: { plan: PlanLegacyItem; t: Translate; className?: string; people?: readonly string[] }) {
  return (
    <div className={`${k.row} ${k.between} ${l.statHead} ${className ?? ""}`} data-legacy-needs="">
      <b>{t(r.legacyNeeds, { n: plan.needs })}</b>
      {people.length ? <div className={l.avs} aria-hidden>{people.slice(0, 4).map((name) => <span key={name} className={`${l.av} ${l[`av_${avatarTone(name)}`] ?? ""}`}>{initials(name)}</span>)}</div> : null}
    </div>
  );
}

/** The rail（b12 W-R25-12 / 13）: iOrbit, 「このプランについて質問」, and what Orbit does not promise. */
function LegacyRail({ t }: { t: Translate }) {
  return (
    <div className={k.railStack}>
      <h2 className={k.railH}><Icon name="sparkle" size={16} />{t(r.iorbitTitle)}</h2>
      <Link href="/app/agent" className={k.assistIn} data-plan-legacy-ask=""><Icon name="sparkle" size={16} />{t(r.askAboutPlan)}</Link>
      <div className={`${k.card} ${k.flat} ${k.railNote}`}>{t(r.planDisclaimer)}</div>
    </div>
  );
}

/**
 * Task › プラン for someone with a v1 plan and no v2 goal（b12 W-R25-12）: 「以前のプラン」 (read
 * only) and 「新しいプランを作る」 (→ 目標入力), beside スコアのしくみ. No edit, no re-analysis.
 */
export function PlanLegacyCard({ plan }: { plan: PlanLegacyItem }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const router = useRouter();
  // The list has no people: the matched needs (avatars beside 会いたい人) come from the plan's read-only detail.
  const [people, setPeople] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void planApi<PlanLegacyDetail>(`/legacy/${encodeURIComponent(plan.planId)}`, { language }).then((result) => {
      if (alive && result.ok) setPeople(result.data.items.filter((item) => item.kind === "network_need" && item.contactName).map((item) => item.contactName!));
    });
    return () => { alive = false; };
  }, [plan.planId, language]);
  return (
    <Orbit2026Scope language={language} className={l.slot}>
      <ShellPage rightRail={<LegacyRail t={t} />} />
      <div className={l.wgrid}>
        <section className={`${k.card} ${l.span7} ${l.lg}`} data-plan-legacy-card={plan.planId}>
          <div className={`${k.row} ${l.chipRow}`}>
            <span className={k.chip}>{t(r.legacyTitle)}</span>
            <span className={k.chip}>{t(r.legacyReadOnly)}</span>
            <span className={`${k.chip} ${l.chipEnd} ${plan.status === "active" ? l.chipTeal : ""}`}>{t(plan.status === "active" ? r.legacyActive : r.legacyArchived)}</span>
          </div>
          <div className={l.goal} data-legacy-goal="">{plan.goal}</div>
          <div className={k.lbl}>{t(r.legacyStarted, { date: longDate(plan.startsOn, language) })}{plan.phase ? ` · ${t(r.legacyPhase, { n: plan.phase.number })}` : ""}</div>
          <div className={`${k.grid2} ${l.stats}`}><LegacySteps plan={plan} t={t} /><LegacyNeeds plan={plan} t={t} className={l.needsTop} people={people} /></div>
          <div className={`${k.sub} ${l.lead}`}>{t(r.legacyLead)}</div>
          <div className={`${k.row} ${l.acts}`}>
            <Link href={planLegacyHref("web", plan.planId)} className={`btn ${k.btn}`} data-plan-legacy-open="">{t(r.legacyOpen)}</Link>
            <button type="button" className={`btn ${k.btn} ${k.primary}`} onClick={() => router.push(planNewGoalHref("web"))} data-plan-legacy-new=""><Icon name="sparkle" size={16} />{t(r.newPlan)}</button>
            <span className={k.lbl}>{t(r.newPlanNote)}</span>
          </div>
        </section>
        <section className={`${k.card} ${l.span5}`} data-plan-score-how="">
          <div className={l.cardH}><h3>{t(r.scoreHowTitle)}</h3></div>
          {([["🗣️", k.lav, r.howTalked, r.howTalkedSub], ["🎯", k.pink, r.howTarget, r.howTargetSub], ["🧠", k.teal, r.howSkip, r.howSkipSub]] as const).map(([emoji, tone, title, sub]) => (
            <div key={emoji} className={`${k.row} ${l.howRow}`}>
              <span className={`${k.emo} ${k.emoSm} ${tone}`} aria-hidden>{emoji}</span>
              <div><b>{t(title)}</b><div className={k.lbl}>{t(sub)}</div></div>
            </div>
          ))}
        </section>
      </div>
    </Orbit2026Scope>
  );
}

/** `/app/plans/legacy/[planId]`（b12 W-R25-13）: the v1 plan, read only — items grouped by kind with their status. */
export function PlanLegacyScreen({ planId }: { planId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const router = useRouter();
  const std = standardCopyFor(language);
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

  const back = planTaskSegmentHref("web");
  const rail = <LegacyRail t={t} />;
  return (
    <Orbit2026Scope language={language} className={l.slot}>
      <ShellPage title={t(r.legacyTitle)} subtitle={plan ? t(r.legacyHeadSub, { date: longDate(plan.startsOn, language), goal: plan.goal }) : undefined} rightRail={rail}
        left={<Link href={back} className={`btn ${k.rbtn}`} aria-label={std.nav.back} data-plan-legacy-back=""><Icon name="left" size={20} /></Link>}
        right={<span className={k.chip}>{t(r.legacyReadOnly)}</span>} />
      {state === "loading" ? <Skeleton lines={6} />
        : state === "failed" ? <div data-plan-legacy-error=""><RetryCard title={t(r.legacyLoadFailed)} onRetry={() => void load()} /></div>
        : state === "missing" || !plan ? <div data-plan-legacy-missing=""><EmptyState title={t(r.legacyNotFound)} /><button type="button" className={`btn ${k.btn} ${k.ghost}`} onClick={() => router.push(back)}>{t(r.later)}</button></div>
        : (
          <div className={l.wgrid} data-plan-legacy={plan.planId}>
            <section className={`${k.card} ${l.span12}`}>
              <div className={`${k.row} ${l.headRow}`}>
                <div className={k.grow}>
                  {plan.analysisSummary ? <><div className={`${k.lbl} ${l.summaryLbl}`}>{t(r.legacySummary)}</div><div className={`${k.sub} ${l.summary}`} data-legacy-summary="">{plan.analysisSummary}</div></> : null}
                  <div className={k.lbl} style={{ marginTop: plan.analysisSummary ? 10 : 0 }}>{t(r.legacyLead)}</div>
                </div>
                <div className={l.side}><LegacySteps plan={plan} t={t} /><LegacyNeeds plan={plan} t={t} className={l.side2} people={plan.items.filter((item) => item.kind === "network_need" && item.contactName).map((item) => item.contactName!)} /></div>
              </div>
            </section>
            {legacyGroups(plan.items).map((group) => {
              const tile = KIND_TILE[group.kind];
              // フェーズ n: the server's phaseNumber; an older server without it → the raw code via legacyPhaseLabel.
              const phaseOf = (item: (typeof group.items)[number]) => (item.phaseNumber ? t(r.legacyPhase, { n: item.phaseNumber }) : item.phase ? legacyPhaseLabel(item.phase, t) : "");
              const phases = [...new Set(group.items.map(phaseOf))];
              return (
                <section key={group.kind} className={`${k.card} ${l.span6}`} data-legacy-group={group.kind}>
                  <div className={l.cardH}><h3><span className={`${k.emo} ${k.emoSm} ${tile.tone} ${l.emoGap}`} aria-hidden>{tile.emoji}</span>{t(LEGACY_KIND_COPY[group.kind])}</h3></div>
                  {phases.map((phase) => (
                    <div key={phase || "none"}>
                      {group.kind === "action" && phase ? <div className={`${k.lbl} ${l.phase}`}>{phase}</div> : null}
                      <div className={l.list}>
                        {group.items.filter((item) => phaseOf(item) === phase).map((item, index) => {
                          const need = group.kind === "network_need";
                          const sub = need ? (item.contactName ? [item.organization, item.detail].filter(Boolean).join(" · ") : t(r.notInNetwork)) : group.kind !== "action" ? phase : "";
                          return (
                            <div key={`${group.kind}-${phase}-${index}`} className={l.li} data-legacy-item={item.status}>
                              {need ? <span className={`${l.av} ${item.contactName ? l[`av_${avatarTone(item.contactName)}`] ?? "" : l.avNone}`} aria-hidden>{item.contactName ? initials(item.contactName) : "?"}</span> : null}
                              <div className={l.meta}><b>{need ? item.contactName ?? item.title : item.title}</b>{sub ? <span>{sub}</span> : null}</div>
                              {statusChip(item.status, t)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
            {plan.items.length === 0 ? <p className={k.lbl}>{t(r.legacyEmpty)}</p> : null}
          </div>
        )}
    </Orbit2026Scope>
  );
}
