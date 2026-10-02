"use client";
/**
 * W0051：详情弹窗 hero 下方「和你目标的关系」（同一行洞察数据，四种状态）。
 * 只读服务端读好的视图；「重新生成」只在过期或失败时显示（W51-2），点击走用户主动池（R-11），
 * 当日 10 次用满时置灰并提示「今天次数已用完，明天可用」。示例模式下点击被拦截（guardWrite）。
 */
import { useState } from "react";

import type { ContactInsightView } from "../../../../../features/contacts/insights/view";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useDemoMode } from "../../_demo/demo-mode-core";
import { INSIGHT_EVIDENCE_ICON, INSIGHT_EVIDENCE_LABEL, INSIGHT_STATE_COPY, insightEvidenceHref } from "./network-insight-copy";

export const INSIGHT_GOAL_HREF = "/app/contacts/dashboard?tab=insight";

export function NetworkInsightPanel({ view, quotaExhausted = false, contactHref = null }: { view: ContactInsightView; quotaExhausted?: boolean; contactHref?: string | null }) {
  const { t } = useOrbitLanguage();
  const demo = useDemoMode();
  const [phase, setPhase] = useState<"idle" | "busy" | "scheduled" | "unchanged" | "limited" | "error">(quotaExhausted ? "limited" : "idle");
  async function regenerate() {
    if (demo?.guardWrite) {
      demo.guardWrite(t(INSIGHT_STATE_COPY.regenerate));
      return;
    }
    if (phase === "busy" || phase === "limited") return;
    setPhase("busy");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(view.contactId)}/insight/regenerate`, { credentials: "same-origin", method: "POST" });
      if (response.status === 429) setPhase("limited");
      else if (response.ok) {
        const body = (await response.json().catch(() => null)) as { data?: { unchanged?: boolean } } | null;
        setPhase(body?.data?.unchanged ? "unchanged" : "scheduled");
      } else setPhase("error");
    } catch {
      setPhase("error");
    }
  }
  const showText = view.goalRelation && view.nextStep && view.state !== "no_goal";
  const status = view.state === "no_goal"
    ? INSIGHT_STATE_COPY.noGoal
    : view.inProgress
      ? INSIGHT_STATE_COPY.inProgress
      : view.state === "pending"
        ? (view.deferredUntil ? INSIGHT_STATE_COPY.deferred : INSIGHT_STATE_COPY.pending)
        : view.state === "failed"
          ? INSIGHT_STATE_COPY.failed
          : view.state === "none" && !view.goalUpdated ? INSIGHT_STATE_COPY.none : null;
  return (
    <div className="nw-panel nw-panel-16" data-network-insight-panel={view.state} data-insight-deferred={view.deferredUntil ? "true" : undefined}>
      <div className="nw-panel-head">
        <strong className="nw-panel-t">{t({ en: "Relation to your goal", zh: "和你目标的关系" })}</strong>
        {view.goalUpdated ? <span className="nw-chip" data-insight-badge="goal-updated" style={{ background: "#FFF4E5", color: "#8A5300" }}>{t(INSIGHT_STATE_COPY.goalUpdated)}</span>
          : view.stale && view.state === "ready" ? <span className="nw-chip" data-insight-badge="stale" style={{ background: "#F1F1FB", color: "#4A4E80" }}>{t(INSIGHT_STATE_COPY.stale)}</span> : null}
      </div>
      {showText ? (
        <div className="nw-insight-body">
          <p className="nw-insight-rel" data-insight-goal-relation>{t(view.goalRelation!)}</p>
          {view.evidence.length ? (
            <div className="nw-insight-evidence" aria-label={t({ en: "Evidence", zh: "依据" })}>
              {view.evidence.map((evidence) => (
                <a key={evidence.id} className="nw-topic" href={insightEvidenceHref(evidence, contactHref)} data-insight-evidence={evidence.source}>
                  {INSIGHT_EVIDENCE_ICON[evidence.source]} {t(INSIGHT_EVIDENCE_LABEL[evidence.source])}
                </a>
              ))}
            </div>
          ) : null}
          <p className="nw-insight-next" data-insight-next-step><strong>{t({ en: "Next step: ", zh: "下一步：" })}</strong>{t(view.nextStep!)}</p>
        </div>
      ) : null}
      {status ? <p className="nw-insight-status" data-insight-status>{t(status)}</p> : null}
      {view.state === "no_goal" ? <a className="btn nw-op-pending" href={INSIGHT_GOAL_HREF} data-insight-set-goal>{t({ en: "Set relationship goal", zh: "设置关系目标" })}</a> : null}
      {view.canRegenerate ? (
        <div className="nw-insight-actions">
          <button type="button" className="btn nw-op-pending" data-insight-regenerate disabled={phase === "busy" || phase === "scheduled" || phase === "unchanged" || phase === "limited"} aria-disabled={phase === "limited" || undefined} onClick={() => void regenerate()}>
            {t(INSIGHT_STATE_COPY.regenerate)}
          </button>
          {phase === "limited" ? <span role="status" data-insight-quota-used>{t(INSIGHT_STATE_COPY.quotaUsed)}</span> : null}
          {phase === "scheduled" ? <span role="status">{t(INSIGHT_STATE_COPY.regenerating)}</span> : null}
          {phase === "unchanged" ? <span role="status">{t(INSIGHT_STATE_COPY.unchanged)}</span> : null}
          {phase === "error" ? <span role="alert">{t({ en: "Could not start. Try again later.", zh: "暂时无法重新生成，请稍后再试。" })}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
