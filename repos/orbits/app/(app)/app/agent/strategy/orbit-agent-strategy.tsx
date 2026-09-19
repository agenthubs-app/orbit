/**
 * 工作策略（Orbit_0918 iOrbit strategy 屏）主界面（client component）。
 *
 * 数据 = 已交付既有通道的静态聚合（见 strategy-route-view-model.ts）：
 * facts 快照（followups.current + D17 推荐）经 refreshHomeDashboardAction
 * （use server），运行时动态 import + window 守卫：SSR/测试零副作用。
 * 「缺什么人 / 准备什么」无接口 → 显式「等 W4」空态，不放 mock。
 */
"use client";

import { useEffect, useState } from "react";

import type { OrbitLanguage } from "../../orbit-language-core";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import {
  buildAgentStrategyViewModel,
  type AgentStrategyDataState,
  type AgentStrategyNextEventsState,
  type AgentStrategyViewModel,
} from "./strategy-route-view-model";

const COPY = {
  en: {
    backHome: "← Back to iOrbit",
    breadcrumbHome: "iOrbit",
    crumb: "Strategy",
    empty: "Nothing here right now.",
    needsGoal: "Set your relationship goal in Profile, and iOrbit will recommend events that match it.",
    nextEvents: "Where to go next",
    nextEventsHint: "Public events matching your goal (lexical match, top three).",
    noMatch: "No public events currently match your goal.",
    statePending: "Loading…",
    stateUnavailable: "This source is temporarily unavailable.",
    title: "Strategy",
    waitingBadge: "Coming with the W4 strategy capability",
    whoFirst: "Who to contact first",
    whoFirstHint: "Based on your existing relationships.",
  },
  zh: {
    backHome: "← 返回概览",
    breadcrumbHome: "iOrbit",
    crumb: "工作策略",
    empty: "当前没有内容。",
    needsGoal: "在「个人中心」填写你的目标后，iOrbit 会按目标为你推荐活动。",
    nextEvents: "下一步去哪",
    nextEventsHint: "按你的目标匹配的公开活动（词法匹配，前三）。",
    noMatch: "当前没有匹配你目标的公开活动。",
    statePending: "加载中…",
    stateUnavailable: "来源暂时不可用。",
    title: "工作策略",
    waitingBadge: "随 W4 策略能力上线",
    whoFirst: "先联系谁",
    whoFirstHint: "基于你现有的关系。",
  },
} as const;

type StrategyCopy = Record<keyof (typeof COPY)["zh"], string>;

function WhoFirstNote({
  copy,
  state,
}: {
  copy: StrategyCopy;
  state: AgentStrategyDataState;
}) {
  if (state === "ready") return null;
  return (
    <div className="ags-card ags-note" data-state={state}>
      {state === "pending" ? copy.statePending : state === "unavailable" ? copy.stateUnavailable : copy.empty}
    </div>
  );
}

function NextEventsNote({
  copy,
  state,
}: {
  copy: StrategyCopy;
  state: AgentStrategyNextEventsState;
}) {
  if (state === "ready") return null;
  return (
    <div className="ags-card ags-note" data-state={state}>
      {state === "pending"
        ? copy.statePending
        : state === "unavailable"
          ? copy.stateUnavailable
          : state === "needs_goal"
            ? copy.needsGoal
            : copy.noMatch}
    </div>
  );
}

export function OrbitAgentStrategy({ language }: { language: OrbitLanguage }) {
  const copy: StrategyCopy = COPY[language === "zh" ? "zh" : "en"];
  const [snapshot, setSnapshot] = useState<HomeDashboardSnapshot | "pending" | "unavailable">("pending");

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

  const viewModel: AgentStrategyViewModel = buildAgentStrategyViewModel({
    language: language === "zh" ? "zh" : "en",
    snapshot,
  });

  return (
    <main data-orbit-real-page="agent-strategy" className="ags-page">
      <style>{STRATEGY_STYLES}</style>
      <div className="ags-inner">
        <span className="ags-crumb">
          <a href="/app/agent">{copy.breadcrumbHome}</a> / {copy.crumb}
        </span>
        <a className="btn btn-ghost ags-back" href="/app/agent">{copy.backHome}</a>
        <header className="ags-header">
          <div>
            <h1 className="h-display ags-title">{copy.title}</h1>
          </div>
        </header>

        <section className="ags-section" data-orbit-agent-strategy-section="who-first">
          <div className="ags-section-head">
            <strong className="h-display ags-section-title">{copy.whoFirst}</strong>
            <span className="ags-section-hint">{copy.whoFirstHint}</span>
          </div>
          <WhoFirstNote copy={copy} state={viewModel.whoFirstState} />
          {viewModel.whoFirstState === "ready"
            ? viewModel.whoFirst.map((contact) => (
                <article className="ags-contact" key={contact.id}>
                  <span className="ags-avatar" aria-hidden>{contact.name.slice(0, 1)}</span>
                  <div className="ags-contact-main">
                    <strong className="ags-contact-name">{contact.name}</strong>
                    {contact.meta ? <span className="ags-contact-meta">{contact.meta}</span> : null}
                    {contact.issue ? <span className="ags-contact-issue">{contact.issue}</span> : null}
                  </div>
                  <span className="ags-contact-side">
                    {contact.dueLabel ? <span className="ags-contact-due">{contact.dueLabel}</span> : null}
                    {contact.href ? <a className="btn btn-ghost btn-sm" href={contact.href}>›</a> : null}
                  </span>
                </article>
              ))
            : null}
        </section>

        {viewModel.waitingSections.map((section) => (
          <section
            className="ags-card ags-waiting"
            data-orbit-agent-strategy-section={section.key}
            key={section.key}
          >
            <strong className="h-display ags-section-title">{section.title}</strong>
            <span className="ags-waiting-desc">{section.description}</span>
            <span className="ags-waiting-badge">{copy.waitingBadge}</span>
          </section>
        ))}

        <section className="ags-section" data-orbit-agent-strategy-section="next-events">
          <div className="ags-section-head">
            <strong className="h-display ags-section-title">{copy.nextEvents}</strong>
            <span className="ags-section-hint">{copy.nextEventsHint}</span>
          </div>
          <NextEventsNote copy={copy} state={viewModel.nextEventsState} />
          {viewModel.nextEventsState === "ready"
            ? viewModel.nextEvents.map((event) => (
                <article className="ags-event" key={event.id}>
                  <span className="ags-event-when">{event.dayLabel}</span>
                  <div className="ags-event-main">
                    <strong className="ags-event-title">{event.title}</strong>
                    <span className="ags-event-venue">{event.venue}</span>
                    {event.matchedTokens.length > 0 ? (
                      <span className="ags-event-tokens">
                        {event.matchedTokens.map((token) => (
                          <span className="ags-token" key={token}>{token}</span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <span className="ags-event-side">
                    <a className="btn btn-ghost btn-sm" href={event.href}>›</a>
                  </span>
                </article>
              ))
            : null}
        </section>
      </div>
    </main>
  );
}

/* Orbit_0918 strategy 屏作用域样式：全部走类选择器 + 设计 token，不碰全局。 */
const STRATEGY_STYLES = `
[data-orbit-real-page="agent-strategy"] {
  --ink: #0E1225; --text: #0E1225; --text-2: #3B3F7A; --text-3: #6B6F99; --text-4: #9FA3C4;
  --bg: #FBFBFE; --surface: #FFFFFF; --surface-2: #F7F7FD;
  --border: #E8E9F6; --border-2: #DDDEFA; --accent: #4B4FC7; --accent-soft: #ECEEFB;
  background: var(--bg); color: var(--text); min-height: 100dvh;
}
.ags-inner { margin: 0 auto; max-width: 920px; padding: 24px 24px 96px; display: flex; flex-direction: column; gap: 20px; }
.ags-crumb { font-size: 13px; color: var(--text-4); }
.ags-crumb a { color: var(--text-3); text-decoration: none; }
.ags-back { align-self: flex-start; }
.ags-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.ags-title { margin: 0; font-size: clamp(30px, 3.4vw, 40px); letter-spacing: -0.03em; }
.ags-section { display: flex; flex-direction: column; gap: 12px; }
.ags-section-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ags-section-title { font-size: 19px; letter-spacing: -0.02em; }
.ags-section-hint { font-size: 13px; color: var(--text-3); }
.ags-card, .ags-contact, .ags-event { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px; }
.ags-note { color: var(--text-3); font-size: 14px; }
.ags-contact, .ags-event { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.ags-avatar { width: 40px; height: 40px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; flex: none; }
.ags-contact-main, .ags-event-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ags-contact-name { font-size: 15px; font-weight: 500; }
.ags-contact-meta, .ags-event-venue { font-size: 13px; color: var(--text-2); }
.ags-contact-issue { font-size: 13px; color: var(--text-3); }
.ags-contact-side, .ags-event-side { display: flex; align-items: center; gap: 10px; }
.ags-contact-due { font-size: 13px; color: var(--text-3); }
.ags-waiting { display: flex; flex-direction: column; gap: 6px; border-style: dashed; }
.ags-waiting-desc { font-size: 13px; color: var(--text-3); line-height: 1.7; }
.ags-waiting-badge { font-size: 12px; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; align-self: flex-start; }
.ags-event-when { min-width: 56px; font-size: 14px; font-weight: 600; }
.ags-event-title { font-size: 15px; font-weight: 500; }
.ags-event-tokens { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.ags-token { font-size: 12px; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; }
@media (max-width: 640px) {
  .ags-inner { padding: 18px 16px 72px; }
}
`;
