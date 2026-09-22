/**
 * 执行计划（Orbit_0918 iOrbit plan 屏，设计 429–501）。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html：
 *   431      面包屑 `iOrbit / 执行计划`
 *   432–438  「← 返回概览」+ H1 + 副标题（flex-end 一行）
 *   440      两列栅格 minmax(0,2.4fr) / minmax(260px,1fr)
 *   442–455  本周重点：段头 + 完成度条（446）+ 每行序号 / 勾选框 / 标题 / `▦ {{ t.due }}`（452）
 *   457–478  4 周推进节奏手风琴（459–476）
 *   479–482  「✦ 让 iOrbit 优化计划 →」
 *   485–493  aside「计划概览」四行统计
 *   494–497  aside「本周日程」+「回到日历 →」
 *
 * 数据 = `plan-route-view-model.ts`（本任务不碰数据层）：facts 快照的
 * followups.current / appointments + `GET /api/agent/ledger`。
 * 设计的 `taskData` / `weekData` 人名 / `done:[true,false,false]` 派生的
 * planDoneLabel / planPct / 12 人 / 4 场 / 20 次 / 「9/18 产品讨论 · 东京 AI 交流会」
 * 一概不用（「审阅修订」20）：
 *   - 完成度条 = `iorbitLedgerProgress()` 的真实账本计数
 *   - `▦ {{ t.due }}` = followup 的真实 dueAt
 *   - 本周日程 = facts 的真实约谈
 *   - aside 四行 = view model 的真实计数，末行是真实完成度
 * 「4 周推进节奏」没有接口（`plan-route-view-model.ts:8` 已记）→ 沿用既有
 * 「等 W4」卡，不伪造（「审阅修订」20）。
 *
 * 勾选框（设计 450）：这些行是 followup 与账本条目，**没有**行内 toggle 写接口
 * （「审阅修订」10）→ 渲染成 `aria-disabled` 的静态状态标记，不做假按钮。
 */
"use client";

import { useEffect, useState } from "react";

import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import {
  buildAgentPlanViewModel,
  type AgentPlanDataState,
  type AgentPlanViewModel,
} from "../plan/plan-route-view-model";
import { iorbitLedgerProgress, iorbitPlanWeeks } from "./iorbit-model";
import { IOrbitScreenFrame } from "./iorbit-screen-frame";

type Loadable<T> = T | "pending" | "unavailable";

function isLedgerEntries(value: unknown): value is { entries: readonly AgentLedgerEntry[] } {
  if (typeof value !== "object" || value === null) return false;
  return Array.isArray((value as { entries?: unknown }).entries);
}

/** 让 iOrbit 优化计划：把提示词带进 `ask`（壳读 `?q=` 后直接发起提问）。 */
export const IORBIT_PLAN_OPTIMIZE_PROMPT = {
  en: "Review my current plan and suggest how to adjust this week's rhythm.",
  zh: "结合我现在的进展，帮我调整这份计划的行动节奏。",
} as const;

export interface IOrbitPlanProps {
  /** 覆盖点，仅测试使用：默认动态 import `home-dashboard-actions`（server action）。 */
  loadSnapshot?: () => Promise<Loadable<HomeDashboardSnapshot>>;
  /** 覆盖点，仅测试使用：4 周区间的「今天」。 */
  now?: Date;
}

export function IOrbitPlan({ loadSnapshot, now }: IOrbitPlanProps = {}) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";
  const [snapshot, setSnapshot] = useState<Loadable<HomeDashboardSnapshot>>("pending");
  const [ledger, setLedger] = useState<Loadable<readonly AgentLedgerEntry[]>>("pending");
  // 设计 459 的第一周默认展开（`weekData[0].open`）；其余折叠。
  const [openWeek, setOpenWeek] = useState<number | null>(1);
  const weeks = iorbitPlanWeeks(now ?? new Date(), zh ? "zh" : "en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let live = true;
    const load =
      loadSnapshot ??
      (() =>
        import("../home-dashboard-actions")
          .then((mod) => mod.refreshHomeDashboardAction())
          .then((result) =>
            result.state === "snapshot"
              ? (result.snapshot as Loadable<HomeDashboardSnapshot>)
              : ("unavailable" as const),
          ));
    void load()
      .then((value) => {
        if (live) setSnapshot(value);
      })
      .catch(() => {
        if (live) setSnapshot("unavailable");
      });
    return () => {
      live = false;
    };
  }, [loadSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    void fetch("/api/agent/ledger", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          data?: unknown;
          success?: boolean;
        } | null;
        if (!response.ok || !body?.success || !isLedgerEntries(body.data)) {
          setLedger("unavailable");
          return;
        }
        setLedger(body.data.entries);
      })
      .catch(() => setLedger("unavailable"));
    return () => controller.abort();
  }, []);

  const viewModel: AgentPlanViewModel = buildAgentPlanViewModel({
    language: zh ? "zh" : "en",
    ledger,
    snapshot,
  });

  const progress = Array.isArray(ledger) ? iorbitLedgerProgress(ledger) : null;
  // 「审阅修订」37：两个来源都不再 pending 才算就绪，像素比对等的是这个标志。
  const ready = snapshot !== "pending" && ledger !== "pending";

  const stateNote = (state: AgentPlanDataState) =>
    state === "pending"
      ? t({ en: "Loading…", zh: "加载中…" })
      : state === "unavailable"
        ? t({ en: "This source is temporarily unavailable.", zh: "来源暂时不可用。" })
        : t({ en: "Nothing scheduled here right now.", zh: "当前没有安排。" });

  return (
    <IOrbitScreenFrame ready={ready} screenTitle={t({ en: "Plan", zh: "执行计划" })}>
      <div className="ir-screen">
        {/* 431 */}
        <span className="ir-crumb">
          <a href="/app/agent">iOrbit</a> / {t({ en: "Plan", zh: "执行计划" })}
        </span>

        {/* 432–438 */}
        <div className="ir-title-row">
          <a className="ir-back" href="/app/agent">
            {t({ en: "← Back to overview", zh: "← 返回概览" })}
          </a>
          <div className="ir-title-col-8">
            <h2 className="ir-h1-sub">{t({ en: "Plan", zh: "执行计划" })}</h2>
            <p className="ir-lede">
              {t({
                en: "Your goals broken into a clear rhythm you can move through.",
                zh: "把目标拆成清晰的行动节奏，帮助你逐步推进。",
              })}
            </p>
          </div>
        </div>

        <div className="ir-two-col">
          <div className="ir-col-main">
            {/* 442–455 */}
            <section className="ir-panel ir-panel-16" data-orbit-agent-plan-section="focus">
              <div className="ir-sec-head">
                <span className="ir-tier-label">
                  <span className="ir-tier-icon ir-tint-accent">◎</span>
                  <strong className="ir-tier-h">
                    {t({ en: "Focus this week", zh: "本周重点" })}
                  </strong>
                </span>
                <span className="ir-progress-bar-row">
                  {t({ en: "Completed", zh: "完成度" })}{" "}
                  {progress ? `${progress.done} / ${progress.total}` : "—"}
                  <span className="ir-progress-track">
                    <span
                      className="ir-progress-fill"
                      style={{ width: `${progress?.percent ?? 0}%` }}
                    />
                  </span>
                  <strong className="ir-progress-pct">
                    {progress ? `${progress.percent}%` : "—"}
                  </strong>
                </span>
              </div>
              {viewModel.focusState === "ready" ? (
                viewModel.focusTasks.map((task, index) => (
                  <div className="ir-task-row" key={task.id}>
                    <span className="ir-task-no">{index + 1}</span>
                    {/* 设计 450 是一个 toggle 按钮；这些行没有行内写接口（「审阅修订」10）→
                        静态状态标记，明确 aria-disabled，不做假按钮。 */}
                    <span
                      aria-disabled="true"
                      aria-label={t({ en: "Not completed", zh: "未完成" })}
                      className="ir-task-mark"
                      role="img"
                    />
                    <span className="ir-row-copy">
                      <strong className="ir-row-title">{task.title}</strong>
                      {task.meta ? <span className="ir-row-desc">{task.meta}</span> : null}
                    </span>
                    {task.dueLabel ? (
                      <span className="ir-task-due">▦ {task.dueLabel}</span>
                    ) : null}
                  </div>
                ))
              ) : (
                <span className="ir-panel-note" data-state={viewModel.focusState}>
                  {stateNote(viewModel.focusState)}
                </span>
              )}
            </section>

            {/* 457–478：4 周推进节奏。手风琴本身是设计的真交互（open / caret / headBg），
                周次区间是真实日历；每周的目标 / 关键联系人 / 关键产出**没有接口**
                （`plan-route-view-model.ts:8`）→ 展开区是既有「等 W4」说明，不伪造
                设计 `weekData` 里的主题与人名（「审阅修订」20）。 */}
            <section className="ir-panel ir-panel-14" data-orbit-agent-plan-section="weeks">
              <span className="ir-tier-label">
                <span className="ir-tier-icon ir-tint-accent">▦</span>
                <strong className="ir-tier-h">
                  {t({ en: "Four-week rhythm", zh: "4 周推进节奏" })}
                </strong>
              </span>
              {weeks.map((week) => {
                const open = openWeek === week.no;
                return (
                  <div className="ir-week" key={week.no}>
                    <button
                      aria-expanded={open}
                      className="btn ir-week-head"
                      data-orbit-iorbit-plan-week={week.no}
                      onClick={() => setOpenWeek(open ? null : week.no)}
                      style={{ background: open ? "#F7F7FD" : "#FFFFFF" }}
                      type="button"
                    >
                      <span className="ir-week-no">{week.no}</span>
                      <strong className="ir-week-title">
                        {zh ? `第 ${week.no} 周` : `Week ${week.no}`}
                      </strong>
                      <span className="ir-week-range">{week.range}</span>
                      <span className="ir-week-theme" />
                      <span className="ir-caret">{open ? "⌃" : "⌄"}</span>
                    </button>
                    {open ? (
                      <div className="ir-week-body">
                        {(
                          [
                            { icon: "⚑", label: { en: "Goals", zh: "本周目标" } },
                            { icon: "⚇", label: { en: "Key people", zh: "关键联系人" } },
                            {
                              icon: "▤",
                              label: { en: "Key events / output", zh: "关键活动 / 产出" },
                            },
                          ] as const
                        ).map((card) => (
                          <div className="ir-week-card" key={card.label.en}>
                            <span className="ir-week-card-h">
                              {card.icon} {t(card.label)}
                            </span>
                            <span className="ir-week-card-body">
                              {t({
                                en: "Needs the W4 strategy capability, which is not available yet. Ask iOrbit in chat for now.",
                                zh: "需要 W4 策略生成能力，尚未上线；目前可在对话中直接向 iOrbit 提问。",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <span className="ir-waiting-badge">
                {t({
                  en: "Coming with the W4 strategy capability",
                  zh: "随 W4 策略能力上线",
                })}
              </span>
            </section>

            {/* 479–482 */}
            <section className="ir-cta-band">
              <span className="ir-cta-copy">
                <strong className="ir-cta-title">
                  {t({
                    en: "✦ Hand the plan back to iOrbit whenever you need",
                    zh: "✦ 需要时可以继续交给 iOrbit 优化计划",
                  })}
                </strong>
                <span className="ir-cta-desc">
                  {t({
                    en: "With your latest progress, iOrbit can adjust the rhythm and suggest new people or events.",
                    zh: "基于最新进展，iOrbit 可以为你调整行动节奏，推荐新的联系人或活动。",
                  })}
                </span>
              </span>
              <a
                className="ir-cta-btn"
                data-orbit-iorbit-plan-optimize
                href={`/app/agent?q=${encodeURIComponent(t(IORBIT_PLAN_OPTIMIZE_PROMPT))}`}
              >
                {t({ en: "✦ Let iOrbit refine the plan →", zh: "✦ 让 iOrbit 优化计划 →" })}
              </a>
            </section>
          </div>

          {/* 485–497 */}
          <aside className="ir-aside ir-aside-12">
            <div className="ir-panel ir-panel-14">
              <span className="ir-aside-title">
                <span className="ir-aside-icon">▥</span>
                <strong className="ir-aside-h">
                  {t({ en: "Plan overview", zh: "计划概览" })}
                </strong>
              </span>
              {/* 设计 486–492 是四行；末行固定是完成度（「审阅修订」19），
                  因此真实计数取前三条，不多不少，几何与设计一致。 */}
              {viewModel.overview.slice(0, 3).map((count) => (
                <span className="ir-stat-line" key={count.key}>
                  <span className="ir-stat-line-label">{count.label}</span>
                  <strong className="ir-stat-line-value">{count.value ?? "—"}</strong>
                </span>
              ))}
              <span className="ir-stat-line">
                <span className="ir-stat-line-label">
                  {t({ en: "Completion", zh: "当前完成度" })}
                </span>
                <strong className="ir-stat-line-value">
                  {progress ? `${progress.percent}%` : "—"}
                </strong>
              </span>
            </div>
            <div className="ir-panel ir-panel-12">
              <strong className="ir-aside-h">
                ▦ {t({ en: "This week's schedule", zh: "本周日程" })}
              </strong>
              {viewModel.scheduleState === "ready" ? (
                <span className="ir-aside-lines">
                  {viewModel.schedule.map((item) => (
                    <span className="ir-aside-line" key={item.id}>
                      {item.dayLabel} {item.timeLabel} {item.title}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="ir-panel-note" data-state={viewModel.scheduleState}>
                  {stateNote(viewModel.scheduleState)}
                </span>
              )}
              {/* 496：「回到日历 →」回 home（「审阅修订」19） */}
              <a className="ir-aside-btn" href="/app/agent">
                {t({ en: "Back to the calendar →", zh: "回到日历 →" })}
              </a>
            </div>
          </aside>
        </div>
      </div>
    </IOrbitScreenFrame>
  );
}
