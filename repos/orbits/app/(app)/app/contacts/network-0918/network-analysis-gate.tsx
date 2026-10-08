/**
 * W0054（W54-3／W54-4）：人脉分析 AI 块的替换卡（每页最多一张，放在被替换的那块位置上）。
 *
 * - threshold：已确认联系人不足 3 位——「再添加 N 位联系人即可更新分析」+「扫名片」（主）与「导入人脉」；
 * - updating：补回 3 位后正在重算——「正在更新分析」，不回显旧快照；
 * - deferred：后台自动更新次数今天用完——「明天更新分析」。
 * 统计图、档位人数、覆盖度数字不受影响，照常显示在卡片之外。本组件只渲染，不发任何请求。
 */
"use client";

import {
  ANALYSIS_GATE_IMPORT_HREF,
  ANALYSIS_GATE_SCAN_HREF,
  type AnalysisGateView,
} from "../../../../../features/network-analysis/analysis-threshold";
import { useOrbitLanguage } from "../../orbit-language-context";

export function NetworkAnalysisGateCard({ gate }: { gate: AnalysisGateView }) {
  const { t, preserveHref } = useOrbitLanguage();
  if (gate.kind === "threshold") {
    const n = gate.missing;
    return (
      <div className="nw-gate" data-network-analysis-gate="threshold" data-network-gate-missing={n}>
        <span className="nw-gate-icon" aria-hidden="true">✦</span>
        <div className="nw-gate-copy">
          <h2 className="nw-gate-t">{t({ zh: `再添加 ${n} 位联系人即可更新分析`, en: `Add ${n} more ${n === 1 ? "contact" : "contacts"} to update your analysis` })}</h2>
          <p className="nw-gate-d">{t({ zh: "AI 人脉分析至少需要 3 位已确认联系人。人数和统计图照常显示。", en: "AI network analysis needs at least 3 confirmed contacts. Counts and charts still show as usual." })}</p>
          <div className="nw-gate-acts">
            <a className="btn nw-btn-primary" href={preserveHref(ANALYSIS_GATE_SCAN_HREF)} data-network-gate-scan="">{t({ zh: "扫名片", en: "Scan cards" })}</a>
            <a className="btn nw-textlink" href={preserveHref(ANALYSIS_GATE_IMPORT_HREF)} data-network-gate-import="">{t({ zh: "导入人脉", en: "Import contacts" })}</a>
          </div>
        </div>
      </div>
    );
  }
  if (gate.kind === "deferred") {
    return (
      <div className="nw-gate" data-network-analysis-gate="deferred">
        <span className="nw-gate-icon" aria-hidden="true">◷</span>
        <div className="nw-gate-copy">
          <h2 className="nw-gate-t">{t({ zh: "明天更新分析", en: "Your analysis updates tomorrow" })}</h2>
          <p className="nw-gate-d">{t({ zh: "今天的自动更新次数已用完，明天会自动重新生成。", en: "Today's automatic updates are used up; it will be regenerated tomorrow." })}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="nw-gate" data-network-analysis-gate="updating" role="status">
      <span className="nw-gate-icon" aria-hidden="true">⟳</span>
      <div className="nw-gate-copy">
        <h2 className="nw-gate-t">{t({ zh: "正在更新分析", en: "Updating your analysis" })}</h2>
        <p className="nw-gate-d">{t({ zh: "联系人已回到 3 位以上，分析正在按现在的人脉重新生成，完成后显示在这里。", en: "You have 3 or more contacts again. The analysis is being regenerated from your current network and will show here when ready." })}</p>
      </div>
    </div>
  );
}
