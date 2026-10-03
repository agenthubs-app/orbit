"use client";
/**
 * W0060：联系人详情第②块「为什么是 TA」（原 W0051「和你目标的关系」面板收进这里）。
 *
 * 组成（D56）：标题行「为什么是 TA」+ 灰字「对照目标：…」；首行大字「TA 能帮你：{goal_relation}」（W0061 会替换成
 * 共享组件）；「依据」小签；浅底条「对应计划需求」（已关联需求 chip + 「+ 关联到其他需求」，由调用方传入）；
 * 分隔线下唯一一条「下一步」（洞察 ready 的 nextStep 优先，否则 contact.nextAction）+「为什么现在」+ 动作按钮。
 * 洞察未就绪时在首行位置显示 W0057 的状态（正在生成／失败自动重试／失败可重新生成／未设目标去设目标），
 * 需求关联与动作按钮照常可用。
 *
 * W0051：「重新生成」只在过期或失败时显示（W51-2），点击走用户主动池（R-11），当日 10 次用满时置灰并提示；
 * 示例模式下点击被拦截（guardWrite）。
 * W0057（SC-02）：正在生成时每 5 秒轮询一次只读状态接口 `GET /api/contacts/:id/insight`（本人一行、0 次模型调用），
 * 最多 24 次（2 分钟）后停止并提示刷新；拿到终态后停止，并在不刷新整页的情况下替换内容（下一步随之切换）。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ContactInsightView } from "../../../../../features/contacts/insights/view";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useDemoMode } from "../../_demo/demo-mode-core";
import { contactNextStep } from "./contact-value";
import { INSIGHT_EVIDENCE_ICON, INSIGHT_EVIDENCE_LABEL, INSIGHT_STATE_COPY, insightEvidenceHref } from "./network-insight-copy";

export const INSIGHT_GOAL_HREF = "/app/contacts/dashboard?tab=insight";
export const INSIGHT_POLL_INTERVAL_MS = 5_000;
export const INSIGHT_POLL_MAX = 24;

/** 需要轮询的状态：正在生成（未被额度顺延）。 */
export function insightViewIsGenerating(view: ContactInsightView): boolean {
  return view.inProgress || (view.state === "pending" && !view.deferredUntil);
}

export function NetworkInsightPanel({
  view: initialView = null,
  quotaExhausted = false,
  contactHref = null,
  goal = null,
  fallbackNextStep = null,
  whyNow = null,
  planStrip = null,
  actions = null,
  after = null,
}: {
  /** null：没有洞察数据（示例、旧调用方）——只渲染需求条、下一步与动作。 */
  view?: ContactInsightView | null;
  quotaExhausted?: boolean;
  contactHref?: string | null;
  /** 当前关系目标原文（「对照目标：…」）。 */
  goal?: string | null;
  /** 洞察没有下一步时用的 `contact.nextAction.text`。 */
  fallbackNextStep?: string | null;
  /** 「为什么现在：」后面的正文（`contactWhyNow`）；null 不显示。 */
  whyNow?: string | null;
  planStrip?: ReactNode;
  actions?: ReactNode;
  /** 动作行下方（「起草邮件」的草稿）。 */
  after?: ReactNode;
}) {
  const { t, language } = useOrbitLanguage();
  const demo = useDemoMode();
  const [view, setView] = useState(initialView);
  const [phase, setPhase] = useState<"idle" | "busy" | "scheduled" | "unchanged" | "limited" | "error">(quotaExhausted ? "limited" : "idle");
  const [polling, setPolling] = useState(() => !demo && initialView !== null && insightViewIsGenerating(initialView));
  const [pollStopped, setPollStopped] = useState(false);
  const polls = useRef(0);
  const contactId = initialView?.contactId ?? null;
  useEffect(() => {
    if (!polling || !contactId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        polls.current += 1;
        const last = polls.current >= INSIGHT_POLL_MAX;
        if (last) clearInterval(timer);
        try {
          const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/insight`, { cache: "no-store", credentials: "same-origin" });
          if (cancelled) return;
          if (!response.ok) {
            if (response.status === 404) { setPolling(false); return; }
          } else {
            const body = (await response.json().catch(() => null)) as { data?: { view?: ContactInsightView; quotaExhausted?: boolean } } | null;
            const next = body?.data?.view;
            if (next && !cancelled) {
              if (!insightViewIsGenerating(next)) {
                clearInterval(timer);
                setView(next);
                setPhase(body?.data?.quotaExhausted ? "limited" : "idle");
                setPolling(false);
                return;
              }
              setView(next);
            }
          }
        } catch {
          // 网络抖动：下一次再试。
        }
        if (last && !cancelled) {
          setPolling(false);
          setPollStopped(true);
        }
      })();
    }, INSIGHT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [polling, contactId]);
  async function regenerate() {
    if (!view) return;
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
        if (!body?.data?.unchanged) {
          polls.current = 0;
          setPollStopped(false);
          setPolling(true);
        }
      } else setPhase("error");
    } catch {
      setPhase("error");
    }
  }
  const showText = Boolean(view && view.goalRelation && view.nextStep && view.state !== "no_goal");
  const status = !view
    ? null
    : view.state === "no_goal"
      ? INSIGHT_STATE_COPY.noGoal
      : view.inProgress
        ? INSIGHT_STATE_COPY.inProgress
        : view.state === "pending"
          ? (view.deferredUntil ? INSIGHT_STATE_COPY.deferred : INSIGHT_STATE_COPY.generating)
          : view.state === "failed"
            ? (view.autoRetry ? INSIGHT_STATE_COPY.retrying : INSIGHT_STATE_COPY.failed)
            : view.state === "none" && !view.goalUpdated ? INSIGHT_STATE_COPY.none : null;
  const nextStep = contactNextStep({ insight: view, language, nextAction: fallbackNextStep ? { text: fallbackNextStep } : null });
  const goalText = view?.state === "no_goal" ? "" : (goal ?? "").trim();
  return (
    <section
      className="nw-panel nw-why"
      aria-label={t({ en: "Why this person", zh: "为什么是 TA" })}
      data-network-why
      data-network-detail-section="why"
      data-network-insight-panel={view?.state}
      data-insight-deferred={view?.deferredUntil ? "true" : undefined}
      data-insight-auto-retry={view?.autoRetry ? "true" : undefined}
      data-insight-polling={polling ? "true" : undefined}
    >
      <div className="nw-why-head">
        <strong className="nw-why-t">{t({ en: "Why this person", zh: "为什么是 TA" })}</strong>
        {view?.goalUpdated ? <span className="nw-chip" data-insight-badge="goal-updated" style={{ background: "#FFF4E5", color: "#8A5300" }}>{t(INSIGHT_STATE_COPY.goalUpdated)}</span>
          : view?.stale && view.state === "ready" ? <span className="nw-chip" data-insight-badge="stale" style={{ background: "#F1F1FB", color: "#4A4E80" }}>{t(INSIGHT_STATE_COPY.stale)}</span> : null}
        {goalText ? <span className="nw-why-goal" data-network-why-goal>{t({ en: "Against your goal: ", zh: "对照目标：" })}{goalText}</span> : null}
      </div>
      {showText && view ? (
        <div className="nw-insight-body">
          <p className="nw-why-rel"><span className="nw-why-lead">{t({ en: "How they can help: ", zh: "TA 能帮你：" })}</span><span data-insight-goal-relation>{t(view.goalRelation!)}</span></p>
          {view.evidence.length ? (
            <div className="nw-insight-evidence" aria-label={t({ en: "Evidence", zh: "依据" })}>
              <span className="nw-why-ev-l">{t({ en: "Based on", zh: "依据" })}</span>
              {view.evidence.map((evidence) => (
                <a key={evidence.id} className="nw-insight-chip" href={insightEvidenceHref(evidence, contactHref)} data-insight-evidence={evidence.source}>
                  {INSIGHT_EVIDENCE_ICON[evidence.source]} {t(INSIGHT_EVIDENCE_LABEL[evidence.source])}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {status ? <p className="nw-insight-status" data-insight-status>{t(status)}</p> : null}
      {pollStopped ? <p className="nw-insight-status" role="status" data-insight-poll-stopped>{t(INSIGHT_STATE_COPY.pollStopped)}</p> : null}
      {view?.state === "no_goal" ? <a className="btn nw-op-pending" href={INSIGHT_GOAL_HREF} data-insight-set-goal>{t({ en: "Set relationship goal", zh: "设置关系目标" })}</a> : null}
      {view?.canRegenerate ? (
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
      {planStrip}
      {nextStep || actions ? (
        <div className="nw-why-next">
          {nextStep ? (
            <div className="nw-why-next-copy">
              <span className="nw-why-next-l">{t({ en: "Next step", zh: "下一步" })}</span>
              <strong className="nw-why-next-t" data-insight-next-step>{nextStep}</strong>
              {whyNow ? <span className="nw-why-now" data-network-why-now>{t({ en: "Why now: ", zh: "为什么现在：" })}{whyNow}</span> : null}
            </div>
          ) : <span className="nw-why-next-copy" />}
          {actions ? <div className="nw-why-acts">{actions}</div> : null}
        </div>
      ) : null}
      {after}
    </section>
  );
}
