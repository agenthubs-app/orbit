/**
 * 执行计划（Orbit_0918 iOrbit plan 屏）主界面（client component）。
 *
 * 数据 = 已交付既有通道的静态聚合（见 plan-route-view-model.ts）：
 *   facts 快照（followups.current / appointments）经 refreshHomeDashboardAction
 *   （use server），运行时动态 import + window 守卫：SSR/测试零副作用；
 *   账本项经 GET /api/agent/ledger（只读列表，与 Today/All actions 同一服务）。
 * 空态/失败态如实呈现，不放设计稿 mock 内容；「4 周推进节奏」无接口，本屏不做。
 */
"use client";

import { useEffect, useState } from "react";

import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { OrbitLanguage } from "../../orbit-language-core";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import {
  buildAgentPlanViewModel,
  type AgentPlanDataState,
  type AgentPlanViewModel,
} from "./plan-route-view-model";

const COPY = {
  en: {
    backHome: "← Back to iOrbit",
    breadcrumbHome: "iOrbit",
    crumb: "Plan",
    empty: "Nothing scheduled here right now.",
    focus: "Focus this week",
    focusHint: "Follow-ups in progress plus ledger actions already approved or executing.",
    optimize: "Ask iOrbit to refine the plan →",
    schedule: "This week's schedule",
    scheduleHint: "Confirmed appointments within seven days.",
    statePending: "Loading…",
    stateUnavailable: "This source is temporarily unavailable.",
    title: "Plan",
  },
  zh: {
    backHome: "← 返回概览",
    breadcrumbHome: "iOrbit",
    crumb: "执行计划",
    empty: "当前没有安排。",
    focus: "本周重点",
    focusHint: "进行中的关系跟进 + 账本已批准或正在执行的动作。",
    optimize: "让 iOrbit 优化计划 →",
    schedule: "本周日程",
    scheduleHint: "七日内已确认的约谈。",
    statePending: "加载中…",
    stateUnavailable: "来源暂时不可用。",
    title: "执行计划",
  },
} as const;

type PlanCopy = Record<keyof (typeof COPY)["zh"], string>;

function isLedgerEntries(value: unknown): value is { entries: readonly AgentLedgerEntry[] } {
  if (typeof value !== "object" || value === null) return false;
  const data = value as { entries?: unknown };
  return Array.isArray(data.entries);
}

function StateNote({ state, copy }: { state: AgentPlanDataState; copy: PlanCopy }) {
  if (state === "ready") return null;
  return (
    <div className="agp-card agp-note" data-state={state}>
      {state === "pending" ? copy.statePending : state === "unavailable" ? copy.stateUnavailable : copy.empty}
    </div>
  );
}

export function OrbitAgentPlan({ language }: { language: OrbitLanguage }) {
  const copy: PlanCopy = COPY[language === "zh" ? "zh" : "en"];
  const planLanguage = language === "zh" ? "zh" : "en";
  const [snapshot, setSnapshot] = useState<HomeDashboardSnapshot | "pending" | "unavailable">("pending");
  const [ledger, setLedger] = useState<readonly AgentLedgerEntry[] | "pending" | "unavailable">("pending");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let live = true;
    void import("../home-dashboard-actions")
      .then((mod) => mod.refreshHomeDashboardAction())
      .then((result) => {
        if (live) setSnapshot(result.state === "snapshot" ? result.snapshot : "unavailable");
      })
      .catch(() => {
        if (live) setSnapshot("unavailable");
      });
    return () => {
      live = false;
    };
  }, []);

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
    language: planLanguage,
    ledger,
    snapshot,
  });

  return (
    <main data-orbit-real-page="agent-plan" className="agp-page">
      <style>{PLAN_STYLES}</style>
      <div className="agp-inner">
        <span className="agp-crumb">
          <a href="/app/agent">{copy.breadcrumbHome}</a> / {copy.crumb}
        </span>
        <a className="btn btn-ghost agp-back" href="/app/agent">{copy.backHome}</a>
        <header className="agp-header">
          <div>
            <h1 className="h-display agp-title">{copy.title}</h1>
          </div>
        </header>

        <section className="agp-overview" data-orbit-agent-plan-overview>
          {viewModel.overview.map((count) => (
            <div className="agp-count" key={count.key}>
              <strong>{count.value ?? "—"}</strong>
              <span>{count.label}</span>
            </div>
          ))}
        </section>

        <section className="agp-section" data-orbit-agent-plan-section="focus">
          <div className="agp-section-head">
            <strong className="h-display agp-section-title">{copy.focus}</strong>
            <span className="agp-section-hint">{copy.focusHint}</span>
          </div>
          <StateNote copy={copy} state={viewModel.focusState} />
          {viewModel.focusState === "ready"
            ? viewModel.focusTasks.map((task) => (
                <article className="agp-task" key={task.id}>
                  <div className="agp-task-main">
                    <strong className="agp-task-title">{task.title}</strong>
                    {task.meta ? <span className="agp-task-meta">{task.meta}</span> : null}
                  </div>
                  <span className="agp-task-side">
                    {task.dueLabel ? <span className="agp-task-due">{task.dueLabel}</span> : null}
                    {task.href ? <a className="btn btn-ghost btn-sm" href={task.href}>›</a> : null}
                  </span>
                </article>
              ))
            : null}
        </section>

        <section className="agp-section" data-orbit-agent-plan-section="schedule">
          <div className="agp-section-head">
            <strong className="h-display agp-section-title">{copy.schedule}</strong>
            <span className="agp-section-hint">{copy.scheduleHint}</span>
          </div>
          <StateNote copy={copy} state={viewModel.scheduleState} />
          {viewModel.scheduleState === "ready"
            ? viewModel.schedule.map((item) => (
                <article className="agp-task" key={item.id}>
                  <span className="agp-schedule-when">
                    <strong>{item.dayLabel}</strong>
                    <span>{item.timeLabel}</span>
                  </span>
                  <div className="agp-task-main">
                    <strong className="agp-task-title">{item.title}</strong>
                    {item.meta ? <span className="agp-task-meta">{item.meta}</span> : null}
                  </div>
                  <span className="agp-task-side">
                    <a className="btn btn-ghost btn-sm" href={item.href}>›</a>
                  </span>
                </article>
              ))
            : null}
        </section>

        <a className="btn btn-soft agp-optimize" href="/app/agent">{copy.optimize}</a>
      </div>
    </main>
  );
}

/* Orbit_0918 plan 屏作用域样式：全部走类选择器 + 设计 token，不碰全局。 */
const PLAN_STYLES = `
[data-orbit-real-page="agent-plan"] {
  --ink: #0E1225; --text: #0E1225; --text-2: #3B3F7A; --text-3: #6B6F99; --text-4: #9FA3C4;
  --bg: #FBFBFE; --surface: #FFFFFF; --surface-2: #F7F7FD;
  --border: #E8E9F6; --border-2: #DDDEFA; --accent: #4B4FC7; --accent-soft: #ECEEFB;
  background: var(--bg); color: var(--text); min-height: 100dvh;
}
.agp-inner { margin: 0 auto; max-width: 920px; padding: 24px 24px 96px; display: flex; flex-direction: column; gap: 20px; }
.agp-crumb { font-size: 13px; color: var(--text-4); }
.agp-crumb a { color: var(--text-3); text-decoration: none; }
.agp-back { align-self: flex-start; }
.agp-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.agp-title { margin: 0; font-size: clamp(30px, 3.4vw, 40px); letter-spacing: -0.03em; }
.agp-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.agp-count { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.agp-count strong { font-size: 22px; color: var(--ink); }
.agp-count span { font-size: 13px; color: var(--text-3); }
.agp-section { display: flex; flex-direction: column; gap: 12px; }
.agp-section-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.agp-section-title { font-size: 19px; letter-spacing: -0.02em; }
.agp-section-hint { font-size: 13px; color: var(--text-3); }
.agp-card, .agp-task { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px; }
.agp-note { color: var(--text-3); font-size: 14px; }
.agp-task { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.agp-task-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.agp-task-title { font-size: 15px; font-weight: 500; }
.agp-task-meta { font-size: 13px; color: var(--text-2); }
.agp-task-side { display: flex; align-items: center; gap: 10px; }
.agp-task-due { font-size: 13px; color: var(--text-3); }
.agp-schedule-when { display: flex; flex-direction: column; min-width: 72px; }
.agp-schedule-when strong { font-size: 14px; }
.agp-schedule-when span { font-size: 12px; color: var(--text-3); }
.agp-optimize { align-self: flex-start; }
@media (max-width: 640px) {
  .agp-inner { padding: 18px 16px 72px; }
}
`;
