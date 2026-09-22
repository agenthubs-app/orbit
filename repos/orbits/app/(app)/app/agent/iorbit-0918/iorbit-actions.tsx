/**
 * 建议与行动（Orbit_0918 iOrbit actions 屏，设计 349–426）。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html：
 *   351      面包屑 `iOrbit / 建议与行动`
 *   353–356  「← 返回概览」+ H1 + 副标题
 *   358      两列栅格 minmax(0,2.4fr) / minmax(260px,1fr)
 *   360–372  需要你决定（border-left #B5473A）
 *   373–389  建议今天做（border-left #4B4FC7）
 *   390–403  可以稍后处理（border-left #9FA3C4）
 *   406–419  aside「今天的重点」三行计数 + conic-gradient 进度环
 *   420–423  语录卡
 *
 * 数据 = `actions-route-view-model.ts` 的账本三档（本任务不碰数据层）。
 * 设计的 2/3/2 计数、14%、1 / 7 项已完成、人名一概不用（「审阅修订」20）：
 * 三段计数与进度环全部来自账本真实条目。
 *
 * 写能力不得丢（「审阅修订」10）：
 *   需要你决定 → `OrbitTodayDecisionForm`（确认 / 稍后 / 忽略，与 Today 同一写入口）
 *   其余两档   → `OrbitAllActionsControls`（撤销 / 重试 / 取消执行）
 * 设计每行只画了一枚文案各不相同的 CTA；这里把它落成「真实写控件 + 一条按
 * 操作类型变化的 `查看… ›` 链接」（链接进 `?entry=`，与既有展开参数同一个）。
 */
"use client";

import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { OrbitAllActionsControls } from "../actions/orbit-all-actions-controls";
import { OrbitTodayDecisionForm } from "../../today/orbit-today-decision-form";
import type {
  AgentActionsRouteViewModel,
  AgentActionsTierKey,
} from "../actions/actions-route-view-model";
import { IOrbitScreenFrame } from "./iorbit-screen-frame";

/** 设计 360/373/390 的三档：左边框、图标底色、图标字色、字形。 */
const TIER_SKIN: Record<
  AgentActionsTierKey,
  { glyph: string; iconBg: string; iconFg: string; rail: string }
> = {
  decide: { glyph: "!", iconBg: "#FBECEA", iconFg: "#B5473A", rail: "#B5473A" },
  later: { glyph: "◷", iconBg: "#F1F1FA", iconFg: "#6B6F99", rail: "#9FA3C4" },
  today: { glyph: "⚡", iconBg: "#ECEEFB", iconFg: "#4B4FC7", rail: "#4B4FC7" },
};

/**
 * 行的字形与 CTA 文案都按**真实 operationType** 取（设计每行不同，但设计的
 * 那几行是 mock 场景）。未知类型回落到「查看详情 ›」，不编内容。
 */
const OPERATION_SKIN: Record<
  string,
  { cta: { en: string; zh: string }; glyph: string }
> = {
  accept_intro_request: { cta: { en: "View intro ›", zh: "查看引荐 ›" }, glyph: "⚇" },
  add_to_orbit_schedule: { cta: { en: "View schedule ›", zh: "查看日程 ›" }, glyph: "▦" },
  archive_contacts: { cta: { en: "View contacts ›", zh: "查看联系人 ›" }, glyph: "⚇" },
  create_followup_reminder: { cta: { en: "View reminder ›", zh: "查看提醒 ›" }, glyph: "◷" },
  create_followup_task: { cta: { en: "View task ›", zh: "查看任务 ›" }, glyph: "▤" },
  create_intro_request: { cta: { en: "View intro ›", zh: "查看引荐 ›" }, glyph: "⚇" },
  create_preparation_task: { cta: { en: "View task ›", zh: "查看任务 ›" }, glyph: "▤" },
  generate_meeting_brief: { cta: { en: "View brief ›", zh: "查看简报 ›" }, glyph: "▥" },
  propose_meeting_slots: { cta: { en: "View slots ›", zh: "查看时间 ›" }, glyph: "▦" },
  save_event_goal: { cta: { en: "View goal ›", zh: "查看目标 ›" }, glyph: "◎" },
  save_meeting_note: { cta: { en: "View note ›", zh: "查看纪要 ›" }, glyph: "▥" },
  save_memory: { cta: { en: "View memory ›", zh: "查看记忆 ›" }, glyph: "✦" },
  save_message_draft: { cta: { en: "View draft ›", zh: "查看草稿 ›" }, glyph: "✉" },
  sync_event_to_calendar: { cta: { en: "View schedule ›", zh: "查看日程 ›" }, glyph: "▦" },
};

/** 旧屏（`orbit-agent-actions.tsx`）的本地化状态标签，逐字保留。 */
const STATUS_LABELS: Record<string, { en: string; zh: string }> = {
  approved: { en: "Confirmed", zh: "已确认" },
  awaiting_confirmation: { en: "Awaiting confirmation", zh: "等待确认" },
  deferred: { en: "Deferred", zh: "稍后处理" },
  executing: { en: "Executing", zh: "正在执行" },
};

const ENTRY_TITLE_LABELS: Record<string, string> = {
  "Save to Agent Memory": "保存到智能记忆",
  "保存到 Agent Memory": "保存到智能记忆",
};

function operationSkin(entry: AgentLedgerEntry) {
  const type = entry.operations[0]?.operationType;
  return (
    (type ? OPERATION_SKIN[type] : undefined) ?? {
      cta: { en: "View details ›", zh: "查看详情 ›" },
      glyph: "▤",
    }
  );
}

export interface IOrbitActionsProps {
  viewModel: AgentActionsRouteViewModel;
}

export function IOrbitActions({ viewModel }: IOrbitActionsProps) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";

  const tierCopy: Record<AgentActionsTierKey, string> = {
    decide: t({ en: "Needs your decision", zh: "需要你决定" }),
    later: t({ en: "Can wait", zh: "可以稍后处理" }),
    today: t({ en: "Do today", zh: "建议今天做" }),
  };
  const countLabel = (value: number) =>
    zh ? `${value} 项` : `${value} item${value === 1 ? "" : "s"}`;

  const tiers = viewModel.state === "success" ? viewModel.tiers : [];
  const done = viewModel.completedToday;
  const total = viewModel.todaysTotal;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const countByTier = (key: AgentActionsTierKey) =>
    tiers.find((tier) => tier.key === key)?.entries.length ?? 0;

  return (
    <IOrbitScreenFrame
      ready
      screenTitle={t({ en: "Suggested actions", zh: "建议与行动" })}
    >
      <div className="ir-screen">
        {/* 351 */}
        <span className="ir-crumb">
          <a href="/app/agent">iOrbit</a> / {t({ en: "Suggested actions", zh: "建议与行动" })}
        </span>

        {/* 353–356 */}
        <div className="ir-title-col">
          <a className="ir-back" href="/app/agent">
            {t({ en: "← Back to overview", zh: "← 返回概览" })}
          </a>
          <h2 className="ir-h1-sub">{t({ en: "Suggested actions", zh: "建议与行动" })}</h2>
          <p className="ir-lede">
            {t({
              en: "Today's work, sorted by what deserves your attention first.",
              zh: "把今天最值得处理的事情，按优先顺序整理给你。",
            })}
          </p>
        </div>

        {/* 358 */}
        <div className="ir-two-col">
          <div className="ir-col-main">
            {viewModel.state === "failure" ? (
              <section className="ir-panel" role="alert">
                <strong className="ir-panel-h">
                  {t({
                    en: "The action ledger is temporarily unavailable.",
                    zh: "操作账本暂时不可用。",
                  })}
                </strong>
                <span className="ir-panel-note">{viewModel.failureMessage}</span>
                <a className="ir-row-cta" href="/app/agent/actions">
                  {t({ en: "Reload ›", zh: "重新加载 ›" })}
                </a>
              </section>
            ) : null}

            {viewModel.state === "empty" ? (
              <section className="ir-panel">
                <span className="ir-panel-note">
                  {t({
                    en: "Nothing needs you right now — Orbit is watching the rest.",
                    zh: "当前没有待你处理的事——其余的 Orbit 都盯着。",
                  })}
                </span>
              </section>
            ) : null}

            {tiers.map((tier) => {
              const skin = TIER_SKIN[tier.key];
              return (
                <section
                  className="ir-tier"
                  data-orbit-agent-actions-tier={tier.key}
                  key={tier.key}
                  style={{ borderLeftColor: skin.rail }}
                >
                  <div className="ir-tier-head">
                    <span className="ir-tier-label">
                      <span
                        className="ir-tier-icon"
                        style={{ background: skin.iconBg, color: skin.iconFg }}
                      >
                        {skin.glyph}
                      </span>
                      <strong className="ir-tier-h">{tierCopy[tier.key]}</strong>
                    </span>
                    <span className="ir-tier-count">{countLabel(tier.entries.length)}</span>
                  </div>
                  {tier.entries.length === 0 ? (
                    <span className="ir-panel-note">
                      {t({ en: "Nothing in this tier.", zh: "这一档现在是空的。" })}
                    </span>
                  ) : null}
                  {tier.entries.map((entry) => {
                    const skinForEntry = operationSkin(entry);
                    const expanded = viewModel.selectedEntryId === entry.entryId;
                    const status = STATUS_LABELS[entry.status];
                    return (
                      <div
                        className={expanded ? "ir-row ir-row-open" : "ir-row"}
                        data-orbit-agent-action-entry={entry.entryId}
                        key={entry.entryId}
                      >
                        <span
                          className="ir-row-icon"
                          style={{ background: skin.iconBg, color: skin.iconFg }}
                        >
                          {skinForEntry.glyph}
                        </span>
                        <span className="ir-row-copy">
                          <strong className="ir-row-title">
                            {ENTRY_TITLE_LABELS[entry.title] ?? entry.title}
                          </strong>
                          <span className="ir-row-desc">
                            {[entry.contactName, entry.organization]
                              .filter(Boolean)
                              .join(" · ") || entry.whyNow}
                          </span>
                          {entry.contactName && entry.whyNow ? (
                            <span className="ir-row-desc">{entry.whyNow}</span>
                          ) : null}
                          {/* 修订轮 1：被删旧屏渲染过的三样都回来了——状态标签、
                              证据 chips（「处处有据」，设计无槽位 → 记偏差）、
                              preview（展开态里）。 */}
                          {status ? (
                            <span className="ir-row-status">{zh ? status.zh : status.en}</span>
                          ) : null}
                          {entry.evidenceChips.length > 0 ? (
                            <span className="ir-chips-inline" data-orbit-agent-action-evidence>
                              {entry.evidenceChips.map((chip) => (
                                <span className="ir-pill-grey" key={chip.evidenceId}>
                                  {chip.label}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {expanded ? (
                            <span className="ir-row-preview" data-orbit-agent-action-preview>
                              {entry.preview ??
                                t({
                                  en: "This action has no preview text.",
                                  zh: "这条动作没有预览内容。",
                                })}
                            </span>
                          ) : null}
                        </span>
                        <span className="ir-row-actions">
                          {entry.status === "awaiting_confirmation" ? (
                            <OrbitTodayDecisionForm
                              entryId={entry.entryId}
                              operations={entry.operations}
                              status={entry.status}
                            />
                          ) : (
                            <OrbitAllActionsControls
                              canCancel={
                                entry.status === "approved" || entry.status === "executing"
                              }
                              canRetry={
                                entry.status === "failed" ||
                                entry.status === "partially_failed"
                              }
                              canUndo={entry.undoable}
                              entryId={entry.entryId}
                            />
                          )}
                          {/* 修订轮 1：这枚 CTA 原来把每一行都指向同一个页面、什么也不发生
                              （`selectedEntryId` 解析了却没人渲染）——假可点。现在它**就是**
                              展开控件：点开显示这一行的 preview 与完整证据，再点收起。
                              文案仍按真实 operationType 变化（设计 362–402 每行不同）。 */}
                          <a
                            aria-expanded={expanded}
                            className="ir-row-cta"
                            data-orbit-agent-action-expand={entry.entryId}
                            href={
                              expanded
                                ? "/app/agent/actions"
                                : `/app/agent/actions?entry=${encodeURIComponent(entry.entryId)}`
                            }
                          >
                            {expanded ? t({ en: "Collapse ›", zh: "收起 ›" }) : t(skinForEntry.cta)}
                          </a>
                        </span>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>

          {/* 406–423 */}
          <aside className="ir-aside">
            <div className="ir-panel ir-panel-16">
              <span className="ir-aside-title">
                <span className="ir-aside-icon">◎</span>
                <strong className="ir-aside-h">
                  {t({ en: "Today's focus", zh: "今天的重点" })}
                </strong>
              </span>
              {(["decide", "today", "later"] as const).map((key) => (
                <span className="ir-stat-row" key={key}>
                  <span className="ir-stat-label">
                    <span
                      className="ir-stat-dot"
                      style={{ background: TIER_SKIN[key].rail }}
                    />
                    {tierCopy[key]}
                  </span>
                  <strong className="ir-stat-value">{countByTier(key)}</strong>
                </span>
              ))}
              <div className="ir-ring-row">
                <span
                  className="ir-ring"
                  style={{
                    background: `conic-gradient(#4B4FC7 0 ${percent}%, #ECEEFB ${percent}% 100%)`,
                  }}
                >
                  <span className="ir-ring-hole">{total > 0 ? `${percent}%` : "—"}</span>
                </span>
                <span className="ir-ring-copy">
                  <strong className="ir-ring-title">
                    {t({ en: "Today's progress", zh: "今日进度" })}
                  </strong>
                  <span className="ir-ring-sub">
                    {total > 0
                      ? zh
                        ? `${done} / ${total} 项已完成`
                        : `${done} of ${total} done`
                      : t({ en: "Nothing tracked yet.", zh: "还没有可统计的条目。" })}
                  </span>
                  <span className="ir-ring-hint">
                    {t({
                      en: "Start with the first one and today moves forward.",
                      zh: "从第一项开始，让今天更进一步。",
                    })}
                  </span>
                </span>
              </div>
            </div>
            <div className="ir-quote">
              <span className="ir-quote-icon">✦</span>
              <span className="ir-quote-text">
                {t({
                  en: "Focusing on what matters makes every day more valuable.",
                  zh: "专注于重要的事情，会让每一天都更有价值。",
                })}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </IOrbitScreenFrame>
  );
}
