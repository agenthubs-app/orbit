/**
 * 连接屏（Orbit_0918 个人中心 设计稿 244–280 行）。
 *   - 四张集成卡 = 设计 renderVals().intMeta 原样（name / glyph / 色块 / desc / scopes 是设计 UI 文案，不是 mock 数据）。
 *   - 既有决定：无 OAuth、无 toggle、无存储的连接状态 → `connected = {}`：状态 chip 一律「未连接」，
 *     按钮位置渲染非交互 `<span class="pc-connect-cta pc-connect-cta-soon" aria-disabled="true">即将开放</span>`
 *     （与设计 259 行按钮同盒几何，灰底灰字），卡内没有任何 button 元素。
 *   - 连接概览：已连接 / 未连接 由 `connected` 真实派生（今天 0 / 4）。
 *   - 连接说明卡文案原样；设计 275 行「了解更多 →」是 mock 动作（flashEdit）且无真实目标页 → 省略（记台账）。
 */
"use client";

import { useOrbitLanguage } from "../../orbit-language-context";

type Copy = { zh: string; en: string };

export interface ConnectIntegration {
  key: "gcal" | "gmail" | "gcontacts" | "notion";
  name: string;
  glyph: string;
  iconBg: string;
  iconColor: string;
  desc: Copy;
  scopes: readonly Copy[];
}

// 设计稿 intMeta 原样（中文原文；en 由实现者补）。
export const CONNECT_INTEGRATIONS: readonly ConnectIntegration[] = [
  {
    key: "gcal",
    name: "Google Calendar",
    glyph: "31",
    iconBg: "#ECEEFB",
    iconColor: "#2E3270",
    desc: { zh: "同步你的日程安排，帮助 iOrbit 更好地为你规划时间。", en: "Sync your calendar so iOrbit can plan your time better." },
    scopes: [
      { zh: "读取日程事件", en: "Read calendar events" },
      { zh: "创建和管理日程（在你授权后）", en: "Create and manage events (after you authorise)" },
    ],
  },
  {
    key: "gmail",
    name: "Gmail",
    glyph: "M",
    iconBg: "#FBECEA",
    iconColor: "#B5473A",
    desc: { zh: "让 iOrbit 帮你理解重要邮件，提取待办和会议信息。", en: "Let iOrbit understand important mail and extract to-dos and meetings." },
    scopes: [
      { zh: "读取重要邮件（在你授权后）", en: "Read important mail (after you authorise)" },
      { zh: "识别会议邀请与待办事项", en: "Detect meeting invites and to-dos" },
    ],
  },
  {
    key: "gcontacts",
    name: "Google Contacts",
    glyph: "⚇",
    iconBg: "#ECEEFB",
    iconColor: "#4B4FC7",
    desc: { zh: "同步你的联系人，帮助你更轻松地管理人脉与会议。", en: "Sync your contacts to manage your network and meetings more easily." },
    scopes: [
      { zh: "读取联系人信息", en: "Read contact details" },
      { zh: "帮助识别会议参与者", en: "Help identify meeting participants" },
    ],
  },
  {
    key: "notion",
    name: "Notion",
    glyph: "N",
    iconBg: "#F1F1FA",
    iconColor: "#0E1225",
    desc: { zh: "连接你的知识库，让 iOrbit 更好地理解你的项目与工作内容。", en: "Connect your knowledge base so iOrbit understands your projects and work." },
    scopes: [
      { zh: "读取页面与数据库（在你授权后）", en: "Read pages and databases (after you authorise)" },
      { zh: "帮助检索与总结相关内容", en: "Help retrieve and summarise related content" },
    ],
  },
];

// 没有连接能力也没有存储的连接状态：恒为空，计数由它真实派生。
const connected: Partial<Record<ConnectIntegration["key"], true>> = {};

export function connectCounts(): { connected: number; disconnected: number } {
  const on = CONNECT_INTEGRATIONS.filter((it) => connected[it.key]).length;
  return { connected: on, disconnected: CONNECT_INTEGRATIONS.length - on };
}

export function ProfileConnect() {
  const { t } = useOrbitLanguage();
  const counts = connectCounts();

  return (
    <div className="pc-connect">
      <div className="pc-int-grid">
        {CONNECT_INTEGRATIONS.map((it) => (
          <section key={it.key} className="pc-card pc-int-card">
            <span className="pc-int-head">
              <span className="pc-int-glyph" style={{ background: it.iconBg, color: it.iconColor }}>{it.glyph}</span>
              <span className="pc-int-state pc-int-state-off">● {t({ en: "Not connected", zh: "未连接" })}</span>
            </span>
            <span className="pc-int-copy"><strong className="pc-int-name">{it.name}</strong><span className="pc-int-desc">{t(it.desc)}</span></span>
            <span className="pc-int-scopes">
              {it.scopes.map((scope) => (
                <span key={scope.zh} className="pc-int-scope"><span className="pc-int-check">✓</span>{t(scope)}</span>
              ))}
            </span>
            <span className="pc-connect-cta pc-connect-cta-soon" aria-disabled="true">{t({ en: "Coming soon", zh: "即将开放" })}</span>
          </section>
        ))}
      </div>

      <div className="pc-col">
        <section className="pc-card pc-conn-card">
          <strong className="pc-h2">{t({ en: "Connection overview", zh: "连接概览" })}</strong>
          <span className="pc-conn-grid">
            <span className="pc-conn-cell"><span className="pc-conn-icon-on">✓</span><strong className="pc-conn-count">{counts.connected}</strong><span className="pc-conn-label">{t({ en: "Connected", zh: "已连接" })}</span></span>
            <span className="pc-conn-cell pc-conn-cell-next"><span className="pc-conn-icon-off">○</span><strong className="pc-conn-count">{counts.disconnected}</strong><span className="pc-conn-label">{t({ en: "Not connected", zh: "未连接" })}</span></span>
          </span>
        </section>

        <section className="pc-card pc-note-card">
          <strong className="pc-h2">{t({ en: "About connections", zh: "连接说明" })}</strong>
          <span className="pc-note-row">
            <span className="pc-note-icon">⛨</span>
            <span className="pc-note-text">{t({ en: "Orbit only accesses the data you authorise, and only to serve you better. You can manage or disconnect here at any time.", zh: "Orbit 只会访问你授权的数据，并且仅用于为你提供更好的服务。你可以随时在这里管理或断开连接。" })}</span>
          </span>
        </section>
      </div>
    </div>
  );
}
