"use client";

/**
 * R37a：初稿页（`DraftV3`）与计划主页（`PlanHomeV3`）共用的 v3 部件——路线、依据区、按下标切片的 `MarkedText`。
 * 类名沿用 `DraftV3.module.css`（门禁 style-diff 配对靠文字键；两页同一套样式）。
 */
import { useId, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanMarkedText, PlanRef, PlanSource, PlanV2Content, PlanV2Step } from "../../../../../shared/contract/plan-v2";
import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import type { Translate } from "./PlanParts";
import s from "./DraftV3.module.css";

const COMPARISON: Record<"preferred" | "possible" | "not_recommended", { copy: OrbitCopyEntry; bar: string; text: string }> = {
  not_recommended: { bar: s.barNo!, copy: planFlowCopy.v3CmpNot, text: s.vNo! },
  possible: { bar: s.barMid!, copy: planFlowCopy.v3CmpPossible, text: s.vMid! },
  preferred: { bar: s.barOk!, copy: planFlowCopy.v3CmpPreferred, text: s.vOk! },
};

/** 网页来源抓取后超过这个天数标「可能已更新」（R36a PLANNER：180 天）。 */
const STALE_SOURCE_DAYS = 180;

export function formatDay(iso: string, language: OrbitLanguage): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > STALE_SOURCE_DAYS * 86_400_000;

/**
 * 理由段：按 `marks` 加粗（按下标切片，不按文字搜索）、每个 `ref` 的范围末尾放引用标记（来源号 / 「你的回答」）；
 * 指向不存在的来源 / 回答的标记跳过。
 */
export function MarkedText({ value, marker }: { value: PlanMarkedText; marker: (ref: PlanRef, key: string) => ReactNode }) {
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

/**
 * 路线：阶段节点 + 标题 + 副标题（`steps[].why`，缺省不画）；`current` 为当前阶段（0 起）。
 * `done`：主页在每段下写「完成标志：…」（原型 `route(g, true)`）。
 */
export function Route({ steps, current = 0, done }: { steps: readonly PlanV2Step[]; current?: number; done?: (step: PlanV2Step) => ReactNode }) {
  return (
    <div className={s.route} style={{ "--route-edge": `${50 / Math.max(1, steps.length)}%`, gridTemplateColumns: `repeat(${Math.max(1, steps.length)}, 1fr)` } as React.CSSProperties} data-plan-v3-route="">
      {steps.map((step, index) => (
        <div key={step.key} className={`${s.st} ${index === current ? s.cur : ""}`} aria-current={index === current ? "step" : undefined}>
          <div className={s.node}>{index + 1}</div>
          <b>{step.title}</b>
          {step.why ? <span>{step.why}</span> : null}
          {done ? <em>{done(step)}</em> : null}
        </div>
      ))}
    </div>
  );
}

export interface EvidenceProps {
  content: PlanV2Content;
  t: Translate;
  language: OrbitLanguage;
  sourceInfo: (source: PlanSource) => { title: string; url: string | null; fetchedAt: string | null };
  /** 来源号（初稿页 = 可点开的按钮；主页 = 静态角标）。 */
  marker: (sourceId: string, key: string) => ReactNode;
}

/** 依据区（为什么这么排 / 对比条 / 折叠的关键数字、风险、来源清单）。 */
export function Evidence({ content, t, language, sourceInfo, marker }: EvidenceProps) {
  const [full, setFull] = useState(false);
  const moreId = useId();
  const keyNumbers = content.keyNumbers ?? [];
  const risks = content.risks ?? [];
  const orderReasons = content.orderReasons ?? [];
  const comparison = content.comparison ?? null;
  const sources = content.sources ?? [];
  return (
    <div className={s.evi} data-plan-v3-evidence={full ? "open" : "closed"}>
      {orderReasons.length ? (
        <>
          <div className={`${s.sh} ${s.shTight}`}><h2 className={s.h3}>{t(planFlowCopy.v3OrderTitle)}</h2></div>
          <ol className={s.ord}>{orderReasons.map((line, index) => <li key={index}>{line.text}{line.sourceIds.map((id) => marker(id, `o${index}-${id}`))}</li>)}</ol>
        </>
      ) : null}
      {comparison ? (
        <>
          <div className={`${s.sh} ${s.shLadder}`}><h2 className={s.h3}>{comparison.title}</h2><span>{t(planFlowCopy.v3LadderSub)}</span></div>
          <p className={s.funnel}>{comparison.funnel}</p>
          <div className={s.ladder}>
            {comparison.rows.map((row, index) => (
              <div key={index} className={s.lr} data-plan-v3-cmp={row.verdict}>
                <span>{row.label}{row.sourceIds.map((id) => marker(id, `c${index}-${id}`))}</span>
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
              {keyNumbers.map((number, index) => <div key={index} className={s.nb}><b>{number.value}</b><span>{number.label}{number.sourceIds.map((id) => marker(id, `n${index}-${id}`))}</span></div>)}
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
                const info = sourceInfo(source);
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
  );
}

export type { PlanMarkedText, PlanRef };
