/**
 * iOrbit 对话屏右栏（Orbit_0918）。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html 第 321–343 行：
 *   322–327  「本次对话可继续」：三条可继续的提问，第三条是导航（设计 326 的 `goContacts`）
 *   328–342  「上下文」：兴趣方向 / 已报名活动 / 目标人脉 三段 + 「编辑」
 *
 * 数据来源（设计 renderVals 的 mock 一条都没用）：
 *   - 三条提问：真实 `viewModel.suggests`（与对话屏「试试这些问题」同一来源）；
 *     设计 324「有没有适合产品经理的活动？」是针对某个人的 mock 诉求，不照搬。
 *   - 兴趣方向：`home.account.topics`（个人资料「关注话题」）
 *   - 已报名活动：`home.events` 里 `youRsvped` 的两场，与概览屏同一份排序口径
 *   - 目标人脉：`home.account.targetRelationshipTypes`（个人资料「想认识的人」）
 *   - 「编辑」：`/app/profile?view=persona`（审阅修订 17），不是死链
 * 任一段没有资料 → 该段渲染空态文案，**不造 chip**；`home === null`（路由模型非
 * success，`agent/page.tsx:182`）时三段一律说「暂时读不到资料」而不是「还没有填写」
 * ——读不到和没填是两回事，后者会把一句没有依据的判断说成事实。
 */
"use client";

import { useMemo } from "react";

import { localizeHomeList } from "../../home/home-demo-localization";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitAgentViewModel } from "../../orbit-agent-route-view-model";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import { agentSuggestLabel, iorbitEventChipDate, iorbitRegisteredEvents } from "./iorbit-model";

/** 设计 334 的「编辑」落点：个人资料的「人物画像」分屏（兴趣方向 / 目标人脉都在那里编辑）。 */
export const IORBIT_PERSONA_EDIT_HREF = "/app/profile?view=persona";

export interface IOrbitChatAsideProps {
  home: OrbitHomeViewModel | null;
  /** 发起提问：与线程共用 `use-agent-chat` 的 `ask`。 */
  onAsk: (query: string) => void;
  viewModel: OrbitAgentViewModel;
}

export function IOrbitChatAside({ home, onAsk, viewModel }: IOrbitChatAsideProps) {
  const { language, t } = useOrbitLanguage();
  const listLanguage = language === "ja" ? "en" : language;

  // 设计 323/324 两条 + 325 的导航条。前两条取真实 suggests；没有 suggests 时
  // 整张卡只剩导航条（不编问题）。
  const asks = viewModel.suggests.slice(0, 2);

  const registered = useMemo(
    () => iorbitRegisteredEvents(home?.events ?? [], Date.now()).slice(0, 2),
    [home],
  );
  const topics = useMemo(
    () => localizeHomeList(home?.account.topics, language).filter(Boolean),
    [home, language],
  );
  const targets = useMemo(
    () => localizeHomeList(home?.account.targetRelationshipTypes, language).filter(Boolean),
    [home, language],
  );

  // 读不到资料（路由模型非 success）与资料里没填，是两种不同的事实。
  const unavailable = home === null;
  const emptyNote = (text: string) => (
    <span className="ir-aside-empty">
      {unavailable
        ? t({ en: "Your profile could not be loaded just now.", zh: "暂时读不到你的资料。" })
        : text}
    </span>
  );

  return (
    <aside className="ir-aside" data-orbit-iorbit-chat-aside>
      {/* 322–327 */}
      <div className="ir-aside-card">
        <span className="ir-aside-head">
          <span className="ir-aside-icon">✦</span>
          <strong className="ir-aside-h">
            {t({ en: "Keep this conversation going", zh: "本次对话可继续" })}
          </strong>
        </span>
        {asks.map((suggest) => (
          <button
            className="btn ir-aside-next"
            key={suggest.q}
            onClick={() => onAsk(suggest.q)}
            type="button"
          >
            {agentSuggestLabel(suggest.label, listLanguage)}
            <span className="ir-caret">›</span>
          </button>
        ))}
        {/* 326：设计里这一条是导航（`goContacts`），不是发消息 */}
        <a className="ir-aside-next" href="/app/agent/strategy?view=contacts">
          {t({ en: "Who should I contact first?", zh: "先联系谁比较好？" })}
          <span className="ir-caret">›</span>
        </a>
      </div>

      {/* 328–342 */}
      <div className="ir-aside-card ir-aside-card-16">
        <span className="ir-aside-context-head">
          <span className="ir-aside-context-copy">
            <span className="ir-aside-head">
              <span className="ir-aside-icon">▤</span>
              <strong className="ir-aside-h">{t({ en: "Context", zh: "上下文" })}</strong>
            </span>
            <span className="ir-aside-context-note">
              {t({
                en: "Advice is based on the information below",
                zh: "基于以下信息为你提供建议",
              })}
            </span>
          </span>
          <a className="ir-aside-edit" href={IORBIT_PERSONA_EDIT_HREF}>
            {t({ en: "Edit", zh: "编辑" })}
          </a>
        </span>

        <div className="ir-aside-group">
          <span className="ir-aside-label">◇ {t({ en: "Interests", zh: "兴趣方向" })}</span>
          {topics.length > 0 ? (
            <span className="ir-aside-tags">
              {topics.map((topic) => (
                <span className="ir-aside-tag ir-aside-tag-on" key={topic}>
                  {topic}
                </span>
              ))}
            </span>
          ) : (
            emptyNote(
              t({
                en: "No topics in your profile yet.",
                zh: "资料里还没有填写关注话题。",
              }),
            )
          )}
        </div>

        <div className="ir-aside-group ir-aside-group-div">
          <span className="ir-aside-label">▦ {t({ en: "Registered events", zh: "已报名活动" })}</span>
          {registered.length > 0 ? (
            <span className="ir-aside-tags">
              {registered.map((event) => {
                const day = iorbitEventChipDate(event.startsAt);
                return (
                  <span className="ir-aside-tag" key={event.id}>
                    {day ? `${event.name}（${day}）` : event.name}
                  </span>
                );
              })}
            </span>
          ) : (
            emptyNote(t({ en: "No registered events yet.", zh: "还没有已报名的活动。" }))
          )}
        </div>

        <div className="ir-aside-group ir-aside-group-div">
          <span className="ir-aside-label">⚇ {t({ en: "People to meet", zh: "目标人脉" })}</span>
          {targets.length > 0 ? (
            <span className="ir-aside-tags">
              {targets.map((target) => (
                <span className="ir-aside-tag" key={target}>
                  {target}
                </span>
              ))}
            </span>
          ) : (
            emptyNote(
              t({
                en: "No target relationships in your profile yet.",
                zh: "资料里还没有填写想认识的人。",
              }),
            )
          )}
        </div>
      </div>
    </aside>
  );
}
