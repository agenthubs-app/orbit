/**
 * 人脉需求匹配的共用确认组件（RW-11，Sprint W0010）。三处入口用同一个组件：
 *
 *   1. 名片审阅页最后一屏（`card-batch-ui.tsx` 的 `FinishedPanel` 之后）：`BatchPlanMatch`
 *      触发这一批的匹配并最多等 8 秒；超时直接结束，结果改由下面两处提示。
 *   2. iOrbit 今日要事「N 位新联系人可能对应你的计划」：`PlanMatchDialog` + `PlanMatchSheet`。
 *   3. 「我的计划」人脉需求旁的「待确认 N」角标：同上，只列这条需求的候选。
 *
 * 匹配永远只是建议：逐条「是 / 不是」。是 → 联系人进入这条需求、本周多一条「约 TA」行动
 * （服务端同时写进展记录），行动卡上有 定时间（打开个人日程页新建）、起草邮件（点击才请求，
 * 当前是模板草稿、不调 AI；就地显示可编辑文字与「复制」，永远不发送）、记一次互动（写互动记录并把
 * 这个人标为已建立联系）。
 * W0023：计划已过最后一周时「是」只记关联，行里说明「制定下一份计划时会安排『约 TA』」，没有行动卡。
 * 不是 → 这一对以后不再提示。
 *
 * 样式自带（`.pms` 作用域），三处宿主的作用域各不相同；按钮用 `.pms .btn.pms-*` 压过
 * `[data-orbit-real-page] .btn` 的基类，链接用 `.pms a.pms-*` 压过各域的 `a` 基线色。
 */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import {
  decidePlanMatch,
  linkContactToNeed,
  recordMatchInteraction,
  requestMatchEmailDraft,
  runPlanMatchForBatch,
  type PlanMatchAction,
  type PlanMatchCandidate,
  type PlanMatchList,
} from "./plan-match-client";
import { fetchCurrentPlan, newPlanIdempotencyKey } from "./iorbit-plan-client";

/** 审阅页最多等多久（Q29：8 秒）。 */
export const PLAN_MATCH_WAIT_MS = 8_000;
/** 「定时间」打开的日程页（个人日程在那里新建）。 */
export const PLAN_MATCH_SCHEDULE_HREF = "/app/tasks/personal";

export const PLAN_MATCH_STYLES = `
.pms { display: flex; flex-direction: column; gap: 12px; color: #0E1225; font-size: 14px; line-height: 1.5; text-align: left; }
.pms .pms-head { display: flex; flex-direction: column; gap: 4px; }
.pms .pms-title { font-size: 15px; font-weight: 600; }
.pms .pms-sub { margin: 0; font-size: 13px; color: #6B6F99; }
.pms .pms-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.pms .pms-row { border: 1px solid #DDDEFA; border-radius: 10px; padding: 12px 14px; background: #FFFFFF; display: flex; flex-direction: column; gap: 6px; }
.pms .pms-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.pms .pms-who b { font-size: 15px; font-weight: 600; }
.pms .pms-who small { font-size: 12px; color: #6B6F99; }
.pms .pms-need { font-size: 13px; color: #3B3F7A; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pms .pms-tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #EEEFFD; color: #4B4FC7; }
.pms .pms-tag-strong { background: #4B4FC7; color: #FFFFFF; }
.pms .pms-why { margin: 0; font-size: 12px; color: #6B6F99; }
.pms .pms-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
.pms .btn.pms-yes, .pms .btn.pms-no, .pms .btn.pms-act { height: auto; min-height: 36px; padding: 6px 14px; gap: 6px; font-size: 13px; font-weight: 500; border-radius: 8px; letter-spacing: 0; line-height: normal; transition: none; }
.pms .btn.pms-yes:active, .pms .btn.pms-no:active, .pms .btn.pms-act:active { transform: none; }
.pms .btn.pms-yes { background: #4B4FC7; border: 1px solid #4B4FC7; color: #FFFFFF; }
.pms .btn.pms-yes:hover { background: #3B3FA8; }
.pms .btn.pms-no, .pms .btn.pms-act { background: #FFFFFF; border: 1px solid #C9CBF0; color: #3B3F7A; }
.pms .btn.pms-no:hover, .pms .btn.pms-act:hover { border-color: #4B4FC7; color: #0E1225; }
.pms .btn.pms-yes:disabled, .pms .btn.pms-no:disabled, .pms .btn.pms-act:disabled { opacity: .55; cursor: not-allowed; }
.pms a.pms-link { display: inline-flex; align-items: center; min-height: 36px; padding: 6px 14px; border: 1px solid #C9CBF0; border-radius: 8px; font-size: 13px; font-weight: 500; color: #3B3F7A; text-decoration: none; background: #FFFFFF; }
.pms a.pms-link:hover { color: #0E1225; border-color: #4B4FC7; }
.pms .pms-action { border-top: 1px dashed #DDDEFA; padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.pms .pms-action-title { font-size: 13px; font-weight: 600; }
.pms .pms-soon { font-size: 11px; color: #6B6F99; }
.pms .pms-draft { display: flex; flex-direction: column; gap: 6px; }
.pms .pms-draft textarea { width: 100%; min-height: 180px; box-sizing: border-box; padding: 10px 12px; border: 1px solid #C9CBF0; border-radius: 8px; font: inherit; font-size: 13px; line-height: 1.6; color: #0E1225; background: #FFFFFF; resize: vertical; }
.pms .pms-note { margin: 0; font-size: 13px; color: #6B6F99; }
.pms .pms-error { margin: 0; font-size: 12px; color: #B42318; }
.pms .pms-needs { display: flex; flex-direction: column; gap: 6px; }
.pms .pms-need-opt { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #0E1225; cursor: pointer; }
.pms .pms-need-opt input { margin-top: 3px; }
.pms .pms-need-opt small { display: block; font-size: 12px; color: #6B6F99; }
.pms a.pms-inline { color: #4B4FC7; text-decoration: underline; }
.pms a.pms-inline:hover { color: #2E3270; }
.pms-scrim { position: fixed; inset: 0; z-index: 60; background: rgba(14, 18, 37, .38); display: flex; align-items: center; justify-content: center; padding: 16px; }
.pms-dialog { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #F7F7FD; border-radius: 14px; padding: 18px 18px 20px; box-shadow: 0 18px 48px rgba(14, 18, 37, .22); position: relative; }
.pms-dialog .btn.pms-close { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; padding: 0; border: 0; background: transparent; color: #6B6F99; font-size: 20px; font-weight: 400; border-radius: 8px; }
.pms-dialog .btn.pms-close:hover { background: #EEEFFD; color: #0E1225; }
@media (max-width: 480px) { .pms .pms-row { padding: 10px 12px; } .pms-dialog { padding: 16px 14px 18px; } }
`;

type Translate = (copy: { en: string; zh: string }) => string;

function reasonLine(candidate: PlanMatchCandidate, t: Translate): string | null {
  if (candidate.tier === "ai") return candidate.aiReason ? t({ en: `By company & title: ${candidate.aiReason}`, zh: `按公司与职位：${candidate.aiReason}` }) : null;
  if (!candidate.industry) return null;
  return candidate.strength === "strong"
    ? t({ en: `Same sub-industry: ${candidate.industry.en}`, zh: `同属二级行业：${candidate.industry.zh}` })
    : t({ en: `Same industry: ${candidate.industry.en}`, zh: `同属行业：${candidate.industry.zh}` });
}

/** 「约 TA」行动的三个按钮（确认之后、计划页本周行动上共用）。 */
export function MatchActionButtons({ actionItemId, onLogged }: { actionItemId: string; onLogged?: () => void }) {
  const { language, t } = useOrbitLanguage();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<"idle" | "busy" | "ready" | "error">("idle");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  // 一次「记一次互动」持有同一个幂等键：失败重试沿用，服务端只记一次。
  const key = useRef<string | null>(null);
  const log = async () => {
    if (state !== "idle") return;
    setState("busy");
    setError(null);
    try {
      key.current ??= newPlanIdempotencyKey("plan-interaction");
      await recordMatchInteraction(actionItemId, key.current);
      setState("done");
      onLogged?.();
    } catch (failure) {
      setState("idle");
      setError(t({ en: `Couldn't save it. (${(failure as Error).message})`, zh: `没能记下。（${(failure as Error).message}）` }));
    }
  };
  // 起草邮件：只在点击时请求；结果是可编辑的文字，止于草稿。
  const requestDraft = async () => {
    if (draftState === "busy") return;
    setDraftState("busy");
    setCopied(false);
    try {
      const result = await requestMatchEmailDraft(actionItemId, language === "en" ? "en" : "zh");
      setDraft(`${t({ en: "Subject", zh: "主题" })}：${result.subject}\n\n${result.body}`);
      setDraftState("ready");
    } catch {
      setDraftState("error");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <div className="pms-acts" data-plan-match-action={actionItemId}>
        <a className="pms-link" href={PLAN_MATCH_SCHEDULE_HREF}>
          {t({ en: "Schedule a time", zh: "定时间" })}
        </a>
        <button
          className="btn pms-act"
          data-plan-match-draft
          disabled={draftState === "busy"}
          onClick={() => void requestDraft()}
          type="button"
        >
          {draftState === "busy"
            ? t({ en: "Drafting…", zh: "正在起草…" })
            : draftState === "error"
              ? t({ en: "Retry the draft", zh: "重试起草" })
              : t({ en: "Draft an email", zh: "起草邮件" })}
        </button>
        <button className="btn pms-act" data-plan-match-interaction disabled={state !== "idle"} onClick={() => void log()} type="button">
          {state === "done"
            ? t({ en: "Logged · connected", zh: "已记下 · 已建立联系" })
            : state === "busy"
              ? t({ en: "Saving…", zh: "正在记下…" })
              : t({ en: "Log an interaction", zh: "记一次互动" })}
        </button>
      </div>
      {draftState === "error" ? (
        <p className="pms-error" role="alert">{t({ en: "Couldn't draft the email. Try again.", zh: "没能起草邮件，请重试。" })}</p>
      ) : null}
      {draftState === "ready" ? (
        <div className="pms-draft" data-plan-match-draft-text>
          <textarea
            aria-label={t({ en: "Email draft", zh: "邮件草稿" })}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <div className="pms-acts">
            <button className="btn pms-act" data-plan-match-copy onClick={() => void copy()} type="button">
              {copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy", zh: "复制" })}
            </button>
            <span className="pms-soon">{t({ en: "Only a draft — Orbit never sends it.", zh: "只是草稿，Orbit 不会替你发送。" })}</span>
          </div>
        </div>
      ) : null}
      {error ? <p className="pms-error" role="alert">{error}</p> : null}
    </>
  );
}

interface RowState {
  busy: boolean;
  error: string | null;
  action: PlanMatchAction | null;
  /** 已接受但没有行动（W0023：计划已到期，下一份计划再安排）。 */
  linkedOnly: boolean;
  dismissed: boolean;
}

/** W0023：到期计划上关联后的说明（确认处与联系人详情共用）。 */
function endedPlanNote(needTitle: string, t: Translate): string {
  return t({
    en: `Linked to “${needTitle}”. This plan has ended — your next plan will schedule a meeting with them.`,
    zh: `已关联到「${needTitle}」；计划已到期，制定下一份计划时会安排「约 TA」`,
  });
}

/**
 * 候选清单：逐条「是 / 不是」。`onDecided` 通知宿主更新计数（今日要事、角标）；
 * 是 → 行变成「约 TA」行动卡；不是 → 行消失。
 */
export function PlanMatchSheet({
  candidates,
  heading,
  onDecided,
}: {
  candidates: readonly PlanMatchCandidate[];
  heading?: string;
  onDecided?: (candidateId: string, decision: "accept" | "dismiss", action: PlanMatchAction | null) => void;
}) {
  const { t } = useOrbitLanguage();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const row = (id: string): RowState => rows[id] ?? { action: null, busy: false, dismissed: false, error: null, linkedOnly: false };
  const patch = (id: string, next: Partial<RowState>) => setRows((current) => ({ ...current, [id]: { ...row(id), ...current[id], ...next } }));

  const decide = async (candidate: PlanMatchCandidate, decision: "accept" | "dismiss") => {
    if (row(candidate.id).busy) return;
    patch(candidate.id, { busy: true, error: null });
    try {
      const action = await decidePlanMatch(candidate.id, decision);
      patch(candidate.id, { action, busy: false, dismissed: decision === "dismiss", linkedOnly: decision === "accept" && !action });
      onDecided?.(candidate.id, decision, action);
    } catch (failure) {
      patch(candidate.id, {
        busy: false,
        error: t({ en: `Couldn't save that. (${(failure as Error).message})`, zh: `没能保存。（${(failure as Error).message}）` }),
      });
    }
  };

  const visible = candidates.filter((candidate) => !row(candidate.id).dismissed);
  return (
    <div className="pms" data-plan-match-sheet>
      <style>{PLAN_MATCH_STYLES}</style>
      <div className="pms-head">
        <strong className="pms-title">{heading ?? t({ en: "These new contacts may fit your plan", zh: "这些新联系人可能对应你的计划" })}</strong>
        <p className="pms-sub">
          {t({
            en: "Only a suggestion — nothing is linked until you say yes.",
            zh: "只是建议，你点「是」才会关联到计划。",
          })}
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="pms-note">{t({ en: "Nothing left to check.", zh: "都处理完了。" })}</p>
      ) : (
        <ul className="pms-list">
          {visible.map((candidate) => {
            const state = row(candidate.id);
            const why = reasonLine(candidate, t);
            return (
              <li className="pms-row" data-plan-match-candidate={candidate.id} key={candidate.id}>
                <div className="pms-who">
                  <b>{candidate.contactName}</b>
                  {candidate.contactSubtitle ? <small>{candidate.contactSubtitle}</small> : null}
                </div>
                <div className="pms-need">
                  <span>{t({ en: `May fit “${candidate.needTitle}”`, zh: `可能对应「${candidate.needTitle}」` })}</span>
                  <span className={candidate.strength === "strong" ? "pms-tag pms-tag-strong" : "pms-tag"}>
                    {candidate.strength === "strong" ? t({ en: "Strong match", zh: "强匹配" }) : t({ en: "Possible", zh: "可能" })}
                  </span>
                </div>
                {why ? <p className="pms-why">{why}</p> : null}
                {state.action ? (
                  <div className="pms-action">
                    <span className="pms-action-title">
                      {t({ en: `Added to this week: ${state.action.title}`, zh: `已加入本周：${state.action.title}` })}
                    </span>
                    <MatchActionButtons actionItemId={state.action.id} />
                  </div>
                ) : state.linkedOnly ? (
                  <p className="pms-note" data-plan-match-linked-only role="status">
                    {endedPlanNote(candidate.needTitle, t)}
                  </p>
                ) : (
                  <div className="pms-acts">
                    <button className="btn pms-yes" data-plan-match-yes disabled={state.busy} onClick={() => void decide(candidate, "accept")} type="button">
                      {t({ en: "Yes", zh: "是" })}
                    </button>
                    <button className="btn pms-no" data-plan-match-no disabled={state.busy} onClick={() => void decide(candidate, "dismiss")} type="button">
                      {t({ en: "No", zh: "不是" })}
                    </button>
                  </div>
                )}
                {state.error ? <p className="pms-error" role="alert">{state.error}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 今日要事与计划页角标打开的弹层（初始焦点、Tab 圈定、Esc 关闭）。 */
export function PlanMatchDialog({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const { t } = useOrbitLanguage();
  const dialogRef = useOrbitModalA11y(onClose);
  return (
    <div
      className="pms-scrim"
      data-plan-match-dialog
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <style>{PLAN_MATCH_STYLES}</style>
      <div aria-label={label} aria-modal="true" className="pms-dialog" ref={dialogRef} role="dialog">
        <button aria-label={t({ en: "Close", zh: "关闭" })} className="btn pms-close" onClick={onClose} type="button">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

type BatchMatchState = "waiting" | "ready" | "none" | "late";

/**
 * 审阅页最后一屏：批次确认完成后触发这一批的匹配，最多等 `waitMs`（8 秒）。
 * 有候选 → 就地确认；没有 → 什么都不显示；超时或出错 → 一句说明，结果改由今日要事与计划页提示。
 */
export function BatchPlanMatch({
  batchId,
  run = runPlanMatchForBatch,
  waitMs = PLAN_MATCH_WAIT_MS,
}: {
  batchId: string;
  run?: (batchId: string, signal: AbortSignal) => Promise<PlanMatchList>;
  waitMs?: number;
}) {
  const { t } = useOrbitLanguage();
  const [state, setState] = useState<BatchMatchState>("waiting");
  const [list, setList] = useState<PlanMatchList | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setState("late");
      controller.abort();
    }, waitMs);
    void run(batchId, controller.signal)
      .then((value) => {
        if (settled) return;
        settled = true;
        setList(value);
        setState(value.candidates.length > 0 ? "ready" : "none");
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        setState("late");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      settled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [batchId, run, waitMs]);

  if (state === "none") return null;
  return (
    <div className="pms" data-plan-match-batch={state}>
      <style>{PLAN_MATCH_STYLES}</style>
      {state === "waiting" ? (
        <p className="pms-note" role="status">
          {t({ en: "Checking these new contacts against your plan…", zh: "正在对照你的计划，看看这批新联系人…" })}
        </p>
      ) : state === "late" ? (
        <p className="pms-note" role="status">
          {t({
            en: "Plan matches will show up in iOrbit's Today and on My plan once they're ready.",
            zh: "匹配结果出来后，会出现在 iOrbit 今日要事和「我的计划」里。",
          })}
        </p>
      ) : list ? (
        <PlanMatchSheet candidates={list.candidates} />
      ) : null}
    </div>
  );
}

interface LinkableNeed {
  id: string;
  title: string;
  linked: boolean;
}

/**
 * 联系人详情「关联到计划人脉需求」（W0010 手动关联）：点开才读本人的生效计划，列出人脉需求，
 * 选一条关联；服务端只接受本人的计划与本人的联系人（其余 404），关联后同样生成本周「约 TA」行动
 * （W0023：计划已到期时只记关联，说明下一份计划再安排）。
 * `guard` 返回 true 表示被示例模式拦下（不发请求）。
 */
export function PlanNeedLinkPanel({ contactId, guard }: { contactId: string; guard?: () => boolean }) {
  const { t } = useOrbitLanguage();
  const [state, setState] = useState<"closed" | "loading" | "ready" | "none" | "error" | "linked">("closed");
  const [needs, setNeeds] = useState<LinkableNeed[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ need: string; action: string | null } | null>(null);
  const key = useRef<string | null>(null);

  const open = async () => {
    if (guard?.()) return;
    setState("loading");
    try {
      // 只要条目（人脉需求），不要进展记录。
      const snapshot = await fetchCurrentPlan(undefined, { view: "home" });
      const list = (snapshot?.items ?? [])
        .filter((item) => item.kind === "network_need")
        .map((item) => ({ id: item.id, linked: item.linkedContactIds.includes(contactId), title: item.title }));
      setNeeds(list);
      setState(list.length > 0 ? "ready" : "none");
    } catch {
      setState("error");
    }
  };

  const link = async () => {
    const need = needs.find((entry) => entry.id === selected);
    if (!need || busy) return;
    setBusy(true);
    setError(null);
    try {
      key.current ??= newPlanIdempotencyKey("plan-link");
      const action = await linkContactToNeed(need.id, contactId, key.current);
      key.current = null;
      setResult({ action: action?.title ?? null, need: need.title });
      setState("linked");
    } catch (failure) {
      setError(t({ en: `Couldn't link. (${(failure as Error).message})`, zh: `没能关联。（${(failure as Error).message}）` }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pms" data-plan-need-link={state}>
      <style>{PLAN_MATCH_STYLES}</style>
      {state === "closed" ? (
        <div className="pms-acts">
          <button className="btn pms-act" data-plan-need-link-open onClick={() => void open()} type="button">
            {t({ en: "Link to a network need in my plan", zh: "关联到计划人脉需求" })}
          </button>
        </div>
      ) : state === "loading" ? (
        <p className="pms-note" role="status">{t({ en: "Reading your plan…", zh: "正在读取你的计划…" })}</p>
      ) : state === "none" ? (
        <p className="pms-note">{t({ en: "Your plan has no network needs yet.", zh: "你的计划里还没有人脉需求。" })}</p>
      ) : state === "error" ? (
        <p className="pms-error" role="alert">{t({ en: "Your plan can't be read right now.", zh: "计划暂时读不到。" })}</p>
      ) : state === "linked" && result ? (
        <p className="pms-note" role="status">
          {result.action === null
            ? `${endedPlanNote(result.need, t)}${t({ en: " ", zh: "。" })}`
            : t({
                en: `Linked to “${result.need}”. This week now has “${result.action}”. `,
                zh: `已关联到「${result.need}」，本周多了一条「${result.action}」。`,
              })}
          <a className="pms-inline" href="/app/agent/plan">{t({ en: "Open my plan", zh: "查看计划" })}</a>
        </p>
      ) : (
        <>
          <strong className="pms-title">{t({ en: "Which need does this person fit?", zh: "这个人对应计划里的哪条人脉需求？" })}</strong>
          <div className="pms-needs" role="radiogroup">
            {needs.map((need) => (
              <label className="pms-need-opt" key={need.id}>
                <input
                  checked={selected === need.id}
                  disabled={need.linked}
                  name={`plan-need-${contactId}`}
                  onChange={() => setSelected(need.id)}
                  type="radio"
                  value={need.id}
                />
                <span>
                  {need.title}
                  {need.linked ? <small>{t({ en: "Already linked", zh: "已关联" })}</small> : null}
                </span>
              </label>
            ))}
          </div>
          <div className="pms-acts">
            <button className="btn pms-yes" data-plan-need-link-submit disabled={!selected || busy} onClick={() => void link()} type="button">
              {busy ? t({ en: "Linking…", zh: "正在关联…" }) : t({ en: "Link", zh: "关联" })}
            </button>
            <button className="btn pms-no" onClick={() => setState("closed")} type="button">
              {t({ en: "Cancel", zh: "取消" })}
            </button>
          </div>
          {error ? <p className="pms-error" role="alert">{error}</p> : null}
        </>
      )}
    </div>
  );
}
