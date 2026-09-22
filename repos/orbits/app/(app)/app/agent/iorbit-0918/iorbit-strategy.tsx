/**
 * 工作策略 + 联系人建议（Orbit_0918 iOrbit strategy / contacts 两屏）。
 *
 * 「审阅修订」3：设计的 contacts 屏（663–782）**不是**并进 strategy，而是
 * `/app/agent/strategy?view=contacts`——两屏的面包屑（505 `iOrbit / 对话 / 工作策略`
 * vs 665 `iOrbit / 对话 / 联系人建议`）、H1、内容块都不同，合并会丢 开场白（704–705）
 * 与 相关活动（769–781）。本文件按 `view` 渲染其中一屏，共用同一份数据与皮肤。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html：
 *   strategy 505 面包屑 / 506–513 页头（H1 + ◷ 历史记录 + ← 返回对话）/
 *            515–530 问答回显 / 533–564 先联系谁 / 566–589 你还缺什么人 /
 *            591–619 聊之前准备什么 / 621–639 下一步去哪 / 641–654 本周建议 /
 *            656–659 底部两枚药丸
 *   contacts 665 面包屑 / 666–675 页头 / 677–684 问答回显 /
 *            686–743 先联系这 2 个人（含 开场白 704–705）/ 745–758 你还缺这样的人 /
 *            760–768 聊之前准备这 3 件事 / 769–781 相关活动
 *
 * 数据 = `strategy-route-view-model.ts`（本任务不碰数据层）：
 *   先联系谁 / 先联系这 2 个人 = facts 的 followups.current（真实联系人机会）
 *   下一步去哪 / 相关活动     = D17 公开活动目标词法推荐
 * 没有来源的三处沿用既有「等 W4」卡，不伪造（「审阅修订」20）：
 *   你还缺什么人 / 聊之前准备什么（strategy 与 contacts 两屏同一能力）
 *   建议开场白（704–705）
 * 「他能提供什么」（699）同样没有任何服务端字段承载——`HomeFactsFollowupItem`
 * 只有 contactName / organization / issue / title / relationshipStage —— 一并走
 * 「等 W4」，宁可少说也不编（见报告偏差表）。
 *
 * 设计的 mock（田中圭子 / 山本健一 / Google · 产品负责人 / 日本智能制造峰会 2026 /
 * 东京 AI 创业者交流会 / 「我想推进日本制造业 AI 合作，该怎么开展？」）一概不用。
 * 515–530 与 677–684 的问答回显在这两条路由上没有会话上下文（壳的聊天 hook 不在
 * 这里）→ 整块省略，记偏差。
 */
"use client";

import { useEffect, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import {
  buildAgentStrategyViewModel,
  type AgentStrategyNextEventsState,
  type AgentStrategyViewModel,
} from "../strategy/strategy-route-view-model";
import type { IOrbitStrategyView } from "./iorbit-model";
import { IOrbitScreenFrame } from "./iorbit-screen-frame";

type Loadable<T> = T | "pending" | "unavailable";

export interface IOrbitStrategyProps {
  /** 覆盖点，仅测试使用：默认动态 import `home-dashboard-actions`（server action）。 */
  loadSnapshot?: () => Promise<Loadable<HomeDashboardSnapshot>>;
  view?: IOrbitStrategyView;
}

export function IOrbitStrategy({ loadSnapshot, view = "strategy" }: IOrbitStrategyProps = {}) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";
  const [snapshot, setSnapshot] = useState<Loadable<HomeDashboardSnapshot>>("pending");

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

  const viewModel: AgentStrategyViewModel = buildAgentStrategyViewModel({
    language: zh ? "zh" : "en",
    snapshot,
  });
  const ready = snapshot !== "pending";

  // 修订轮 1：说明文案由 view model 提供（`strategy-route-view-model.ts` 的
  // `waitingSections[].description`），不再在这里留第二份会漂移的拷贝。
  const waitingDescription = (key: "missing" | "prep") =>
    viewModel.waitingSections.find((section) => section.key === key)?.description ?? "";
  const waitingBadge = t({
    en: "Coming with the W4 strategy capability",
    zh: "随 W4 策略能力上线",
  });

  const whoFirstNote =
    viewModel.whoFirstState === "pending"
      ? t({ en: "Loading…", zh: "加载中…" })
      : viewModel.whoFirstState === "unavailable"
        ? t({ en: "This source is temporarily unavailable.", zh: "来源暂时不可用。" })
        : t({
            en: "No relationship opportunities are waiting right now.",
            zh: "当前没有待推进的联系人机会。",
          });

  const eventsNote = (state: AgentStrategyNextEventsState) =>
    state === "pending"
      ? t({ en: "Loading…", zh: "加载中…" })
      : state === "unavailable"
        ? t({ en: "This source is temporarily unavailable.", zh: "来源暂时不可用。" })
        : state === "needs_goal"
          ? t({
              en: "Set your relationship goal in Profile, and iOrbit will recommend events that match it.",
              zh: "在「个人中心」填写你的目标后，iOrbit 会按目标为你推荐活动。",
            })
          : t({
              en: "No public events currently match your goal.",
              zh: "当前没有匹配你目标的公开活动。",
            });

  const historyHref = "/app/agent?history=1";

  /* ── 先联系谁（strategy 533–564 的紧凑列表） ────────────────────────── */
  const whoFirstCompact = (
    <section className="ir-panel ir-panel-16" data-orbit-agent-strategy-section="who-first">
      <div className="ir-num-head">
        <span className="ir-num">1</span>
        <strong className="ir-sec-h">{t({ en: "Who to contact first", zh: "先联系谁" })}</strong>
        <span className="ir-sec-hint">
          {viewModel.whoFirstState === "ready"
            ? zh
              ? `基于你现有的 CRM 关系，这 ${viewModel.whoFirst.length} 位联系人最适合先开展沟通。`
              : `Based on your existing relationships, these ${viewModel.whoFirst.length} are the best to start with.`
            : t({ en: "Based on your existing relationships.", zh: "基于你现有的关系。" })}
        </span>
        <a className="ir-sec-link" href="/app/agent/strategy?view=contacts">
          {t({ en: "See all contacts →", zh: "查看全部联系人 →" })}
        </a>
      </div>
      {viewModel.whoFirstState === "ready" ? (
        <div className="ir-cards-420">
          {viewModel.whoFirst.map((contact) => (
            <a
              className="ir-contact-compact"
              href={contact.href ?? "/app/agent/strategy?view=contacts"}
              key={contact.id}
            >
              <span className="ir-contact-id">
                <span className="ir-contact-head">
                  <span className="ir-avatar-38">{contact.name.slice(0, 1)}</span>
                  <span className="ir-contact-name-col">
                    <strong className="ir-contact-name">{contact.name}</strong>
                    {contact.meta ? (
                      <span className="ir-contact-meta">{contact.meta}</span>
                    ) : null}
                  </span>
                </span>
                <span className="ir-chips-inline">
                  <span className="ir-pill-green">
                    {t({ en: "Already connected", zh: "已有联系" })}
                  </span>
                  {contact.dueLabel ? (
                    <span className="ir-pill-grey">
                      {zh ? `跟进到期 ${contact.dueLabel}` : `Due ${contact.dueLabel}`}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="ir-contact-why">
                <strong className="ir-contact-why-h">
                  {t({ en: "Why contact them", zh: "为什么联系他" })}
                </strong>
                <span className="ir-contact-why-body">
                  {contact.issue ??
                    t({
                      en: "This follow-up is open in your relationship queue.",
                      zh: "这条关系跟进还在你的队列里等待推进。",
                    })}
                </span>
              </span>
              <span className="ir-caret-mid">›</span>
            </a>
          ))}
        </div>
      ) : (
        <span className="ir-panel-note" data-state={viewModel.whoFirstState}>
          {whoFirstNote}
        </span>
      )}
    </section>
  );

  /* ── 等 W4 的两段（strategy 566–619 / contacts 745–768） ───────────── */
  const waitingSection = (
    key: "missing" | "prep",
    no: string,
    title: string,
    hint: string,
  ) => (
    <section
      className="ir-panel ir-panel-16 ir-waiting"
      data-orbit-agent-strategy-section={key}
      key={key}
    >
      <div className="ir-num-head">
        <span className="ir-num">{no}</span>
        <strong className="ir-sec-h">{title}</strong>
        <span className="ir-sec-hint">{hint}</span>
      </div>
      <span className="ir-panel-note">{waitingDescription(key)}</span>
      <span className="ir-waiting-badge">{waitingBadge}</span>
    </section>
  );

  /* ── 活动列表（strategy 621–639 的「下一步去哪」/ contacts 769–781 的「相关活动」）── */
  const eventList = (variant: "cover" | "plain") => (
    <div className="ir-event-list">
      {viewModel.nextEvents.map((event) => (
        <a className="ir-event-row" href={event.href} key={event.id}>
          {/* 设计 623 的 96px 封面占位块：只有「下一步去哪」那一行有，
              「相关活动」（771）没有。封面图无来源 → 保留设计自己的纯色块。 */}
          {variant === "cover" ? <span className="ir-event-cover" /> : null}
          <span className="ir-sec-event-date">{event.dayLabel}</span>
          <span className="ir-row-copy">
            <strong className="ir-row-title">{event.title}</strong>
            <span className="ir-row-desc">◎ {event.venue}</span>
            {event.matchedTokens.length > 0 ? (
              <span className="ir-chips-inline">
                {event.matchedTokens.map((token) => (
                  <span className="ir-pill-grey" key={token}>
                    {token}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          <span className="ir-caret">›</span>
        </a>
      ))}
    </div>
  );

  if (view === "contacts") {
    return (
      <IOrbitScreenFrame
        ready={ready}
        screenTitle={t({ en: "Who to contact first", zh: "先联系谁" })}
      >
        <div className="ir-screen" data-orbit-iorbit-screen="contacts">
          {/* 665 */}
          <span className="ir-crumb">
            <a href="/app/agent">iOrbit</a> / <a href="/app/agent">{t({ en: "Chat", zh: "对话" })}</a> /{" "}
            {t({ en: "Contact suggestions", zh: "联系人建议" })}
          </span>

          {/* 666–675 */}
          <div className="ir-head-split">
            <div className="ir-title-col-8">
              <h2 className="ir-h1-sub">
                {t({ en: "Who to contact first", zh: "先联系谁" })}
              </h2>
              <p className="ir-lede">
                {t({
                  en: "From your question and your existing network, here are the people worth reaching out to first.",
                  zh: "基于你的问题和现有人脉，我为你找到了最值得先联系的人选。",
                })}
              </p>
            </div>
            <span className="ir-head-actions">
              <a className="ir-head-btn" href={historyHref}>
                {t({ en: "◷ History", zh: "◷ 历史记录" })}
              </a>
              <a className="ir-head-btn ir-head-btn-soft" href="/app/agent/strategy">
                {t({ en: "Back to the answer →", zh: "返回对话 →" })}
              </a>
            </span>
          </div>

          {/* 686–743 */}
          <section
            className="ir-panel ir-panel-18"
            data-orbit-agent-strategy-section="contact-cards"
          >
            <div className="ir-icon-head">
              <span className="ir-tier-icon ir-tint-accent">⚇</span>
              <span className="ir-icon-head-copy">
                <strong className="ir-sec-h">
                  {viewModel.whoFirstState === "ready" && zh
                    ? `1. 先联系这 ${viewModel.whoFirst.length} 个人`
                    : t({ en: "1. Start with these people", zh: "1. 先联系这些人" })}
                </strong>
                <span className="ir-sec-hint">
                  {t({
                    en: "Based on your current goal and existing relationships, these are worth a first move.",
                    zh: "基于你当前的业务目标和现有人脉，这些联系人最值得优先联系。",
                  })}
                </span>
              </span>
            </div>
            {viewModel.whoFirstState === "ready" ? (
              <div className="ir-cards-420">
                {viewModel.whoFirst.map((contact) => (
                  <div className="ir-contact-card" key={contact.id}>
                    <div className="ir-contact-card-head">
                      <span className="ir-avatar-52">{contact.name.slice(0, 1)}</span>
                      <span className="ir-contact-name-col">
                        <strong className="ir-contact-name-lg">{contact.name}</strong>
                        {contact.meta ? (
                          <span className="ir-contact-meta">{contact.meta}</span>
                        ) : null}
                      </span>
                      <span className="ir-pill-accent">
                        {t({ en: "In your network", zh: "现有人脉" })}
                      </span>
                    </div>
                    <div className="ir-contact-grid">
                      <span className="ir-contact-key">
                        <span className="ir-contact-key-icon">⚡</span>
                        {t({ en: "Why now", zh: "为什么现在联系" })}
                      </span>
                      <span className="ir-contact-val">
                        {contact.issue ??
                          t({
                            en: "This follow-up is open in your relationship queue.",
                            zh: "这条关系跟进还在你的队列里等待推进。",
                          })}
                      </span>
                      <span className="ir-contact-key">
                        <span className="ir-contact-key-icon">▤</span>
                        {t({ en: "What they can offer", zh: "他能提供什么" })}
                      </span>
                      <span className="ir-contact-val ir-contact-waiting">
                        {waitingDescription("missing")}
                      </span>
                      <span className="ir-contact-key">
                        <span className="ir-contact-key-icon">▥</span>
                        {t({ en: "Suggested opener", zh: "建议开场白" })}
                      </span>
                      <span className="ir-contact-opener ir-contact-waiting">
                        {waitingDescription("prep")}
                      </span>
                    </div>
                    <div className="ir-contact-actions">
                      <a
                        className="ir-contact-action"
                        href={contact.href ?? "/app/contacts"}
                      >
                        {t({ en: "⚇ View contact", zh: "⚇ 查看联系人" })}
                      </a>
                      <a
                        className="ir-contact-action ir-contact-action-primary"
                        data-orbit-iorbit-contact-prepare={contact.id}
                        href={`/app/agent?q=${encodeURIComponent(
                          zh
                            ? `帮我准备联系${contact.name}的内容`
                            : `Help me prepare what to say to ${contact.name}`,
                        )}`}
                      >
                        {t({ en: "✎ Help me prepare", zh: "✎ 帮我准备联系内容" })}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="ir-panel-note" data-state={viewModel.whoFirstState}>
                {whoFirstNote}
              </span>
            )}
          </section>

          {/* 745–758 */}
          {waitingSection(
            "missing",
            "2",
            t({ en: "2. Who you are still missing", zh: "2. 你还缺这样的人" }),
            t({
              en: "To move your goal forward, these are the kinds of people worth adding.",
              zh: "为了更全面地推进你的目标，建议你补充以下类型的联系人。",
            }),
          )}

          {/* 760–768 */}
          {waitingSection(
            "prep",
            "3",
            t({ en: "3. Prepare these three things", zh: "3. 聊之前，准备这 3 件事" }),
            t({
              en: "Preparation makes the conversation sharper and the reply more likely.",
              zh: "充分的准备能让对话更高效，也更容易获得积极的回应。",
            }),
          )}

          {/* 769–781 */}
          <section
            className="ir-panel ir-panel-16"
            data-orbit-agent-strategy-section="related-events"
          >
            <div className="ir-num-head">
              <span className="ir-tier-icon ir-tint-accent">▦</span>
              <strong className="ir-sec-h">
                {t({ en: "Related events", zh: "相关活动" })}
              </strong>
              <span className="ir-sec-hint">
                {t({
                  en: "Events are the fastest way to meet the people you are missing.",
                  zh: "参加相关活动，能更高效地结识这些潜在联系人。",
                })}
              </span>
              <a className="ir-sec-link" href="/app/events">
                {t({ en: "More events →", zh: "查看更多活动 →" })}
              </a>
            </div>
            {viewModel.nextEventsState === "ready" ? (
              eventList("plain")
            ) : (
              <span className="ir-panel-note" data-state={viewModel.nextEventsState}>
                {eventsNote(viewModel.nextEventsState)}
              </span>
            )}
          </section>
        </div>
      </IOrbitScreenFrame>
    );
  }

  return (
    <IOrbitScreenFrame ready={ready} screenTitle={t({ en: "Strategy", zh: "工作策略" })}>
      <div className="ir-screen" data-orbit-iorbit-screen="strategy">
        {/* 505 */}
        <span className="ir-crumb">
          <a href="/app/agent">iOrbit</a> / <a href="/app/agent">{t({ en: "Chat", zh: "对话" })}</a> /{" "}
          {t({ en: "Strategy", zh: "工作策略" })}
        </span>

        {/* 506–513 */}
        <div className="ir-head-split">
          <div className="ir-title-col-8">
            <h2 className="ir-h1-sub">{t({ en: "Strategy", zh: "工作策略" })}</h2>
            <p className="ir-lede">
              {t({
                en: "Actionable moves, built from your question and the data you already have.",
                zh: "基于你的问题，结合现有数据与资源，提供可执行的行动建议。",
              })}
            </p>
          </div>
          <span className="ir-head-actions">
            <a className="ir-head-btn" href={historyHref}>
              {t({ en: "◷ History", zh: "◷ 历史记录" })}
            </a>
            <a className="ir-head-btn ir-head-btn-soft" href="/app/agent">
              {t({ en: "← Back to chat", zh: "← 返回对话" })}
            </a>
          </span>
        </div>

        {whoFirstCompact}

        {/* 566–589 */}
        {waitingSection(
          "missing",
          "2",
          t({ en: "Who you are missing", zh: "你还缺什么人" }),
          t({
            en: "To move the collaboration forward you still need these kinds of contacts.",
            zh: "为了推进合作，你还需要补足关键联系人。",
          }),
        )}

        {/* 591–619 */}
        {waitingSection(
          "prep",
          "3",
          t({ en: "What to prepare", zh: "聊之前，准备什么" }),
          t({
            en: "Preparation makes each conversation count.",
            zh: "充分的准备能让沟通更高效。",
          }),
        )}

        {/* 621–639 */}
        <section
          className="ir-panel ir-panel-16"
          data-orbit-agent-strategy-section="next-events"
        >
          <div className="ir-num-head">
            <span className="ir-num">4</span>
            <strong className="ir-sec-h">{t({ en: "Where to go next", zh: "下一步去哪" })}</strong>
            <span className="ir-sec-hint">
              {t({
                en: "Public events matching your goal (lexical match, top three).",
                zh: "按你的目标匹配的公开活动，能更快接触新的决策层联系人。",
              })}
            </span>
          </div>
          {viewModel.nextEventsState === "ready" ? (
            eventList("cover")
          ) : (
            <span className="ir-panel-note" data-state={viewModel.nextEventsState}>
              {eventsNote(viewModel.nextEventsState)}
            </span>
          )}
        </section>

        {/* 641–654：设计的三行是三处**导航**（goActions / goPlan / goContacts）。
            设计的行文案是 mock 场景（「联系田中圭子」「准备峰会参会材料」），
            这里保留导航本身，文案换成真实落点（「审阅修订」20）。 */}
        <section
          className="ir-panel ir-panel-16"
          data-orbit-agent-strategy-section="this-week"
        >
          <div className="ir-num-head">
            <span className="ir-num">5</span>
            <strong className="ir-sec-h">{t({ en: "This week", zh: "本周建议" })}</strong>
            <span className="ir-sec-hint">
              {t({
                en: "Three places to take the next step.",
                zh: "接下来可以从这三处继续推进。",
              })}
            </span>
          </div>
          <div className="ir-cards-280">
            {(
              [
                {
                  glyph: "✉",
                  href: "/app/agent/actions",
                  label: { en: "1. Suggested actions", zh: "1. 建议与行动" },
                  note: {
                    en: "Decide, do or defer today's ledger items.",
                    zh: "处理今天账本里等你决定与建议今天做的事。",
                  },
                },
                {
                  glyph: "▦",
                  href: "/app/agent/plan",
                  label: { en: "2. Plan", zh: "2. 执行计划" },
                  note: {
                    en: "See this week's focus and schedule in one place.",
                    zh: "看本周重点与日程的完整节奏。",
                  },
                },
                {
                  glyph: "⚇",
                  href: "/app/agent/strategy?view=contacts",
                  label: { en: "3. Contact suggestions", zh: "3. 联系人建议" },
                  note: {
                    en: "Work through who to reach out to first.",
                    zh: "逐个看该先联系谁、怎么开口。",
                  },
                },
              ] as const
            ).map((item) => (
              <a className="ir-nav-card" href={item.href} key={item.href}>
                <span className="ir-nav-icon">{item.glyph}</span>
                <span className="ir-row-copy">
                  <strong className="ir-nav-title">{t(item.label)}</strong>
                  <span className="ir-row-desc">{t(item.note)}</span>
                </span>
                <span className="ir-caret">›</span>
              </a>
            ))}
          </div>
        </section>

        {/* 656–659 */}
        <div className="ir-pill-row">
          <a className="ir-pill-btn" href="/app/agent/strategy?view=contacts">
            {t({ en: "Who should I contact first?", zh: "我应该先联系谁？" })}
          </a>
          <a className="ir-pill-btn" href="/app/agent/plan">
            {t({ en: "Break it into four weeks", zh: "帮我拆成 4 周计划" })}
          </a>
        </div>
      </div>
    </IOrbitScreenFrame>
  );
}
