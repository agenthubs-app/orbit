/**
 * Events（Orbit_0918）参与者侧壳：列表页头 + 三页签 + 全部 ev-* 样式 + toast。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 43 行（<main>）、46–57 行（页头/页签）、781–783 行（toast）。
 * 顶栏由 page.tsx 按登录态挂（PublicTopNav / AccountTopNav），不在壳内。
 */
"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";

export type EventsListView = "discover" | "mine";

export function EventsToast({ text }: { text: string }) {
  if (!text) return null;
  return <div className="ev-toast" role="status">✓ {text}</div>;
}

export function EventsShell({
  view,
  onSelectView,
  children,
  toast,
  modal,
}: {
  view: EventsListView;
  onSelectView: (next: EventsListView) => void;
  children: ReactNode;
  toast?: string;
  modal?: ReactNode;
}) {
  const { preserveHref, t } = useOrbitLanguage();
  const isMine = view === "mine";
  const tabClass = (on: boolean) => `btn ev-tab ${on ? "ev-tab-on" : "ev-tab-off"}`;
  return (
    <main className="ev-main" data-appscroll data-orbit-route="app-events-list-screens" data-events-view={view}>
      <style>{EVENTS_STYLES}</style>
      <div className="ev-list">
        <div className="ev-head">
          <div className="ev-head-copy">
            <h1 className="ev-h1">{isMine ? t({ en: "My events", zh: "我的活动" }) : t({ en: "Discover events", zh: "发现活动" })}</h1>
            <p className="ev-sub">
              {isMine
                ? t({ en: "Track the events you have registered for and never miss a moment.", zh: "查看你已报名的活动，掌握活动进展，不错过任何精彩时刻。" })
                : t({ en: "Explore events that interest you, meet remarkable people, and expand what is possible.", zh: "探索你感兴趣的活动，连接更多优秀的人，拓展你的可能性。" })}
            </p>
          </div>
          <a className="btn ev-btn-create" href={preserveHref("/app/events/center")}>＋ {t({ en: "Create event", zh: "创建活动" })}</a>
        </div>
        <div className="ev-tabs" role="tablist">
          <button aria-selected={!isMine} className={tabClass(!isMine)} onClick={() => onSelectView("discover")} role="tab" type="button">
            {t({ en: "Discover", zh: "发现活动" })}
          </button>
          <button aria-selected={isMine} className={tabClass(isMine)} onClick={() => onSelectView("mine")} role="tab" type="button">
            {t({ en: "My events", zh: "我的活动" })}
          </button>
          <a className={tabClass(false)} href={preserveHref("/app/events/center")} role="tab">
            {t({ en: "Host dashboard", zh: "主办管理" })}
          </a>
        </div>
        {children}
      </div>
      {toast ? <EventsToast text={toast} /> : null}
      {modal}
    </main>
  );
}

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。前缀 [data-orbit-real-page="events-0918"]。
export const EVENTS_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
[data-orbit-real-page="events-0918"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip; }
[data-orbit-real-page="events-0918"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="events-0918"] a:hover { color: #0E1225; }
[data-orbit-real-page="events-0918"] input, [data-orbit-real-page="events-0918"] textarea, [data-orbit-real-page="events-0918"] button, [data-orbit-real-page="events-0918"] select { font-family: inherit; }
[data-orbit-real-page="events-0918"] input::placeholder, [data-orbit-real-page="events-0918"] textarea::placeholder { color: #9FA3C4; }
/* ── 壳（设计稿 43、46–57 行）── */
[data-orbit-real-page="events-0918"] .ev-main { max-width: 1240px; margin: 0 auto; padding: 28px 40px 96px; display: flex; flex-direction: column; gap: 24px; }
[data-orbit-real-page="events-0918"] .ev-list { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="events-0918"] .ev-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="events-0918"] .ev-head-copy { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="events-0918"] .ev-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
[data-orbit-real-page="events-0918"] .ev-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .btn.ev-btn-create { padding: 13px 22px; border: 0; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-btn-create:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="events-0918"] .btn.ev-btn-create:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-tabs { display: flex; gap: 8px; border-bottom: 1px solid #E8E9F6; font-size: 15px; }
[data-orbit-real-page="events-0918"] .btn.ev-tab { padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; cursor: pointer;
  /* 设计稿页签是 button 元素，未继承 15px，按渲染结果 13.33px 对齐 */
  font-size: 13.3333px;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; border-radius: 0; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-tab:active { transform: none; }
[data-orbit-real-page="events-0918"] .btn.ev-tab-on { border-bottom-color: #0E1225; color: #0E1225; font-weight: 500; }
[data-orbit-real-page="events-0918"] .btn.ev-tab-off { color: #6B6F99; font-weight: 400; }
/* 主办管理页签是 <a>：中和页面级 a:hover 变色（设计 button 页签无 hover） */
[data-orbit-real-page="events-0918"] .btn.ev-tab-off:hover { color: #6B6F99; }
[data-orbit-real-page="events-0918"] .btn.ev-tab-on:hover { color: #0E1225; }
/* ── 搜索 + 筛选段（设计稿 59–68 行）── */
[data-orbit-real-page="events-0918"] .ev-toolbar { display: flex; flex-wrap: wrap; gap: 14px; }
[data-orbit-real-page="events-0918"] .ev-search { flex: 1; min-width: 280px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; }
[data-orbit-real-page="events-0918"] .ev-search-icon { color: #9FA3C4; }
[data-orbit-real-page="events-0918"] .ev-search-input { flex: 1; padding: 14px 0; border: 0; border-radius: 0; background: transparent; font-size: 14px; outline: none; color: #0E1225; }
[data-orbit-real-page="events-0918"] .ev-seg { display: flex; padding: 4px; border-radius: 12px; background: #F7F7FD; border: 1px solid #E8E9F6; }
[data-orbit-real-page="events-0918"] .btn.ev-seg-btn { padding: 10px 22px; border: 0; border-radius: 9px; background: transparent; color: #3B3F7A; font-size: 14px; cursor: pointer; transition: all .2s; white-space: nowrap;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; }
[data-orbit-real-page="events-0918"] .btn.ev-seg-btn:active { transform: none; }
[data-orbit-real-page="events-0918"] .btn.ev-seg-on { background: #0E1225; color: #FFFFFF; }
/* ── 统计四卡（设计稿 72–78 行）── */
[data-orbit-real-page="events-0918"] .ev-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 16px; }
[data-orbit-real-page="events-0918"] .ev-stat { display: flex; gap: 16px; padding: 22px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page="events-0918"] .ev-stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .ev-stat-copy { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="events-0918"] .ev-stat-label { font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-stat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 28px; letter-spacing: -0.02em; line-height: 1.1; }
[data-orbit-real-page="events-0918"] .ev-stat-desc { font-size: 13px; color: #6B6F99; }
/* ── 发现活动卡片网格（设计稿 80–102 行）── */
[data-orbit-real-page="events-0918"] .ev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 20px; }
[data-orbit-real-page="events-0918"] .ev-card { display: flex; flex-direction: column; gap: 14px; padding: 14px 14px 18px; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; transition: box-shadow .2s, transform .2s; }
[data-orbit-real-page="events-0918"] .ev-card:hover { box-shadow: 0 12px 32px rgba(59,63,122,0.10); transform: translateY(-2px); }
[data-orbit-real-page="events-0918"] .ev-cover-link { display: block; cursor: pointer; }
[data-orbit-real-page="events-0918"] .ev-cover { position: relative; height: 150px; border: 0; border-radius: 12px; overflow: hidden; display: block; }
[data-orbit-real-page="events-0918"] .ev-cover-ended { opacity: 0.74; }
[data-orbit-real-page="events-0918"] .ev-chip { padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }
[data-orbit-real-page="events-0918"] .ev-chip-cover { position: absolute; top: 12px; right: 12px; z-index: 1; }
[data-orbit-real-page="events-0918"] .ev-body { display: flex; flex-direction: column; gap: 10px; padding: 0 4px; }
[data-orbit-real-page="events-0918"] .ev-title { margin: 0; font-size: 17px; font-weight: 700; color: #0E1225; line-height: 1.4; text-align: left; }
[data-orbit-real-page="events-0918"] .ev-title-link { color: #0E1225; cursor: pointer; }
[data-orbit-real-page="events-0918"] .ev-meta { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-meta-icon { color: #9FA3C4; }
[data-orbit-real-page="events-0918"] .ev-tags { display: flex; flex-wrap: wrap; gap: 6px; }
[data-orbit-real-page="events-0918"] .ev-tag { padding: 4px 10px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 12px; }
[data-orbit-real-page="events-0918"] .ev-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 6px; }
[data-orbit-real-page="events-0918"] .ev-people { display: flex; align-items: center; gap: 8px; }
[data-orbit-real-page="events-0918"] .ev-people-n { font-size: 13px; color: #6B6F99; white-space: nowrap; }
[data-orbit-real-page="events-0918"] .btn.ev-cta { padding: 10px 18px; border: 1px solid transparent; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap;
  /* background / color / border-color 按 CTA_TONE 内联；覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-cta:active { transform: none; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-tl { padding: 12px 20px; }
/* ── 空态（设计稿 103 行只有一行「没有匹配的活动」；沿用现有带动作的空态，按设计色阶写）── */
[data-orbit-real-page="events-0918"] .ev-empty { display: grid; justify-items: center; align-items: center; min-height: 280px; padding: 40px 24px; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; text-align: center; }
[data-orbit-real-page="events-0918"] .ev-empty-icon { width: 52px; height: 52px; border-radius: 999px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 22px; }
[data-orbit-real-page="events-0918"] .ev-empty-copy { margin-top: 16px; max-width: 460px; }
[data-orbit-real-page="events-0918"] .ev-empty-h2 { margin: 0; font-size: 20px; font-weight: 700; color: #0E1225; }
[data-orbit-real-page="events-0918"] .ev-empty-p { margin: 10px 0 0; color: #6B6F99; line-height: 1.65; }
[data-orbit-real-page="events-0918"] .btn.ev-btn-reset { margin-top: 18px; padding: 12px 22px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-btn-reset:hover { background: #2E3270; }
[data-orbit-real-page="events-0918"] .btn.ev-btn-reset:active { transform: none; }
/* ── 我的活动（设计稿 106–137 行）── */
[data-orbit-real-page="events-0918"] .ev-mine { display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="events-0918"] .ev-mine-card { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 24px; align-items: center; padding: 18px; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; }
[data-orbit-real-page="events-0918"] .ev-mine-cover { height: 140px; }
[data-orbit-real-page="events-0918"] .ev-mine-cover.ev-cover-ended { opacity: 0.72; }
[data-orbit-real-page="events-0918"] .ev-mine-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
[data-orbit-real-page="events-0918"] .ev-mine-title { line-height: normal; }
[data-orbit-real-page="events-0918"] .ev-timeline { display: grid; grid-template-columns: repeat(3, 1fr); }
[data-orbit-real-page="events-0918"] .ev-tl-node { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; }
[data-orbit-real-page="events-0918"] .ev-tl-line { position: absolute; top: 11px; left: 50%; width: 100%; height: 2px; }
[data-orbit-real-page="events-0918"] .ev-tl-dot { position: relative; width: 24px; height: 24px; border-radius: 50%; border: 2px solid; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; }
[data-orbit-real-page="events-0918"] .ev-tl-label { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-tl-date { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="events-0918"] .ev-mine-side { display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 24px; align-self: stretch; }
[data-orbit-real-page="events-0918"] .ev-mine-foot { align-self: center; font-size: 13px; color: #9FA3C4; padding-top: 10px; }
/* ── toast（设计稿 781–783 行）── */
[data-orbit-real-page="events-0918"] .ev-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 200; padding: 12px 20px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 14px; box-shadow: 0 12px 40px rgba(14,18,37,0.25); animation: orbit-fade .3s ease; }
/* ── 设计稿无：焦点环与窄屏（不影响 1240 比对）── */
[data-orbit-real-page="events-0918"] .btn.ev-seg-btn:focus-visible { outline: 2px solid #4B4FC7; outline-offset: -2px; }
[data-orbit-real-page="events-0918"] .btn.ev-tab:focus-visible { outline: 2px solid #4B4FC7; outline-offset: 2px; }
@media (pointer: coarse) { [data-orbit-real-page="events-0918"] .btn.ev-seg-btn { min-height: 44px; } }
@media (max-width: 640px) {
  [data-orbit-real-page="events-0918"] .ev-main { padding: 20px 16px 72px; }
  [data-orbit-real-page="events-0918"] .ev-h1 { font-size: 30px; }
  [data-orbit-real-page="events-0918"] .ev-stats { grid-template-columns: repeat(2, 1fr); }
}
`;
