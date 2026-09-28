/**
 * 「我的计划」（`/app/agent/plan`，RW-10，Sprint W0009）。整体重写，取代 Orbit_0918 的
 * 「执行计划」屏（本周重点 = 跟进 + 账本、「4 周推进节奏」等 W4 占位）。
 *
 * 版式取自已确认原型 iorbit-plan 的「我的计划」页，沿用首页的报刊式语言：
 *   面包屑   iOrbit / 我的计划
 *   报头     目标原文（衬线大标题）+「计划 vN · M/D 生成 · …」+「目标分析 ▾」（默认折叠）
 *            +「重新分析 · 本月剩 1 次」（占位，禁用）+ 周进度刻度（阶段区间、本周高亮）
 *   左栏     本周 · 第 n 周（可打勾的行动，逾期的标「已延后 N 周」）+ 可折叠的阶段（当前展开）
 *   右栏     人脉需求（已建立联系 / 已关联计数、人员按添加倒序）+ 计划里的活动
 *   底部     进展记录（手动记一笔 + 时间线）
 *
 * 数据：服务端页面以本人身份读当前生效计划（`PlanService.getCurrent()`）作为首帧；
 * 视图全部由 `plan-route-view-model.ts` 从快照推导。写操作只走 W0007 的接口
 * （`iorbit-plan-client.ts`）：打勾乐观更新，失败把这一条回滚并提示；手动记录成功后插到最前。
 *
 * W0010：人脉需求标题旁的「待确认 N」角标读 `GET /api/agent/plans/candidates`，点开是与审阅页、
 * 今日要事共用的确认组件（`plan-match-sheet.tsx`）；确认后重新读计划，本周多出的「约 TA」行动
 * 行上带 定时间／起草邮件（即将开放）／记一次互动。
 *
 * W0012：报头的「重新分析 · 本月剩 N 次」可用（每个东京自然月 1 次，额度由服务端记）；四种触发里
 * 目标被改／阶段提前完成／延后行动累计 3 条时显示「要不要重新分析」提示条（只提示、不自动重做）；
 * 计划到期时显示回顾（完成行动、新认识人数、在哪些活动认识）和「制定下一份计划」（不占额度）。
 * 手动进展可以 @ 计划里的联系人或活动，引用作为结构化字段提交（不从正文反解）；@ 某人后
 * TA 在人脉需求里变为已建立联系（服务端同一事务），成功后重新读计划。
 *
 * W0014 示例模式：服务端判定本人在引导期示例里时传入 `guide`，本屏挂上 `DemoModeProvider`，
 * 计划换成示例人物的计划（`_demo/demo-persona.ts` 的 `buildDemoPlanSnapshot`，同一套视图模型
 * 与渲染路径）、时钟换成示例时钟；页头上方是「示例预览」横条，人名带「示例」角标；打勾与
 * 「记下」改弹「这是示例」拦截层，也不读匹配候选——整屏不发任何计划请求。`guide` 为空时一切照旧。
 */
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { PlanViewSnapshot } from "../../../../../features/plans/contract";
import {
  DemoBanner,
  DemoInterceptLayer,
  DemoModeProvider,
  DemoNavPill,
  DemoTag,
  useDemoMode,
  type DemoModeView,
} from "../../_demo/demo-mode-core";
import { buildDemoPlanContactNames, buildDemoPlanSnapshot } from "../../_demo/demo-persona";
import { useOrbitLanguage } from "../../orbit-language-context";
import {
  buildMyPlanViewModel,
  buildPlanTrackingView,
  type MyPlanContactName,
  type MyPlanPhase,
  type MyPlanTrackingView,
  type MyPlanView,
  type PlanTrackingInput,
} from "../plan/plan-route-view-model";
import {
  fetchCurrentPlan,
  newPlanIdempotencyKey,
  patchPlanActionDone,
  postPlanNote,
  postPlanReanalyze,
  withActionDone,
  withLogEntry,
  withServerItem,
} from "./iorbit-plan-client";
import { IOrbitScreenFrame } from "./iorbit-screen-frame";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { fetchPlanMatches, withoutCandidate, type PlanMatchList } from "./plan-match-client";
import { MatchActionButtons, PLAN_MATCH_STYLES, PlanMatchDialog, PlanMatchSheet } from "./plan-match-sheet";

export interface IOrbitPlanProps {
  /** 服务端读到的当前生效计划：null = 还没有；"unavailable" = 计划服务读不到。 */
  initialSnapshot: PlanViewSnapshot | null | "unavailable";
  /** 引导开关（`ORBIT_GUIDE_DEMO`）：打开时无计划引导去 `/app/start` 第 3 步。 */
  guideEnabled: boolean;
  /** 生成快照以外的联系人名字（id → 名字），可选。 */
  contactNames?: Readonly<Record<string, MyPlanContactName>>;
  /** 覆盖点，仅测试使用：可注入的时钟。 */
  now?: Date;
  /** W0014 示例模式：非空即渲染示例人物的计划（开关关闭或不在引导期时为空）。 */
  guide?: DemoModeView | null;
  /** W0012：服务端读到的额度、资料里的目标、计划期间新增的联系人（到期回顾用）。 */
  tracking?: PlanTrackingInput | null;
}

const PLAN_DEMO_MESSAGE = {
  en: "Once you finish the guide, this becomes your own plan.",
  zh: "完成引导后，这里会是你自己的计划。",
};

export function IOrbitPlan({ guide, ...props }: IOrbitPlanProps) {
  if (!guide) return <IOrbitPlanScreen {...props} />;
  return (
    <DemoModeProvider view={guide}>
      <IOrbitPlanScreen {...props} />
    </DemoModeProvider>
  );
}

function IOrbitPlanScreen({
  contactNames: liveContactNames,
  guideEnabled,
  initialSnapshot,
  now,
  tracking: initialTracking,
}: Omit<IOrbitPlanProps, "guide">) {
  const { language, t } = useOrbitLanguage();
  const lang = language === "zh" ? "zh" : "en";
  const demo = useDemoMode();
  const demoActive = demo !== null;
  const demoClock = demo?.clock;
  // W0021：浏览器端读取按账号隔离；首帧计划来自 SSR，客户端只在写之后重读。
  useSharedReadAccount();
  const [liveSnapshot, setSnapshot] = useState(initialSnapshot);
  // 本次打开页面后打过勾（或取消）的行动：已完成也暂留在本周列表里方便撤销，刷新后消失。
  const [sticky, setSticky] = useState<readonly string[]>([]);
  const clock = useMemo(() => now ?? (demoClock ? demoClock() : new Date()), [demoClock, now]);
  // 示例：整份计划与人名来自示例人物（只读，写操作都被拦下，所以不进 state）。
  const demoPlan = useMemo(
    () => (demoActive ? { names: buildDemoPlanContactNames(lang), snapshot: buildDemoPlanSnapshot(clock, lang) } : null),
    [clock, demoActive, lang],
  );
  const snapshot = demoPlan ? demoPlan.snapshot : liveSnapshot;
  const contactNames = demoPlan ? demoPlan.names : liveContactNames;
  const model = buildMyPlanViewModel({
    contactNames,
    guideEnabled,
    language: lang,
    now: clock,
    snapshot,
    stickyActionIds: sticky,
  });
  // W0012：额度在重新分析成功后以服务端返回为准；示例里没有真实额度，按每月 1 次显示（点了会被拦下）。
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(
    demoActive ? 1 : initialTracking?.quotaRemaining ?? null,
  );
  const trackingView: MyPlanTrackingView | null =
    snapshot && snapshot !== "unavailable"
      ? buildPlanTrackingView({
          currentGoal: demoActive ? null : initialTracking?.currentGoal ?? null,
          language: lang,
          now: clock,
          periodContacts: demoActive ? null : initialTracking?.periodContacts ?? null,
          quotaRemaining,
          snapshot,
        })
      : null;
  const screenTitle = t({ en: "My plan", zh: "我的计划" });
  // W0010：待确认的匹配候选（读不到就不显示角标）；弹层打开时固定这条需求的候选。
  const [matches, setMatches] = useState<PlanMatchList | null>(null);
  const [matchNeedId, setMatchNeedId] = useState<string | null>(null);
  const hasPlan = snapshot !== null && snapshot !== "unavailable";
  useEffect(() => {
    if (typeof window === "undefined" || !hasPlan || demoActive) return;
    const controller = new AbortController();
    void fetchPlanMatches(controller.signal)
      .then((value) => setMatches(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, [demoActive, hasPlan]);
  const reloadPlan = () => {
    void fetchCurrentPlan()
      .then((value) => {
        if (value) setSnapshot(value);
      })
      .catch(() => undefined);
  };
  const [sheetCandidates, setSheetCandidates] = useState<PlanMatchList["candidates"]>([]);

  return (
    <IOrbitScreenFrame navExtra={demoActive ? <DemoNavPill /> : undefined} ready screenTitle={screenTitle}>
      {demoActive ? <DemoBanner message={PLAN_DEMO_MESSAGE} /> : null}
      <div className="ir-screen" data-orbit-guide-demo={demoActive ? "on" : undefined} data-orbit-iorbit-screen="plan">
        <span className="ir-crumb">
          <a href="/app/agent">iOrbit</a> / {screenTitle}
        </span>
        {model.state === "ready" && snapshot && snapshot !== "unavailable" ? (
          <PlanBody
            items={snapshot.items}
            onTicked={(itemId) => setSticky((current) => (current.includes(itemId) ? current : [...current, itemId]))}
            onSnapshot={(update) =>
              setSnapshot((current) => (current && current !== "unavailable" ? update(current) : current))
            }
            onInteraction={reloadPlan}
            onReanalysed={(remaining) => {
              if (remaining !== null) setQuotaRemaining(remaining);
              setSticky([]);
              reloadPlan();
            }}
            tracking={trackingView}
            onOpenMatches={(needId) => {
              setSheetCandidates((matches?.candidates ?? []).filter((candidate) => candidate.needId === needId));
              setMatchNeedId(needId);
            }}
            pendingByNeed={matches?.pendingByNeed ?? {}}
            view={model.view}
          />
        ) : model.state === "none" ? (
          <section className="ir-p-empty" data-orbit-plan-empty>
            <h2>{t({ en: "No plan yet", zh: "还没有计划" })}</h2>
            <p>
              {guideEnabled
                ? t({
                    en: "In step 3 of the guide, ask “How do I reach my goal?” and iOrbit builds your first plan from your goal and contacts.",
                    zh: "在引导第 3 步问一句「我该如何实现目标？」，iOrbit 会按你的目标和人脉生成第一份计划。",
                  })
                : t({
                    en: "Your first plan will show up here once it has been generated.",
                    zh: "生成第一份计划后，会显示在这里。",
                  })}
            </p>
            <a className="ir-p-empty-link" href={model.startHref}>
              {guideEnabled
                ? t({ en: "Go to step 3 →", zh: "去第 3 步生成计划 →" })
                : t({ en: "Back to iOrbit →", zh: "回到 iOrbit →" })}
            </a>
          </section>
        ) : (
          <section className="ir-p-empty" data-orbit-plan-unavailable>
            <h2>{t({ en: "Your plan can't be read right now", zh: "计划暂时读不到" })}</h2>
            <p>{t({ en: "Please refresh in a moment.", zh: "请稍后刷新再试。" })}</p>
          </section>
        )}
      </div>
      {matchNeedId ? (
        <PlanMatchDialog label={t({ en: "Plan matches", zh: "计划匹配" })} onClose={() => setMatchNeedId(null)}>
          <PlanMatchSheet
            candidates={sheetCandidates}
            heading={t({ en: "Who may fit this need", zh: "可能对应这条需求的人" })}
            onDecided={(candidateId, decision) => {
              setMatches((current) => (current ? withoutCandidate(current, candidateId) : current));
              if (decision === "accept") reloadPlan();
            }}
          />
        </PlanMatchDialog>
      ) : null}
      <DemoInterceptLayer />
    </IOrbitScreenFrame>
  );
}

function PlanBody({
  items,
  onInteraction,
  onOpenMatches,
  onReanalysed,
  onSnapshot,
  onTicked,
  pendingByNeed,
  tracking,
  view,
}: {
  items: PlanViewSnapshot["items"];
  onInteraction: () => void;
  onOpenMatches: (needId: string) => void;
  /** 新版本已保存：带回服务端的本月剩余次数（下一份计划不占额度时照样带回）。 */
  onReanalysed: (quotaRemaining: number | null) => void;
  onTicked: (itemId: string) => void;
  onSnapshot: (update: (current: PlanViewSnapshot) => PlanViewSnapshot) => void;
  pendingByNeed: Readonly<Record<string, number>>;
  tracking: MyPlanTrackingView | null;
  view: MyPlanView;
}) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";
  // W0014：示例里打勾与「记下」改弹「这是示例」，不发请求。
  const guardWrite = useDemoMode()?.guardWrite;
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const currentKey = view.phases.find((phase) => phase.current)?.key ?? null;
  const [openPhases, setOpenPhases] = useState<ReadonlySet<string>>(() => new Set(currentKey ? [currentKey] : []));
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [checkError, setCheckError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // 一次「记下」的幂等键：失败后重试沿用同一个（服务端可能已经写入、只是响应丢了），
  // 成功或改了文字／@ 才换新的。
  const noteKey = useRef<string | null>(null);
  // W0012：@ 的联系人（可多选）与活动（一条记录最多一个）。
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionContacts, setMentionContacts] = useState<readonly string[]>([]);
  const [mentionEvent, setMentionEvent] = useState<string | null>(null);
  // W0012：重新分析／下一份计划。一次点击持有一个幂等键，失败重试沿用。
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const followUpKey = useRef<{ origin: "reanalysis" | "next_plan"; key: string } | null>(null);

  const createFollowUp = async (origin: "reanalysis" | "next_plan") => {
    if (guardWrite) {
      guardWrite(t({ en: "plan", zh: "计划" }));
      return;
    }
    if (followUpBusy) return;
    setFollowUpBusy(true);
    setFollowUpError(null);
    if (followUpKey.current?.origin !== origin) {
      followUpKey.current = { key: newPlanIdempotencyKey(origin === "next_plan" ? "plan-next" : "plan-reanalyze"), origin };
    }
    try {
      const result = await postPlanReanalyze({
        basePlanId: view.planId,
        idempotencyKey: followUpKey.current.key,
        locale: zh ? "zh" : "en",
        origin,
      });
      followUpKey.current = null;
      setPromptDismissed(true);
      onReanalysed(result.quota?.remaining ?? null);
    } catch (error) {
      setFollowUpError(
        t({
          en: `Couldn't create the new plan. Nothing was changed. (${(error as Error).message})`,
          zh: `没能生成新计划，原计划没有变化。（${(error as Error).message}）`,
        }),
      );
    } finally {
      setFollowUpBusy(false);
    }
  };

  const toggleMention = (kind: "contact" | "event", id: string) => {
    noteKey.current = null;
    if (kind === "event") {
      setMentionEvent((current) => (current === id ? null : id));
      return;
    }
    setMentionContacts((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  };

  const toggleAction = async (itemId: string, done: boolean) => {
    if (guardWrite) {
      guardWrite(t({ en: "plan", zh: "计划" }));
      return;
    }
    if (busy.has(itemId)) return;
    setCheckError(null);
    setBusy((current) => new Set(current).add(itemId));
    const previous = items.find((item) => item.id === itemId);
    onTicked(itemId);
    onSnapshot((current) => withActionDone(current, itemId, done, new Date()));
    try {
      const result = await patchPlanActionDone(itemId, done);
      onSnapshot((current) => withServerItem(current, result.item, result.log));
    } catch (error) {
      // 只回滚这一条：期间别的行动可能已经保存成功。
      onSnapshot((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === itemId && previous ? previous : item)),
      }));
      setCheckError(
        t({
          en: `Couldn't save that — it has been put back. (${(error as Error).message})`,
          zh: `没能保存，已恢复原状。（${(error as Error).message}）`,
        }),
      );
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  };

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (guardWrite) {
      guardWrite(t({ en: "progress log", zh: "进展记录" }));
      return;
    }
    const body = note.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      noteKey.current ??= newPlanIdempotencyKey("plan-note");
      const mentioned = mentionContacts.length > 0;
      const entry = await postPlanNote(body, noteKey.current, { contactIds: mentionContacts, eventId: mentionEvent });
      onSnapshot((current) => withLogEntry(current, entry));
      noteKey.current = null;
      setNote("");
      setMentionContacts([]);
      setMentionEvent(null);
      setMentionOpen(false);
      // @ 了人：服务端已把 TA 在人脉需求里改为已建立联系，重新读一次计划。
      if (mentioned) onInteraction();
    } catch (error) {
      setNoteError(
        t({
          en: `Couldn't save the note. (${(error as Error).message})`,
          zh: `没能记下这条进展。（${(error as Error).message}）`,
        }),
      );
    } finally {
      setNoteBusy(false);
    }
  };

  const togglePhase = (key: string) =>
    setOpenPhases((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const remaining = tracking?.quotaRemaining ?? null;
  const reanalyseDisabled = followUpBusy || view.week.ended || (!guardWrite && (remaining === null || remaining <= 0));
  const prompts = tracking && !promptDismissed && !view.week.ended ? tracking.prompts : [];
  const selectedMentions = view.mentionOptions.filter((option) =>
    option.kind === "event" ? option.id === mentionEvent : mentionContacts.includes(option.id),
  );

  const weekText = zh
    ? `第 ${view.week.current} 周 / 共 ${view.week.total} 周`
    : `Week ${view.week.current} of ${view.week.total}`;
  const meta = [
    zh ? `计划 v${view.version} · ${view.generatedLabel} 生成` : `Plan v${view.version} · created ${view.generatedLabel}`,
    view.supplement,
    view.week.ended ? t({ en: "past its last week", zh: "已过最后一周" }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header className="ir-p-mast">
        <h2 className="ir-p-goal" data-orbit-plan-goal>
          {view.goal}
          {guardWrite ? <DemoTag /> : null}
        </h2>
        <div className="ir-p-meta">
          <span>{meta}</span>
          <span className="ir-p-meta-acts">
            {view.analysis ? (
              <button
                aria-controls="ir-p-analysis"
                aria-expanded={analysisOpen}
                className="btn ir-p-link"
                data-orbit-plan-analysis-toggle
                onClick={() => setAnalysisOpen((open) => !open)}
                type="button"
              >
                {analysisOpen
                  ? t({ en: "Hide goal analysis ▴", zh: "收起目标分析 ▴" })
                  : t({ en: "Goal analysis ▾", zh: "目标分析 ▾" })}
              </button>
            ) : null}
            {/* W0012：重新分析生成新版本（已完成的内容带过去），每个东京自然月 1 次。
                到期的计划走下方回顾里的「制定下一份计划」（不占额度），这里不再可点。 */}
            <button
              className="btn ir-p-link"
              data-orbit-plan-reanalyse
              data-orbit-plan-quota={remaining ?? undefined}
              disabled={reanalyseDisabled}
              onClick={() => void createFollowUp("reanalysis")}
              title={
                view.week.ended
                  ? t({ en: "This plan has ended — use “Make the next plan” below.", zh: "计划已到期，请用下方的「制定下一份计划」。" })
                  : t({
                      en: "Creates a new version and carries over what you've done. Once per calendar month.",
                      zh: "生成新版本，已完成的内容会带过去。每个自然月 1 次。",
                    })
              }
              type="button"
            >
              {remaining === null
                ? t({ en: "Re-analyse", zh: "重新分析" })
                : t({ en: `Re-analyse · ${remaining} left this month`, zh: `重新分析 · 本月剩 ${remaining} 次` })}
            </button>
          </span>
        </div>
        {view.analysis && analysisOpen ? (
          <div className="ir-p-analysis" data-orbit-plan-analysis id="ir-p-analysis">
            {view.analysis.answer ? (
              <p>
                <b>{t({ en: "In one line: ", zh: "一句话回答：" })}</b>
                {view.analysis.answer}
              </p>
            ) : null}
            {view.analysis.figures.length > 0 ? (
              <p>
                <b>{t({ en: "Key numbers: ", zh: "关键数字：" })}</b>
                {view.analysis.figures.join(zh ? "；" : "; ")}
              </p>
            ) : null}
            {view.analysis.gaps.length > 0 ? (
              <p>
                <b>{t({ en: "Still missing: ", zh: "还缺的人：" })}</b>
                {view.analysis.gaps.join(zh ? "、" : ", ")}
              </p>
            ) : null}
            {view.analysis.risk ? (
              <p>
                <b>{t({ en: "Biggest risk: ", zh: "最大的风险：" })}</b>
                {view.analysis.risk}
              </p>
            ) : null}
          </div>
        ) : null}
        <div aria-label={t({ en: `Plan progress: ${weekText}`, zh: `计划进度：${weekText}` })} className="ir-p-ruler" data-orbit-plan-ruler role="group">
          <div className="ir-p-ruler-phases" style={{ gridTemplateColumns: `repeat(${view.week.total}, minmax(0, 1fr))` }}>
            {view.ruler.phases.map((phase) => (
              <span
                className={phase.current ? "ir-p-cur" : undefined}
                key={phase.n}
                style={{ gridColumn: `${phase.startWeek} / span ${phase.span}` }}
                title={`${phase.n} · ${phase.title}`}
              >
                {phase.n} · {phase.title}
              </span>
            ))}
          </div>
          <div className="ir-p-ruler-weeks" style={{ gridTemplateColumns: `repeat(${view.week.total}, minmax(0, 1fr))` }}>
            {view.ruler.weeks.map((week) => (
              <i
                className={week.state === "past" ? "ir-p-past" : week.state === "now" ? "ir-p-now" : undefined}
                data-orbit-plan-week={week.no}
                key={week.no}
              >
                {week.state === "now" ? <span>{t({ en: "This week", zh: "本周" })}</span> : null}
              </i>
            ))}
          </div>
          <div className="ir-p-ruler-foot">
            <span>{view.ruler.startLabel}</span>
            <span data-orbit-plan-week-text>{weekText}</span>
            <span>{view.ruler.endLabel}</span>
          </div>
        </div>
        {followUpError ? (
          <p className="ir-p-alert" data-orbit-plan-followup-error role="alert">
            {followUpError}
          </p>
        ) : null}
        {tracking?.review ? (
          <section className="ir-p-track" data-orbit-plan-review>
            <h3>{t({ en: "Plan review", zh: "计划到期回顾" })}</h3>
            <ul>
              {tracking.review.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              {t({
                en: "The next plan carries over what you've done and doesn't use this month's re-analysis.",
                zh: "下一份计划会带上已完成的内容，不占本月的重新分析次数。",
              })}
            </p>
            <div className="ir-p-track-acts">
              <button
                className="btn ir-p-track-btn"
                data-orbit-plan-next
                disabled={followUpBusy}
                onClick={() => void createFollowUp("next_plan")}
                type="button"
              >
                {followUpBusy ? t({ en: "Making the plan…", zh: "正在生成…" }) : t({ en: "Make the next plan", zh: "制定下一份计划" })}
              </button>
            </div>
          </section>
        ) : null}
        {prompts.length > 0 ? (
          <section className="ir-p-track" data-orbit-plan-reanalysis-prompt>
            <h3>{t({ en: "Re-analyse the plan?", zh: "要不要重新分析？" })}</h3>
            <ul>
              {prompts.map((prompt) => (
                <li data-orbit-plan-trigger={prompt.key} key={prompt.key}>
                  {prompt.text}
                </li>
              ))}
            </ul>
            <div className="ir-p-track-acts">
              <button
                className="btn ir-p-track-btn"
                data-orbit-plan-reanalyse-confirm
                disabled={reanalyseDisabled}
                onClick={() => void createFollowUp("reanalysis")}
                type="button"
              >
                {remaining === null
                  ? t({ en: "Re-analyse", zh: "重新分析" })
                  : t({ en: `Re-analyse (${remaining} left this month)`, zh: `重新分析（本月剩 ${remaining} 次）` })}
              </button>
              <button
                className="btn ir-p-track-ghost"
                data-orbit-plan-reanalyse-dismiss
                onClick={() => setPromptDismissed(true)}
                type="button"
              >
                {t({ en: "Not now", zh: "先不用" })}
              </button>
            </div>
          </section>
        ) : null}
      </header>

      <div className="ir-p-spread">
        <section aria-label={t({ en: "Actions", zh: "行动" })} className="ir-p-col">
          <div className="ir-p-label">
            <span>{zh ? `本周 · 第 ${view.week.current} 周` : `This week · week ${view.week.current}`}</span>
            <em>{view.week.rangeLabel}</em>
          </div>
          {checkError ? (
            <p className="ir-p-alert" role="alert">
              {checkError}
            </p>
          ) : null}
          {view.thisWeek.length > 0 ? (
            <div className="ir-p-week-list" data-orbit-plan-this-week>
              {view.thisWeek.some((action) => action.matchContactId) ? <style>{PLAN_MATCH_STYLES}</style> : null}
              {view.thisWeek.map((action) => (
                <div
                  className={action.done ? "ir-p-act ir-p-act-done" : "ir-p-act"}
                  data-orbit-plan-action={action.id}
                  key={action.id}
                >
                  <button
                    aria-checked={action.done}
                    aria-label={action.title}
                    className="btn ir-p-box"
                    disabled={busy.has(action.id)}
                    onClick={() => void toggleAction(action.id, !action.done)}
                    role="checkbox"
                    type="button"
                  />
                  <div className="ir-p-act-t">{action.title}</div>
                  <div className="ir-p-act-m">
                    {action.weeksOverdue > 0 ? (
                      <span className="ir-p-pill ir-p-pill-hot" data-orbit-plan-overdue={action.weeksOverdue}>
                        {zh ? `已延后 ${action.weeksOverdue} 周` : `Pushed back ${action.weeksOverdue} wk`}
                      </span>
                    ) : (
                      <span>{action.weekLabel}</span>
                    )}
                    {action.detail ? <span>{action.detail}</span> : null}
                  </div>
                  {action.matchContactId && !action.done ? (
                    <div className="pms ir-p-act-x">
                      <MatchActionButtons actionItemId={action.id} onLogged={onInteraction} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-p-empty-line">
              {t({ en: "Nothing left to do this week.", zh: "这周没有待办的行动。" })}
            </p>
          )}

          <div className="ir-p-label">
            <span>{t({ en: "Phases", zh: "阶段" })}</span>
            {view.week.phaseNo ? (
              <em>{zh ? `当前：第 ${view.week.phaseNo} 阶段` : `Now: phase ${view.week.phaseNo}`}</em>
            ) : null}
          </div>
          <div>
            {view.phases.map((phase) => (
              <PhaseBlock
                key={phase.key}
                onToggle={() => togglePhase(phase.key)}
                open={openPhases.has(phase.key)}
                phase={phase}
              />
            ))}
          </div>
        </section>

        <aside aria-label={t({ en: "Network needs", zh: "人脉需求" })} className="ir-p-col">
          <div className="ir-p-label">
            <span>{t({ en: "Network needs", zh: "人脉需求" })}</span>
            <em>{t({ en: "people newest first", zh: "人员按添加时间倒序" })}</em>
          </div>
          {view.needs.length > 0 ? (
            <div className="ir-p-needs">
              {view.needs.map((need) => (
                <div className="ir-p-need" data-orbit-plan-need={need.id} key={need.id}>
                  <div className="ir-p-need-h">
                    <b>
                      {need.title}
                      {need.industry ? <small>{need.industry}</small> : null}
                    </b>
                    {/* W0010：「待确认 N」角标，点开共用的确认组件（只列这条需求的候选）。 */}
                    {(pendingByNeed[need.id] ?? 0) > 0 ? (
                      <button
                        className="btn ir-p-match"
                        data-orbit-plan-need-matches={need.id}
                        onClick={() => onOpenMatches(need.id)}
                        type="button"
                      >
                        {zh ? `待确认 ${pendingByNeed[need.id]}` : `${pendingByNeed[need.id]} to confirm`}
                      </button>
                    ) : null}
                  </div>
                  <div className="ir-p-need-count">
                    <span>
                      <b>{need.established}</b> {t({ en: "connected", zh: "已建立联系" })}
                    </span>
                    <span>
                      <b>{need.linked}</b> {t({ en: "linked", zh: "已关联" })}
                    </span>
                  </div>
                  {need.people.length > 0 ? (
                    <ul className="ir-p-people">
                      {need.people.map((person) => (
                        <li key={person.contactId}>
                          <a
                            className="ir-p-person"
                            data-orbit-plan-person={person.contactId}
                            href={`/app/contacts/${encodeURIComponent(person.contactId)}`}
                          >
                            <span className="ir-p-ini">{person.initial}</span>
                            <span>
                              <b>
                                {person.name}
                                {guardWrite ? <DemoTag /> : null}
                              </b>
                              {person.subtitle ? <small>{person.subtitle}</small> : null}
                            </span>
                            <span className={person.state === "established" ? "ir-p-st ir-p-st-est" : "ir-p-st"}>
                              {person.state === "established"
                                ? t({ en: "Connected", zh: "已建立联系" })
                                : t({ en: "Linked", zh: "已关联" })}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="ir-p-need-empty">{t({ en: "Nobody linked yet", zh: "还没有关联的人" })}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-p-empty-line">{t({ en: "This plan has no network needs.", zh: "这份计划没有人脉需求。" })}</p>
          )}

          <div className="ir-p-label">
            <span>{t({ en: "Events in the plan", zh: "计划里的活动" })}</span>
          </div>
          {view.events.length > 0 ? (
            view.events.map((event) => (
              <div className="ir-p-ev" data-orbit-plan-event={event.id} key={event.id}>
                <div className="ir-p-ev-date">{event.dateLabel ?? "—"}</div>
                <div>
                  {event.eventId ? (
                    <a className="ir-p-ev-t" href={`/app/events/${encodeURIComponent(event.eventId)}`}>
                      {event.title}
                    </a>
                  ) : (
                    <span className="ir-p-ev-t">{event.title}</span>
                  )}
                  <span className="ir-p-ev-s">
                    {[
                      eventStatusText(event.status, t),
                      event.need ? (zh ? `对应「${event.need}」` : `for “${event.need}”`) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="ir-p-empty-line">{t({ en: "No events in this plan yet.", zh: "计划里还没有活动。" })}</p>
          )}
        </aside>
      </div>

      <section aria-label={t({ en: "Progress log", zh: "进展记录" })} className="ir-p-log">
        <div className="ir-p-label">
          <span>{t({ en: "Progress log", zh: "进展记录" })}</span>
        </div>
        <form autoComplete="off" className="ir-p-log-in" data-orbit-plan-log-form onSubmit={(event) => void submitNote(event)}>
          <label className="ir-screen-title" htmlFor="ir-p-log-input">
            {t({ en: "Note some progress", zh: "记一笔进展" })}
          </label>
          <input
            className="ir-p-log-input"
            id="ir-p-log-input"
            maxLength={2000}
            onChange={(event) => {
              if (event.target.value.trim() !== note.trim()) noteKey.current = null;
              setNote(event.target.value);
            }}
            placeholder={t({
              en: "Note some progress, e.g. booked a call for next Tuesday",
              zh: "记一笔进展，例如：约好了下周二通电话",
            })}
            type="text"
            value={note}
          />
          <button className="btn ir-p-log-btn" disabled={noteBusy || !note.trim()} type="submit">
            {t({ en: "Save", zh: "记下" })}
          </button>
        </form>
        {view.mentionOptions.length > 0 ? (
          <div className="ir-p-mentions" data-orbit-plan-mentions>
            <button
              aria-expanded={mentionOpen}
              className="btn ir-p-mention"
              data-orbit-plan-mention-toggle
              onClick={() => setMentionOpen((open) => !open)}
              type="button"
            >
              {t({ en: "@ Mention a contact or event", zh: "@ 提及联系人或活动" })}
            </button>
            {(mentionOpen ? view.mentionOptions : selectedMentions).map((option) => (
              <button
                aria-pressed={option.kind === "event" ? option.id === mentionEvent : mentionContacts.includes(option.id)}
                className="btn ir-p-mention"
                data-orbit-plan-mention={option.id}
                data-orbit-plan-mention-kind={option.kind}
                key={`${option.kind}:${option.id}`}
                onClick={() => toggleMention(option.kind, option.id)}
                type="button"
              >
                @{option.label}
              </button>
            ))}
          </div>
        ) : null}
        {noteError ? (
          <p className="ir-p-alert" role="alert">
            {noteError}
          </p>
        ) : null}
        {view.log.length > 0 ? (
          <ul className="ir-p-log-list" data-orbit-plan-log>
            {view.log.map((line) => (
              <li
                className={line.kind === "manual" ? "ir-p-log-item ir-p-log-manual" : "ir-p-log-item"}
                data-orbit-plan-log-entry={line.id}
                key={line.id}
              >
                <time>{line.timeLabel}</time>
                <i className="ir-p-log-k" />
                <span>
                  {line.text}
                  {line.mentions.length > 0 ? (
                    <span className="ir-p-log-mention" data-orbit-plan-log-mentions>
                      {line.mentions.join(" ")}
                    </span>
                  ) : null}
                  {line.kind === "manual" ? <small>{t({ en: "manual", zh: "手动" })}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ir-p-empty-line">{t({ en: "No progress noted yet.", zh: "还没有进展记录。" })}</p>
        )}
      </section>
    </>
  );
}

type Translate = (copy: { en: string; zh: string }) => string;

function eventStatusText(status: string, t: Translate): string {
  switch (status) {
    case "registered":
      return t({ en: "Registered", zh: "已报名" });
    case "attended":
      return t({ en: "Attended", zh: "已参加" });
    default:
      return t({ en: "Recommended", zh: "推荐" });
  }
}

function PhaseBlock({ onToggle, open, phase }: { onToggle: () => void; open: boolean; phase: MyPlanPhase }) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";
  const bodyId = `ir-p-phase-${phase.key}`;
  const progress = zh
    ? `${phase.actionsDone} / ${phase.actionsTotal} 行动`
    : `${phase.actionsDone} / ${phase.actionsTotal} actions`;
  const rows: Array<{ label: string; body: ReactNode }> = [];
  if (phase.actions.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.actions.map((action) => (
            <li className={action.done ? "ir-p-done" : undefined} key={action.id}>
              {action.weekLabel ? <span className="ir-p-wk">{action.weekLabel}</span> : null}
              {action.title}
            </li>
          ))}
        </ul>
      ),
      label: t({ en: "To do", zh: "要做的事" }),
    });
  }
  if (phase.who.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.who.map((who) => (
            <li key={who}>{who}</li>
          ))}
        </ul>
      ),
      label: t({ en: "People to meet", zh: "要认识的人" }),
    });
  }
  if (phase.infos.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.infos.map((info) => (
            <li data-orbit-plan-info={info.id} key={info.id}>
              {info.title}
              {info.answer ? (
                <div className="ir-p-info-a">✓ {info.answer}</div>
              ) : (
                <div className="ir-p-info-none">{t({ en: "No answer yet", zh: "还没有答案" })}</div>
              )}
            </li>
          ))}
        </ul>
      ),
      label: t({ en: "To find out", zh: "要搞清楚" }),
    });
  }
  if (phase.events.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.events.map((event) => (
            <li key={event.id}>
              {event.dateLabel ? `${event.dateLabel} ` : ""}
              {event.title}{" "}
              <span
                className={
                  event.status === "recommended" ? "ir-p-pill ir-p-pill-line" : "ir-p-pill ir-p-pill-good"
                }
              >
                {eventStatusText(event.status, t)}
              </span>
            </li>
          ))}
        </ul>
      ),
      label: t({ en: "Events", zh: "可以去的活动" }),
    });
  }
  if (phase.pitch) {
    rows.push({
      body: (
        <div className="ir-p-script">
          <small>{phase.pitch.setting}</small>
          {phase.pitch.text}
        </div>
      ),
      label: t({ en: "Intro", zh: "自我介绍" }),
    });
  }
  if (phase.followups.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.followups.map((followup) => (
            <li key={followup}>{followup}</li>
          ))}
        </ul>
      ),
      label: t({ en: "Follow-up", zh: "之后怎么跟进" }),
    });
  }

  return (
    <div className={phase.current ? "ir-p-phase ir-p-phase-cur" : "ir-p-phase"} data-orbit-plan-phase={phase.key}>
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className="btn ir-p-phase-h"
        onClick={onToggle}
        type="button"
      >
        <span className="ir-p-pn">{phase.n}</span>
        <b className="ir-p-phase-name">{phase.title}</b>
        <span className="ir-p-phase-sub">
          {phase.weeksLabel} · {progress}
        </span>
        <i className="ir-p-phase-toggle">
          {open ? t({ en: "Collapse ▴", zh: "收起 ▴" }) : t({ en: "Expand ▾", zh: "展开 ▾" })}
        </i>
      </button>
      {open ? (
        <div className="ir-p-phase-body" id={bodyId}>
          {rows.length > 0 ? (
            <div className="ir-p-pd">
              {phase.summary ? (
                <div className="ir-p-pd-row">
                  <span>{t({ en: "Goal", zh: "这一段" })}</span>
                  <div>{phase.summary}</div>
                </div>
              ) : null}
              {rows.map((row) => (
                <div className="ir-p-pd-row" key={row.label}>
                  <span>{row.label}</span>
                  {row.body}
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-p-empty-line">{phase.summary ?? t({ en: "No details yet.", zh: "还没有细节。" })}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
