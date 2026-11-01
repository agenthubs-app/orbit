"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanDraftView, PlanMarkedText, PlanRef, PlanSource } from "../../../../../shared/contract/plan-v2";
import { PLAN_EVENT_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { flowTypeTone } from "./plan-model";
import type { Translate } from "./PlanParts";
import {
  DRAFT_V3_COUNT_MAX, DRAFT_V3_COUNT_MIN, DRAFT_V3_POINTS_MAX, DRAFT_V3_POINTS_MIN, PLAN_EVENT_SLOT,
  adjustTotal, groupTypesByStep, isFull, onTypes, setCount, setPoints, toggleType, typeChanged, type DraftV3Adjust,
} from "./draft-v3-model";
import s from "./DraftV3.module.css";

const TONE_CLASS: Record<ReturnType<typeof flowTypeTone>, string> = { apricot: s.emApricot!, blue: s.emBlue!, lav: s.emLav!, pink: s.emPink!, teal: s.emTeal! };
/** 字段表「底色：系统轮流 5 色」；v16 从蓝开始（蓝 → 青 → 杏 → 粉 → 薰衣草），即 R23 轮转表往前一格。 */
const toneClass = (index: number) => TONE_CLASS[flowTypeTone(index - 1)];

const VERDICT: Record<NonNullable<PlanDraftView["content"]["verdict"]>, { copy: OrbitCopyEntry; className: string }> = {
  conditional: { className: s.vConditional!, copy: planFlowCopy.v3VerdictConditional },
  feasible: { className: s.vFeasible!, copy: planFlowCopy.v3VerdictFeasible },
  not_recommended: { className: s.vNot!, copy: planFlowCopy.v3VerdictNot },
};
const CONFIDENCE: Record<"high" | "mid" | "low", OrbitCopyEntry> = { high: planFlowCopy.v3ConfHigh, low: planFlowCopy.v3ConfLow, mid: planFlowCopy.v3ConfMid };
const COMPARISON: Record<"preferred" | "possible" | "not_recommended", { copy: OrbitCopyEntry; bar: string; text: string }> = {
  not_recommended: { bar: s.barNo!, copy: planFlowCopy.v3CmpNot, text: s.vNo! },
  possible: { bar: s.barMid!, copy: planFlowCopy.v3CmpPossible, text: s.vMid! },
  preferred: { bar: s.barOk!, copy: planFlowCopy.v3CmpPreferred, text: s.vOk! },
};

/** 网页来源抓取后超过这个天数标「可能已更新」（PLANNER：180 天）。 */
const STALE_SOURCE_DAYS = 180;

type MeFacts = { headline: string | null; company: string | null; from: string | null; language: string | null };

/** 「用到的你的信息」的资料行（系统字段，展开时才读一次 /api/profile；读不到就全部「没填」）。 */
async function readMeFacts(): Promise<MeFacts> {
  try {
    const response = await fetch("/api/profile", { cache: "no-store" });
    const body = await response.json() as { success?: boolean; data?: { profile?: { headline?: string; organization?: string; homeMarket?: string; spokenLanguages?: readonly string[]; preferredLanguage?: string } | null } };
    const profile = response.ok && body.success === true ? body.data?.profile ?? null : null;
    const text = (value: string | undefined | null) => (value && value.trim() ? value.trim() : null);
    return { company: text(profile?.organization), from: text(profile?.homeMarket), headline: text(profile?.headline), language: profile?.spokenLanguages?.length ? profile.spokenLanguages.join(" · ") : text(profile?.preferredLanguage) };
  } catch {
    return { company: null, from: null, headline: null, language: null };
  }
}

function sourceOf(draft: PlanDraftView, source: PlanSource): { title: string; url: string | null; fetchedAt: string | null } {
  if (source.kind === "web") return { fetchedAt: source.fetchedAt, title: source.title, url: source.url };
  const citation = draft.citations.find((item) => item.id === source.landscapeId);
  return { fetchedAt: null, title: citation?.title ?? source.landscapeId, url: citation?.sourceUrl ?? null };
}

function formatDay(iso: string, language: OrbitLanguage): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > STALE_SOURCE_DAYS * 86_400_000;

/**
 * 理由段：按 `marks` 加粗（按下标切片，不按文字搜索）、每个 `ref` 的范围末尾放引用标记（来源号 / 「你的回答」）；
 * 指向不存在的来源 / 回答的标记跳过。
 */
function MarkedText({ value, marker }: { value: PlanMarkedText; marker: (ref: PlanRef, key: string) => ReactNode }) {
  const { text, marks, refs } = value;
  const cuts = new Set<number>([0, text.length]);
  for (const mark of marks) { cuts.add(mark.start); cuts.add(mark.end); }
  for (const ref of refs) cuts.add(ref.end);
  const points = [...cuts].filter((point) => point >= 0 && point <= text.length).sort((left, right) => left - right);
  const out: ReactNode[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const piece = text.slice(start, end);
    const bold = marks.some((mark) => mark.start <= start && end <= mark.end);
    out.push(bold ? <u key={`m${start}`}>{piece}</u> : piece);
    refs.forEach((ref, refIndex) => { if (ref.end === end) out.push(marker(ref.ref, `r${refIndex}`)); });
  }
  return <>{out}</>;
}

export interface DraftV3Props {
  draft: PlanDraftView;
  t: Translate;
  language: OrbitLanguage;
  adjust: DraftV3Adjust;
  onAdjust: (next: DraftV3Adjust) => void;
  busy: boolean;
  onConfirm: () => void;
  /** 「让 AI 改」：把焦点交给右栏的 AI 修正输入框。 */
  onAiFix: () => void;
}

/**
 * ④ 初版 v3（`content.schemaVersion === 3`，plan-draft-v5-proposal.html v16「初稿 · 确认」页）：结论区 / 路线 / 按阶段分组的
 * 可调类型表 / 依据区 / 底部确定条。类名与结构照原型；调整态在父组件（和右栏的「この内容で確定」共用），合计用 plan-allocation。
 */
export function DraftV3({ draft, t, language, adjust, onAdjust, busy, onConfirm, onAiFix }: DraftV3Props) {
  const content = draft.content;
  const [mine, setMine] = useState(false);
  const [me, setMe] = useState<MeFacts | null>(null);
  const [why, setWhy] = useState(false);
  const [full, setFull] = useState(false);
  const [openRef, setOpenRef] = useState<PlanRef | null>(null);
  const mineId = useId();
  const whyId = useId();
  const refId = useId();
  const moreId = useId();

  useEffect(() => {
    if (!mine || me) return;
    let alive = true;
    void readMeFacts().then((facts) => { if (alive) setMe(facts); });
    return () => { alive = false; };
  }, [mine, me]);

  const sources = content.sources ?? [];
  const sourceNumber = new Map(sources.map((source, index) => [source.id, index + 1]));
  const answers = draft.premise.filter((row) => row.source !== "background" && row.source !== "record");
  const premiseByKey = new Map(draft.premise.map((row) => [row.key, row]));
  const left = Math.max(0, draft.aiFixLimit - draft.aiFixUsed);
  const total = adjustTotal(draft, adjust);
  const ok = isFull(total);
  const kept = onTypes(content, adjust);
  const people = kept.reduce((sum, type) => sum + (adjust[type.key]?.targetCount ?? type.targetCount), 0);
  const groups = groupTypesByStep(content);
  const keyNumbers = content.keyNumbers ?? [];
  const risks = content.risks ?? [];
  const orderReasons = content.orderReasons ?? [];
  const comparison = content.comparison ?? null;
  const verdict = content.verdict ? VERDICT[content.verdict] : null;

  const srcMarker = (id: string, key: string) => {
    const n = sourceNumber.get(id);
    if (!n) return null;
    return <button key={key} type="button" className={s.src} aria-controls={refId} onClick={() => setOpenRef((current) => (current?.kind === "source" && current.sourceId === id ? null : { kind: "source", sourceId: id }))}>{n}</button>;
  };
  const marker = (ref: PlanRef, key: string) => {
    if (ref.kind === "source") return srcMarker(ref.sourceId, key);
    if (!premiseByKey.has(ref.questionKey)) return null;
    return <button key={key} type="button" className={s.sg} aria-controls={refId} onClick={() => setOpenRef((current) => (current?.kind === "answer" && current.questionKey === ref.questionKey ? null : ref))}>{t(planFlowCopy.v3ChipAnswer)}</button>;
  };
  const refText = (ref: PlanRef) => {
    if (ref.kind === "source") {
      const source = sources.find((item) => item.id === ref.sourceId);
      return source ? t(planFlowCopy.v3SourceRef, { n: sourceNumber.get(source.id) ?? 0, title: sourceOf(draft, source).title }) : "";
    }
    const row = premiseByKey.get(ref.questionKey);
    return row ? t(planFlowCopy.v3AnswerRef, { label: row.label, value: row.value }) : "";
  };
  const meRows: Array<{ label: OrbitCopyEntry; value: string | null }> = [
    { label: planFlowCopy.v3MeHeadline, value: me?.headline ?? null },
    { label: planFlowCopy.v3MeCompany, value: me?.company ?? null },
    { label: planFlowCopy.v3MeFrom, value: me?.from ?? null },
    { label: planFlowCopy.v3MeLanguage, value: me?.language ?? null },
  ];

  return (
    <div className={s.page} data-plan-draft="v3" data-plan-draft-v3={draft.draftId} data-plan-draft-total={total}>
      <div className={s.top}>
        <span className={s.crumb}>{t(planFlowCopy.v3Crumb)}</span>
        <button type="button" className={s.ai} onClick={onAiFix} data-plan-v3-aifix="">{t(planFlowCopy.v3AiFix, { n: left })}</button>
      </div>
      <div className={s.hero}>
        <button type="button" className={s.kick} aria-expanded={mine} aria-controls={mineId} onClick={() => setMine(!mine)} data-plan-v3-mine="">
          <i className={s.dot} aria-hidden />
          {t(planFlowCopy.v3BasedOnPrefix)}<u>{t(planFlowCopy.v3BasedOnMine, { answers: answers.length })}</u>{t(planFlowCopy.v3BasedOnSources, { sources: sources.length })} {mine ? "▴" : "▾"}
        </button>
        {mine ? (
          <div id={mineId} className={s.mine}>
            <div className={s.h}>{t(planFlowCopy.v3MineNote)}</div>
            {meRows.map((row) => (
              <div key={row.label.en} className={s.pr}>
                <span className={s.k}>{t(row.label)}</span>
                <span className={row.value ? undefined : s.none}>{row.value ?? t(planFlowCopy.v3NotFilled)}</span>
                {row.value ? <i className={s.sg}>{t(planFlowCopy.v3ChipProfile)}</i> : <span className={s.gaps}><Link href="/app/profile">{t(planFlowCopy.v3AddInfo)}</Link></span>}
              </div>
            ))}
            {answers.map((row) => (
              <div key={row.key} className={s.pr}><span className={s.k}>{row.label}</span><span>{row.value}</span><i className={s.sg}>{t(planFlowCopy.v3ChipAnswer)}</i></div>
            ))}
          </div>
        ) : null}
        {content.outcome ? <div className={s.goal}>{t(planFlowCopy.v3GoalLine, { outcome: content.outcome })}</div> : null}
        <h1>{content.conclusion}</h1>
        {content.summary ? <p className={s.sum} data-plan-v3-summary=""><MarkedText value={content.summary} marker={marker} /></p> : null}
        {openRef ? <div id={refId} className={s.why1} data-plan-v3-ref="">{refText(openRef)}</div> : null}
        {verdict || content.confidence ? (
          <div className={s.badges}>
            {verdict ? <span className={s.pill} data-plan-v3-verdict={content.verdict}><i className={verdict.className} aria-hidden />{t(verdict.copy)}</span> : null}
            {content.confidence ? <button type="button" className={s.pill} aria-expanded={why} aria-controls={whyId} onClick={() => setWhy(!why)} data-plan-v3-confidence={content.confidence.level}>{t(planFlowCopy.v3Confidence, { level: t(CONFIDENCE[content.confidence.level]) })} <span className={s.info}>ⓘ</span></button> : null}
          </div>
        ) : null}
        {why && content.confidence ? <div id={whyId} className={s.why1}>{content.confidence.reason}</div> : null}
      </div>

      <div className={s.route} style={{ "--route-edge": `${50 / Math.max(1, content.steps.length)}%`, gridTemplateColumns: `repeat(${Math.max(1, content.steps.length)}, 1fr)` } as React.CSSProperties} data-plan-v3-route="">
        {content.steps.map((step, index) => (
          <div key={step.key} className={`${s.st} ${index === 0 ? s.cur : ""}`} aria-current={index === 0 ? "step" : undefined}>
            <div className={s.node}>{index + 1}</div>
            <b>{step.title}</b>
            {step.why ? <span>{step.why}</span> : null}
          </div>
        ))}
      </div>

      <section className={s.section}>
        <div className={s.sh}><h2>{t(planFlowCopy.v3TypesTitle)}</h2><span>{t(planFlowCopy.v3TypesSub)}</span></div>
        <p className={s.guide}>{t(planFlowCopy.v3Guide)}</p>
        <div className={s.seats} data-plan-v3-types="">
          {groups.map((group) => (
            <div key={group.stepIndex ?? "none"} className={s.group}>
              {group.stepIndex !== null ? (
                <div className={s.stg}>
                  <b>{t(planFlowCopy.v3StageHead, { n: group.stepIndex + 1, title: content.steps[group.stepIndex]!.title })}</b>
                  <span>{t(planFlowCopy.v3StageDone, { text: content.steps[group.stepIndex]!.doneCriteria })}</span>
                </div>
              ) : null}
              {group.types.map((type) => {
                const index = content.personTypes.indexOf(type);
                const state = adjust[type.key] ?? { allocation: type.allocation, on: true, targetCount: type.targetCount };
                const on = state.on;
                return (
                  <div key={type.key} className={`${s.adj} ${on ? "" : s.off}`} data-type={type.key} data-plan-v3-type-on={on ? "true" : "false"}>
                    <span className={`${s.em} ${toneClass(index)}`} aria-hidden>{type.emoji}</span>
                    <span className={s.nm}>{type.shortLabel}{typeChanged(content, adjust, type.key) ? <i className={s.chg}>{t(planFlowCopy.v3Changed)}</i> : null}<small>{type.roleSituation}</small></span>
                    <span className={s.stp} data-plan-v3-count="">
                      <button type="button" aria-label="-" disabled={busy || !on || state.targetCount <= DRAFT_V3_COUNT_MIN} onClick={() => onAdjust(setCount(adjust, type.key, -1))}>−</button>
                      <b>{state.targetCount}<small>{t(planFlowCopy.samplePeople)}</small></b>
                      <button type="button" aria-label="+" disabled={busy || !on || state.targetCount >= DRAFT_V3_COUNT_MAX} onClick={() => onAdjust(setCount(adjust, type.key, 1))}>+</button>
                    </span>
                    <span className={s.stp} data-plan-v3-points="">
                      <button type="button" aria-label="-5" disabled={busy || !on || state.allocation <= DRAFT_V3_POINTS_MIN} onClick={() => onAdjust(setPoints(adjust, type.key, -5))}>−</button>
                      <b>{state.allocation}<small>{t(planFlowCopy.v3PointsUnit)}</small></b>
                      <button type="button" aria-label="+5" disabled={busy || !on || state.allocation >= DRAFT_V3_POINTS_MAX} onClick={() => onAdjust(setPoints(adjust, type.key, 5))}>+</button>
                    </span>
                    <button type="button" className={s.rm} title={t(on ? planFlowCopy.v3RemoveType : planFlowCopy.v3RestoreType)} aria-label={t(on ? planFlowCopy.v3RemoveType : planFlowCopy.v3RestoreType)} disabled={busy || (on && kept.length <= 1)} onClick={() => onAdjust(toggleType(adjust, type.key))} data-plan-v3-remove="">{on ? "×" : "↺"}</button>
                  </div>
                );
              })}
            </div>
          ))}
          <div className={s.adj} data-type={PLAN_EVENT_SLOT}>
            <span className={`${s.em} ${s.emPink}`} aria-hidden>🎟️</span>
            <span className={s.nm}>{planCopy(PLAN_EVENT_COPY, language)}<small>{t(planFlowCopy.eventRole)}</small></span>
            <span className={s.stp}><b>{content.event.targetCount}<small>{t(planFlowCopy.v3EventsUnit)}</small></b></span>
            <span className={s.stp}><b>{content.event.allocation}<small>{t(planFlowCopy.v3PointsUnit)}</small></b></span>
            <span />
          </div>
          <div className={s.tot} data-plan-v3-total={total}>
            <span>{t(planFlowCopy.v3TotalLine, { events: content.event.targetCount, people, types: kept.length })}</span>
            <span>{t(planFlowCopy.v3TotalPrefix)}<b className={ok ? undefined : s.bad}>{total}</b>{t(planFlowCopy.v3TotalSuffix)}{ok ? "" : t(planFlowCopy.v3TotalFix)}</span>
          </div>
        </div>
      </section>

      {orderReasons.length || comparison || keyNumbers.length || risks.length || sources.length ? (
        <section className={s.section}>
          <div className={s.sh}><h2>{t(planFlowCopy.v3WhyTitle)}</h2><span>{t(planFlowCopy.v3WhySub, { n: sources.length })}</span></div>
          <div className={s.evi} data-plan-v3-evidence={full ? "open" : "closed"}>
            {orderReasons.length ? (
              <>
                <div className={`${s.sh} ${s.shTight}`}><h2 className={s.h3}>{t(planFlowCopy.v3OrderTitle)}</h2></div>
                <ol className={s.ord}>{orderReasons.map((line, index) => <li key={index}>{line.text}{line.sourceIds.map((id) => srcMarker(id, `o${index}-${id}`))}</li>)}</ol>
              </>
            ) : null}
            {comparison ? (
              <>
                <div className={`${s.sh} ${s.shLadder}`}><h2 className={s.h3}>{comparison.title}</h2><span>{t(planFlowCopy.v3LadderSub)}</span></div>
                <p className={s.funnel}>{comparison.funnel}</p>
                <div className={s.ladder}>
                  {comparison.rows.map((row, index) => (
                    <div key={index} className={s.lr} data-plan-v3-cmp={row.verdict}>
                      <span>{row.label}{row.sourceIds.map((id) => srcMarker(id, `c${index}-${id}`))}</span>
                      <span className={s.bar}><i className={COMPARISON[row.verdict].bar} style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} /></span>
                      <span className={`${s.v} ${COMPARISON[row.verdict].text}`}>{t(COMPARISON[row.verdict].copy)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {full ? (
              <div id={moreId}>
                {keyNumbers.length ? (
                  <div className={s.nums}>
                    {keyNumbers.map((number, index) => <div key={index} className={s.nb}><b>{number.value}</b><span>{number.label}{number.sourceIds.map((id) => srcMarker(id, `n${index}-${id}`))}</span></div>)}
                  </div>
                ) : null}
                {risks.length ? (
                  <div className={s.risks}>
                    {risks.map((risk, index) => <div key={index} className={s.risk} data-plan-v3-risk={risk.kind}><span className={`${s.t} ${risk.kind === "risk" ? s.tRisk : s.tUnv}`}>{t(risk.kind === "risk" ? planFlowCopy.v3RiskTag : planFlowCopy.v3UnverifiedTag)}</span><span>{risk.text}</span></div>)}
                  </div>
                ) : null}
                {sources.length ? (
                  <ol className={s.srcl} data-plan-v3-sources="">
                    {sources.map((source, index) => {
                      const info = sourceOf(draft, source);
                      const stale = info.fetchedAt ? isStale(info.fetchedAt) : false;
                      return (
                        <li key={source.id} data-plan-v3-source={source.id} data-plan-v3-stale={stale ? "true" : undefined}>
                          <i className={s.src}>{index + 1}</i>
                          <span>{info.title}{info.fetchedAt ? `（${t(planFlowCopy.v3SourceFetched, { date: formatDay(info.fetchedAt, language) })}${stale ? ` · ${t(planFlowCopy.v3SourceMaybeUpdated)}` : ""}）` : ""}</span>
                          {info.url ? <a href={info.url} target="_blank" rel="noopener noreferrer">{t(planFlowCopy.v3SourceOpen)}</a> : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </div>
            ) : null}
            <button type="button" className={s.toggle} aria-expanded={full} aria-controls={moreId} onClick={() => setFull(!full)} data-plan-v3-more="">
              {full ? t(planFlowCopy.v3Less) : t(planFlowCopy.v3More, { numbers: keyNumbers.length, risks: risks.length, sources: sources.length })}
            </button>
          </div>
        </section>
      ) : null}

      <div className={s.dockWrap}>
        <div className={s.dock} data-plan-v3-dock="">
          <div className={s.in}>
            <span className={`${s.sumline} ${ok ? "" : s.bad}`}>{ok ? t(planFlowCopy.v3DockOk) : t(planFlowCopy.v3DockBad, { total })}</span>
            {/* 「重新起草」：原型有、没有对应接口（主会话 2026-11-01：按原型位置画、置灰，接重新生成接口还是去掉待用户拍板）。 */}
            <button type="button" className={s.btn} disabled aria-disabled="true" data-plan-v3-redraft="">{t(planFlowCopy.v3Redraft)}</button>
            <button type="button" className={`${s.btn} ${s.pri}`} disabled={!ok || busy} aria-busy={busy || undefined} onClick={onConfirm} data-plan-v3-confirm="">{t(planFlowCopy.confirmPlan)}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
