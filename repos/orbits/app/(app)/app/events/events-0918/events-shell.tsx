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
    <main className="ev-main" data-appscroll data-events-view={view}>
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
/* ── 详情（设计稿 141–219 行）── */
[data-orbit-real-page="events-0918"] .ev-detail { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="events-0918"] .btn.ev-back { align-self: flex-start; display: flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  /* 设计稿 button 未继承字重；覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  font-weight: 400; height: auto; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-back:hover { background: #ECEEFB; }
[data-orbit-real-page="events-0918"] .btn.ev-back:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 32px; align-items: center; }
[data-orbit-real-page="events-0918"] .ev-hero-cover { position: relative; height: 300px; border: 0; border-radius: 18px; overflow: hidden; display: block; box-shadow: 0 20px 50px rgba(59,63,122,0.15); }
[data-orbit-real-page="events-0918"] .ev-hero-copy { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
[data-orbit-real-page="events-0918"] .ev-hero-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 38px; line-height: 1.15; letter-spacing: -0.03em; }
[data-orbit-real-page="events-0918"] .ev-hero-lede { margin: 0; font-size: 15px; color: #3B3F7A; line-height: 1.7; }
[data-orbit-real-page="events-0918"] .ev-dtags { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page="events-0918"] .ev-dtag { padding: 6px 12px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 13px; }
[data-orbit-real-page="events-0918"] .ev-info { display: flex; flex-direction: column; gap: 10px; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-info-row { display: flex; gap: 12px; align-items: center; }
[data-orbit-real-page="events-0918"] .ev-info-icon { color: #4B4FC7; }
[data-orbit-real-page="events-0918"] .ev-cta-row { display: flex; gap: 12px; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-primary { padding: 14px 26px; border: 0; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-primary:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-primary:active { transform: none; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-secondary { padding: 14px 22px; border: 1px solid #B9BCEB; border-radius: 12px; background: #FFFFFF; color: #2E3270; font-size: 15px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-secondary:hover { background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="events-0918"] .btn.ev-cta-secondary:active { transform: none; }
/* 设计稿无禁用态：报名未开放 / 资料锁定时按设计色阶降灰（不改尺寸） */
[data-orbit-real-page="events-0918"] .btn.ev-cta-disabled, [data-orbit-real-page="events-0918"] .btn.ev-cta-disabled:hover { background: #ECEEFB; border-color: #E8E9F6; color: #9FA3C4; cursor: default; }
/* 设计稿无：报名状态说明（registrationBlockingReasonCopy） */
[data-orbit-real-page="events-0918"] .ev-alert { margin: 0; padding: 10px 14px; border-radius: 10px; background: #FBF1DC; color: #8A6420; font-size: 13px; line-height: 1.6; }
[data-orbit-real-page="events-0918"] .ev-panel[hidden] { display: none; }
[data-orbit-real-page="events-0918"] .ev-intro-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 20px; align-items: start; }
[data-orbit-real-page="events-0918"] .ev-card-panel { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 28px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="events-0918"] .ev-card-panel-agenda { gap: 14px; }
[data-orbit-real-page="events-0918"] .ev-h2 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
[data-orbit-real-page="events-0918"] .ev-p { margin: 0; font-size: 15px; line-height: 1.8; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-muted { color: #6B6F99; }
[data-orbit-real-page="events-0918"] .ev-agenda-row { display: grid; grid-template-columns: 110px 1fr 20px; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; background: #F7F7FD; }
[data-orbit-real-page="events-0918"] .ev-agenda-time { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="events-0918"] .ev-agenda-copy { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="events-0918"] .ev-agenda-title { font-size: 14px; }
[data-orbit-real-page="events-0918"] .ev-agenda-sub { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="events-0918"] .ev-agenda-caret { color: #9FA3C4; font-size: 12px; }
[data-orbit-real-page="events-0918"] .ev-panel-head { display: flex; align-items: baseline; justify-content: space-between; }
[data-orbit-real-page="events-0918"] .btn.ev-link { border: 0; background: transparent; font-size: 14px; color: #4B4FC7; cursor: pointer; padding: 0; border-radius: 0;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  font-weight: 400; height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-link:hover { color: #4B4FC7; background: transparent; }
[data-orbit-real-page="events-0918"] .btn.ev-link:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-avatar { width: 56px; height: 56px; border: 0; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .ev-person-name { font-size: 15px; }
[data-orbit-real-page="events-0918"] .btn.ev-person-btn { padding: 10px; border: 1px solid #B9BCEB; border-radius: 10px; background: #FFFFFF; color: #2E3270; font-size: 13px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-person-btn:hover { background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="events-0918"] .btn.ev-person-btn:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-host { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 28px; display: flex; gap: 20px; align-items: center; }
[data-orbit-real-page="events-0918"] .ev-host-logo { width: 72px; height: 72px; border-radius: 18px; background: #0E1225; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .ev-host-copy { flex: 1; display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="events-0918"] .ev-host-name { font-size: 18px; }
[data-orbit-real-page="events-0918"] .ev-host-desc { font-size: 14px; color: #3B3F7A; line-height: 1.7; }
[data-orbit-real-page="events-0918"] .btn.ev-host-btn { padding: 12px 20px; border: 1px solid #B9BCEB; border-radius: 10px; background: #FFFFFF; color: #2E3270; font-size: 14px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-host-btn:hover { background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="events-0918"] .btn.ev-host-btn:active { transform: none; }
/* ── 回顾态（设计稿 521–580 行）── */
[data-orbit-real-page="events-0918"] .ev-recap-hero { display: flex; flex-wrap: wrap; gap: 28px; align-items: center; }
[data-orbit-real-page="events-0918"] .ev-recap-cover { position: relative; width: 420px; max-width: 100%; height: 200px; border: 0; border-radius: 16px; overflow: hidden; display: block; }
[data-orbit-real-page="events-0918"] .ev-recap-copy { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="events-0918"] .ev-chip-hero { align-self: flex-start; }
[data-orbit-real-page="events-0918"] .ev-recap-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 36px; line-height: 1.15; letter-spacing: -0.03em; }
[data-orbit-real-page="events-0918"] .ev-recap-sub { font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-recap-meta { display: flex; flex-wrap: wrap; gap: 20px; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-recap-people { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="events-0918"] .ev-initials { display: flex; }
[data-orbit-real-page="events-0918"] .ev-initial { width: 32px; height: 32px; border-radius: 50%; background: #DDDEFA; color: #3B3F7A; border: 2px solid #FFFFFF; margin-left: -8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page="events-0918"] .ev-recap-n { font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-recap-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
[data-orbit-real-page="events-0918"] .ev-recap-col { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="events-0918"] .ev-recap-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="events-0918"] .ev-recap-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="events-0918"] .ev-recap-card-title { display: flex; gap: 12px; }
[data-orbit-real-page="events-0918"] .ev-recap-card-title-center { align-items: center; }
[data-orbit-real-page="events-0918"] .ev-icon-44 { width: 44px; height: 44px; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .ev-recap-card-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="events-0918"] .ev-recap-desc { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="events-0918"] .ev-recap-p { flex: 1; min-width: 260px; margin: 0; font-size: 14px; line-height: 1.8; color: #3B3F7A; }
[data-orbit-real-page="events-0918"] .ev-recap-people-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; }
[data-orbit-real-page="events-0918"] .ev-recap-person { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid #E8E9F6; border-radius: 14px; }
[data-orbit-real-page="events-0918"] .ev-recap-person-head { display: flex; gap: 12px; align-items: center; }
[data-orbit-real-page="events-0918"] .ev-recap-person-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="events-0918"] .ev-recap-person-sub { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="events-0918"] .ev-banner { border: 1px solid #E8E9F6; border-radius: 18px; background: #F7F7FD; padding: 22px 26px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
[data-orbit-real-page="events-0918"] .ev-banner-copy { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="events-0918"] .ev-banner-title { font-size: 17px; }
[data-orbit-real-page="events-0918"] .btn.ev-banner-btn { padding: 12px 20px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="events-0918"] .btn.ev-banner-btn:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="events-0918"] .btn.ev-banner-btn:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-side-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="events-0918"] .ev-side-head { display: flex; align-items: center; gap: 12px; }
[data-orbit-real-page="events-0918"] .ev-icon-40 { width: 40px; height: 40px; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="events-0918"] .ev-h2-20 { font-size: 20px; }
[data-orbit-real-page="events-0918"] .ev-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
[data-orbit-real-page="events-0918"] .ev-rstat { display: flex; gap: 12px; align-items: center; padding: 16px; border-radius: 12px; background: #F7F7FD; }
[data-orbit-real-page="events-0918"] .ev-rstat-icon { width: 40px; height: 40px; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .ev-rstat-copy { display: flex; flex-direction: column; }
[data-orbit-real-page="events-0918"] .ev-rstat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; }
[data-orbit-real-page="events-0918"] .ev-rstat-label { font-size: 12px; color: #6B6F99; }
/* ── 设计稿无：问 iOrbit 悬浮球（全局能力，沿用旧详情页） ── */
[data-orbit-real-page="events-0918"] .ev-orb-dock { position: fixed; z-index: 80; right: 24px; bottom: 24px; }
[data-orbit-real-page="events-0918"] .ev-orb { position: relative; display: grid; width: 54px; height: 54px; place-items: center; border-radius: 50%; background: #4B4FC7; box-shadow: 0 8px 26px rgba(59,63,122,0.28), 0 2px 6px rgba(59,63,122,0.16); color: #FFFFFF; font-size: 22px; }
[data-orbit-real-page="events-0918"] .ev-orb:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="events-0918"] .ev-orb-pip { position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border: 2px solid #FBFBFE; border-radius: 999px; background: #E8B34B; }
[data-orbit-real-page="events-0918"] .btn.ev-back:focus-visible, [data-orbit-real-page="events-0918"] .btn.ev-cta-primary:focus-visible, [data-orbit-real-page="events-0918"] .btn.ev-cta-secondary:focus-visible { outline: 2px solid #4B4FC7; outline-offset: 2px; }
@media (max-width: 760px) {
  [data-orbit-real-page="events-0918"] .ev-hero-cover { height: 220px; }
  [data-orbit-real-page="events-0918"] .ev-hero-h1 { font-size: 30px; }
  [data-orbit-real-page="events-0918"] .ev-host { flex-direction: column; align-items: flex-start; }
  [data-orbit-real-page="events-0918"] .ev-recap-grid { grid-template-columns: 1fr; }
  [data-orbit-real-page="events-0918"] .ev-orb-dock { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page="events-0918"] .ev-detail, [data-orbit-real-page="events-0918"] .ev-list { animation: none; }
}
/* ── 报名弹窗壳（设计 653 遮罩 / 654 面板 / 655 标题行 + ×）── */
[data-orbit-real-page="events-0918"] .ev-reg-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(14,18,37,0.35); backdrop-filter: blur(6px); display: flex; align-items: flex-start; justify-content: center; padding: 48px 24px; overflow-y: auto; }
[data-orbit-real-page="events-0918"] .ev-reg-panel { width: 100%; max-width: 620px; background: #FFFFFF; border-radius: 22px; box-shadow: 0 30px 80px rgba(14,18,37,0.25); padding: 30px 34px; display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="events-0918"] .ev-reg-head { display: flex; align-items: flex-start; justify-content: space-between; }
[data-orbit-real-page="events-0918"] .ev-reg-head-copy { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="events-0918"] .ev-reg-title { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; }
[data-orbit-real-page="events-0918"] .ev-reg-sub { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page="events-0918"] .btn.ev-modal-close { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: #3B3F7A; font-size: 20px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  padding: 0; gap: 0; font-weight: 400; letter-spacing: 0; line-height: normal; transition: none; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .btn.ev-modal-close:hover { background: #ECEEFB; }
[data-orbit-real-page="events-0918"] .btn.ev-modal-close:active { transform: none; }
/* ── 弹窗正文 = 不变的报名工作区（register/*.tsx 零改动）：只把设计 657–669 的控件声明
      作用域到工作区既有类名 / data-* 上；工作区自己的全屏尺寸（100dvh / visualViewport 高度 /
      页面渐变底）在面板内中和。inline style 只能用 !important 覆盖。── */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a { min-height: 0; height: auto !important; padding: 0; background: #FFFFFF; }
[data-orbit-real-page="events-0918"] .ev-reg-body [data-orbit-registration-profile-guide="register"] { min-height: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
/* 壳的 data-orbit-real-page 会让 [data-orbit-real-page] .btn 基类（orbit-reference-styles.tsx:594–611）落到工作区全部 .btn 上；
      下面按工作区自己的 <style>（registration-portrait-workspace.tsx:276）原样复述其声明并中和基类多出来的属性。
      父级 AI 访谈 <main data-orbit-registration-profile-guide=register> 里的 .btn / .btn-primary / .btn-secondary 是按 .btn 体系写的
      （只覆盖 border-color / background），基类对它们是预期外观 → 用 :not() 排除，不中和。
      工作区 button 通则：font:inherit; cursor:pointer; min-height:44px；:disabled cursor:default; opacity:.45 */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn:not([data-orbit-registration-profile-guide="register"] *) { font: inherit; cursor: pointer; min-height: 44px;
  height: auto; gap: 0; letter-spacing: 0; white-space: normal; border-radius: 0; transition: none; user-select: auto; text-decoration: none; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn:not([data-orbit-registration-profile-guide="register"] *):disabled { cursor: default; opacity: .45; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn:not([data-orbit-registration-profile-guide="register"] *):active { transform: none; }
/* .portrait-link 原样：background transparent / border 0 / #4B4FC7 / 10px 8px / 13px（基类的 600 字重、44 定高、nowrap 去掉） */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn.portrait-link { background: transparent; border: 0; color: #4B4FC7; padding: 10px 8px; font-size: 13px; display: inline-block; font-weight: 400; }
/* .portrait-entry 原样：flex / space-between / 100% / #F1F1FA / 1px #E8E9F6 / r14 / 左对齐 / 14px / 16px 0 / gap 16 */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn.portrait-entry { display: flex; align-items: center; justify-content: space-between; width: 100%; background: #F1F1FA; border: 1px solid #E8E9F6; border-radius: 14px; text-align: left; padding: 14px; margin: 16px 0; gap: 16px; font-weight: 400; }
/* 取消报名确认框（role=alertdialog）的两个裸 .btn：工作区只给 button 通则，其余是浏览器默认外观 → all:revert 回到 UA 再补通则 */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a [role="alertdialog"] .btn:not([data-orbit-registration-profile-guide="register"] *) { all: revert; font: inherit; cursor: pointer; min-height: 44px; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a [role="alertdialog"] .btn:not([data-orbit-registration-profile-guide="register"] *):disabled { cursor: default; opacity: .45; }
/* 659 单选卡（roles）：外圈 20px / 2px 边 #C9CBEA→#4B4FC7，内点 10px */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn[aria-pressed] { display: flex; align-items: center; gap: 8px; border: 0 !important; background: transparent !important; padding: 0 !important; font-size: 14px !important; color: #0E1225 !important; cursor: pointer; text-align: left;
  height: auto; min-height: 0; border-radius: 0 !important; font-weight: 400; letter-spacing: 0; line-height: normal; white-space: normal; transition: none; box-shadow: none; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn[aria-pressed]::before { content: ""; box-sizing: border-box; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #C9CBEA; flex-shrink: 0; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn[aria-pressed="true"]::before { border-color: #4B4FC7; background: radial-gradient(circle, #4B4FC7 0 5px, transparent 5.5px); }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn[aria-pressed]:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn[aria-pressed]:disabled { opacity: .45; }
/* 667 文本域（regGoal）：设计无计数器来源（工作区无 300 上限），计数器省略 */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a textarea { box-sizing: border-box; width: 100%; padding: 14px !important; border: 1px solid #DDDEFA !important; border-radius: 12px !important; font-size: 14px; line-height: 1.6; outline: none; resize: vertical; background: #FFFFFF !important; min-height: 0 !important; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a textarea:focus { border-color: #4B4FC7 !important; }
/* 669 提交报名：工作区自带 portrait-primary（确认报名 / 下一题 / 生成画像 / 保存画像）对齐设计提交钮；设计「取消」钮省略（关闭 = ×/Esc/遮罩） */
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn.portrait-primary { padding: 14px; border: 0; border-radius: 12px; background: #2E3270; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer;
  flex: 1; height: auto; min-height: 0; gap: 0; letter-spacing: 0; line-height: normal; white-space: nowrap; transition: none; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn.portrait-primary:hover { background: #0E1225; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn.portrait-primary:active { transform: none; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a .btn.portrait-primary:disabled { opacity: .5; cursor: default; }
[data-orbit-real-page="events-0918"] .ev-reg-body .registration-portrait-7a > footer { gap: 14px; padding-top: 6px; border-top: 1px solid #E8E9F6; }
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
