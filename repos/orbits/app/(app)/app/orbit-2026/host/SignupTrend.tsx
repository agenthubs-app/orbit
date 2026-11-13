"use client";

/**
 * 申込の推移（主催 概要 / レポート共用）。2026-11-13 用户要求重做：原来的一排无轴细柱看不出日期和人数，
 * 结束的活动还挤在最右。现在：
 * - 柱子铺满整个宽度（服务端已裁掉开头没人报名的日子），每根柱宽上限 40px；
 * - 下方日期轴（M/D，柱多时隔几天标一个，最后一天总是标出）；
 * - 左上角合计与最多的一天；只在峰值柱上直接写人数，其余靠悬停 / 聚焦提示（每根柱都能 Tab 到）；
 * - 0 人的日子画一条 2px 的底线，日期仍在；
 * - 读屏用隐藏表格逐日读出。
 */
import { useState } from "react";

import type { HostT } from "./host-model";
import st from "./signup-trend.module.css";

export type SignupTrendMark = { index: number; label: string };

function dayLabel(startDate: string | undefined, index: number): string {
  if (!startDate) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + index));
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function SignupTrend({ values, startDate, t, height = 120, marks }: { values: readonly number[]; startDate?: string; t: HostT; height?: number; marks?: readonly SignupTrendMark[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(0, ...values);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const step = Math.max(1, Math.ceil(values.length / 7));
  const labels = values.map((_, index) => dayLabel(startDate, index));
  const markOf = new Map((marks ?? []).map((mark) => [mark.index, mark.label]));
  const shown = active ?? peak;
  return (
    <div className={st.wrap}>
      <div className={st.summary}>
        <span><b className={st.total}>{total}</b>{t("unitPeople")}</span>
        {peak >= 0 ? <span className={st.peak}>{t("trendPeak", { d: labels[peak] || "", n: max })}</span> : <span className={st.peak}>{t("trendNone")}</span>}
      </div>
      {markOf.size ? (
        <div className={st.marks} style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
          {values.map((_, index) => <span key={index} data-trend-mark={markOf.has(index) ? "" : undefined}>{markOf.get(index) ?? ""}</span>)}
        </div>
      ) : null}
      <div className={st.plot} style={{ height, gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }} onMouseLeave={() => setActive(null)}>
        <span className={st.grid} aria-hidden />
        {values.map((value, index) => {
          const h = max > 0 ? Math.round((value / max) * (height - 22)) : 0;
          const tip = t("trendTip", { d: labels[index]!, n: value });
          return (
            <button
              type="button"
              key={index}
              className={st.col}
              data-trend-day={labels[index]}
              aria-label={tip}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              {index === shown && value > 0 ? <span className={st.value}>{index === active ? tip : value}</span> : null}
              <i className={`${st.bar} ${value === 0 ? st.zero : ""} ${index === peak ? st.hi : ""} ${index === active ? st.on : ""}`} style={value > 0 ? { height: Math.max(4, h) } : undefined} />
            </button>
          );
        })}
      </div>
      <div className={st.axis} style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }} aria-hidden>
        {labels.map((label, index) => <span key={index}>{index % step === 0 || index === labels.length - 1 ? label : ""}</span>)}
      </div>
      <table className={st.srOnly}>
        <caption>{t("trendTitle")}</caption>
        <tbody>{labels.map((label, index) => <tr key={index}><th scope="row">{label}</th><td>{values[index]}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
