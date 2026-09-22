/**
 * 运营台（Orbit_0918）壳：活动中心页头（hub 头）+ 运营台共用头部（面包屑 / 标题 / 「查看活动页面 →」「更多 ⌄」/ 六页签）
 * + 全部 op-* 样式 + toast + 抽屉挂载点。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Events 运营台.dc.html 第 43 行（<main>）、47–69 行（hub 头 / 页签 / 搜索）、
 * 94–111 行（运营台头部）、477–479 行（toast）。顶栏由 page.tsx 挂 AccountTopNav，不在壳内。
 */
"use client";

import type { ReactNode } from "react";

import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import {
  consoleTitle,
  eventPagePath,
  HUB_TABS,
  OPS_TABS,
  rolesDrawerHref,
  TITLES,
  type HubTab,
  type OpsView,
} from "./ops-model";

export function OpsToast({ text }: { text: string }) {
  if (!text) return null;
  return <div className="op-toast" role="status">{text}</div>;
}

/** 活动中心页头（设计 48–69）：标题 / 「当前身份」chip / hubTabs / 搜索。 */
export function OpsHubHead({
  roleLabel,
  activeTab,
  onTab,
  query,
  onQuery,
}: {
  roleLabel?: string | null;
  activeTab: HubTab;
  onTab: (next: HubTab) => void;
  query: string;
  onQuery: (next: string) => void;
}) {
  return (
    <>
      <div className="op-hub-head">
        <div className="op-hub-copy">
          <h1 className="op-hub-h1">活动中心</h1>
          <p className="op-hub-sub">管理你负责的活动。</p>
        </div>
        {roleLabel ? (
          <div className="op-identity" data-ops-identity>
            <span className="op-identity-icon">⚇</span>
            <span className="op-identity-copy">
              <strong className="op-identity-title">{`当前身份：${roleLabel}`}</strong>
              <span className="op-identity-note">仅展示你有权限操作的活动。</span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="op-hub-bar">
        <div className="op-hub-tabs" role="tablist">
          {HUB_TABS.map((tab) => {
            const on = tab.key === activeTab;
            return (
              <button
                aria-selected={on}
                className={`btn op-tab ${on ? "op-tab-on" : "op-tab-off"}`}
                key={tab.key}
                onClick={() => onTab(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="op-search">
          <span className="op-search-icon">⌕</span>
          <input
            aria-label="搜索活动"
            className="op-search-input"
            onChange={(event) => onQuery(event.target.value)}
            placeholder="搜索活动名称、地点或关键词…"
            value={query}
          />
        </span>
      </div>
    </>
  );
}

/**
 * 运营台共用头部 + 六页签（设计 94–111）。页签是路由链接；「更多 ⌄」进 `?drawer=roles`（抽屉本体任务 6，
 * 导出 CSV 等更多动作之后也挂这里）。`drawer` 为抽屉挂载点。
 */
export interface OpsMoreItem {
  href: string;
  label: string;
  /** 既有测试 / 深链断言的 `data-*` 标记（如 `data-event-roles-entry`）。 */
  marker?: string;
}

/**
 * 审阅修订 5：导出 CSV 等既有头部动作收进「更多 ⌄」。传入 `more` 时「更多 ⌄」变为 `<details>` 菜单
 * （闭合态外观与设计 101 行按钮一致；展开菜单沿用 hub「···」的 `op-menu` 口径）；不传时保持设计原样
 * （直接进 `?drawer=roles`，抽屉任务 6）。
 */
export function OpsConsoleShell({
  event,
  view,
  children,
  drawer,
  toast,
  more,
}: {
  event: EventOperationsPageEvent;
  view: OpsView;
  children: ReactNode;
  drawer?: ReactNode;
  toast?: string;
  more?: readonly OpsMoreItem[];
}) {
  const copy = TITLES[view];
  return (
    <main className="op-main" data-ops-view={view}>
      <style>{OPS_STYLES}</style>
      <div className="op-console">
        <span className="op-crumb">
          <a className="op-crumb-link" href="/app/events/center">活动中心</a>
          {" / "}
          <a className="op-crumb-link" href={OPS_TABS[0].href(event.id)}>{event.title}</a>
          {" / "}
          <a className="op-crumb-link" href={OPS_TABS[0].href(event.id)}>运营台</a>
          {" / "}
          {copy.crumb}
        </span>

        <div className="op-head">
          <div className="op-head-copy">
            <h1 className="op-h1">{consoleTitle(view, event.title)}</h1>
            <p className="op-sub">{copy.sub}</p>
          </div>
          <div className="op-head-actions">
            <a className="btn op-btn-dark" href={eventPagePath(event.id)}>查看活动页面 →</a>
            {more ? (
              <details className="op-head-more">
                <summary className="btn op-btn-ghost op-head-more-summary" data-ops-more>更多 ⌄</summary>
                <div className="op-menu" role="menu">
                  {more.map((item) => (
                    <a
                      className="op-menu-item"
                      href={item.href}
                      key={item.href}
                      role="menuitem"
                      {...(item.marker ? { [item.marker]: true } : {})}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </details>
            ) : (
              <a className="btn op-btn-ghost" data-ops-more href={rolesDrawerHref(event.id)}>更多 ⌄</a>
            )}
          </div>
        </div>

        <div className="op-tabs" role="tablist">
          {OPS_TABS.map((tab) => {
            const on = tab.key === view;
            return (
              <a
                aria-current={on ? "page" : undefined}
                className={`op-tab ${on ? "op-tab-on" : "op-tab-off"}`}
                href={tab.href(event.id)}
                key={tab.key}
                role="tab"
              >
                {tab.label}
              </a>
            );
          })}
        </div>

        {children}
      </div>
      {toast ? <OpsToast text={toast} /> : null}
      {drawer}
    </main>
  );
}

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。前缀 [data-orbit-real-page="ops-0918"]。
export const OPS_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
[data-orbit-real-page="ops-0918"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip; }
[data-orbit-real-page="ops-0918"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="ops-0918"] a:hover { color: #0E1225; }
[data-orbit-real-page="ops-0918"] input, [data-orbit-real-page="ops-0918"] textarea, [data-orbit-real-page="ops-0918"] button, [data-orbit-real-page="ops-0918"] select { font-family: inherit; }
[data-orbit-real-page="ops-0918"] input::placeholder, [data-orbit-real-page="ops-0918"] textarea::placeholder { color: #9FA3C4; }
/* ── <main>（设计稿 43 行）── */
[data-orbit-real-page="ops-0918"] .op-main { max-width: 1240px; margin: 0 auto; padding: 14px 40px 72px; display: flex; flex-direction: column; gap: 24px; }
/* ── 活动中心（设计稿 47–69 行）── */
[data-orbit-real-page="ops-0918"] .op-hub { display: flex; flex-direction: column; gap: 26px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="ops-0918"] .op-hub-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="ops-0918"] .op-hub-copy { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-hub-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(32px, 3.8vw, 44px); letter-spacing: -0.03em; }
[data-orbit-real-page="ops-0918"] .op-hub-sub { margin: 0; font-size: 16px; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .op-identity { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; max-width: 400px; }
[data-orbit-real-page="ops-0918"] .op-identity-icon { width: 40px; height: 40px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="ops-0918"] .op-identity-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="ops-0918"] .op-identity-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-identity-note { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-hub-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #E8E9F6; }
[data-orbit-real-page="ops-0918"] .op-hub-tabs { display: flex; gap: 28px; }
[data-orbit-real-page="ops-0918"] .op-tab { padding: 0 0 14px; border: 0; border-bottom: 2px solid transparent; background: transparent; cursor: pointer;
  /* 设计稿页签是 button 且显式 font-size:15px，渲染结果 15px，直接对齐 */
  font-size: 15px; line-height: normal; }
[data-orbit-real-page="ops-0918"] .btn.op-tab { padding: 0 0 14px; border: 0; border-bottom: 2px solid transparent; background: transparent; font-size: 15px;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; border-radius: 0; transition: none; }
[data-orbit-real-page="ops-0918"] .btn.op-tab:active { transform: none; }
[data-orbit-real-page="ops-0918"] .op-tab-on, [data-orbit-real-page="ops-0918"] .btn.op-tab-on { border-bottom-color: #0E1225; color: #0E1225; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-tab-off, [data-orbit-real-page="ops-0918"] .btn.op-tab-off { color: #6B6F99; font-weight: 400; }
/* 运营台页签是 <a>：中和页面级 a:hover 变色（设计 button 页签无 hover） */
[data-orbit-real-page="ops-0918"] .op-tab-off:hover { color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-tab-on:hover { color: #0E1225; }
[data-orbit-real-page="ops-0918"] .op-search { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 10px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; min-width: 280px; }
[data-orbit-real-page="ops-0918"] .op-search-icon { color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-search-input { flex: 1; min-width: 0; border: 0; border-radius: 0; outline: none; background: transparent; font-size: 13px; color: #0E1225;
  /* 设计 input 保留 Chrome 默认 padding 1px 2px；基类 reset（orbit-reference-styles.tsx:34–50）清成 0，这里补回 */
  padding: 1px 2px; }
/* ── 活动卡（设计稿 71–89 行）── */
[data-orbit-real-page="ops-0918"] .op-card { display: grid; grid-template-columns: 150px minmax(0, 1.5fr) repeat(3, minmax(0, 72px)) 150px; gap: 22px; align-items: center; padding: 20px; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .op-cover { position: relative; overflow: hidden; height: 104px; border: 0; border-radius: 12px; color: #FFFFFF; display: flex; align-items: flex-end; padding: 12px; font-size: 14px; font-weight: 500; line-height: 1.3; }
[data-orbit-real-page="ops-0918"] .op-cover-text { position: relative; z-index: 1; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; overflow-wrap: anywhere; }
[data-orbit-real-page="ops-0918"] .op-card-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-card-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-card-title { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; overflow-wrap: anywhere; }
[data-orbit-real-page="ops-0918"] .op-chip { padding: 5px 12px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page="ops-0918"] .op-card-desc { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-card-meta { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .op-count { display: flex; flex-direction: column; gap: 6px; padding-left: 20px; border-left: 1px solid #F1F1FA; }
[data-orbit-real-page="ops-0918"] .op-count-label { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-count-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; }
[data-orbit-real-page="ops-0918"] .op-card-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
[data-orbit-real-page="ops-0918"] .btn.op-cta { padding: 13px 18px; border: 1px solid transparent; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer;
  /* background / color / border-color 按 HUB_CTA_TONE 内联；覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="ops-0918"] .btn.op-cta:hover { opacity: 0.88; }
[data-orbit-real-page="ops-0918"] .btn.op-cta:active { transform: none; }
[data-orbit-real-page="ops-0918"] .btn.op-cta[aria-disabled="true"] { cursor: default; opacity: 0.6; }
[data-orbit-real-page="ops-0918"] .op-more { position: relative; text-align: center; color: #9FA3C4; letter-spacing: 2px; }
[data-orbit-real-page="ops-0918"] .op-more-summary { list-style: none; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .op-more-summary::-webkit-details-marker { display: none; }
/* 设计只画了「···」，展开菜单本身设计稿没有：沿用卡片描边 / 圆角 / 阴影口径 */
[data-orbit-real-page="ops-0918"] .op-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 150px; display: flex; flex-direction: column; padding: 6px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; box-shadow: 0 12px 32px rgba(59,63,122,0.12); letter-spacing: 0; text-align: left; }
[data-orbit-real-page="ops-0918"] .op-menu-item { display: block; padding: 10px 12px; border-radius: 8px; font-size: 13px; color: #3B3F7A; white-space: nowrap; }
[data-orbit-real-page="ops-0918"] .op-menu-item:hover { background: #F7F7FD; color: #0E1225; }
/* 设计稿无响应式声明；窄屏把六列卡片折成单列（1240 宽度下不生效） */
@media (max-width: 900px) {
  [data-orbit-real-page="ops-0918"] .op-main { padding: 14px 16px 72px; }
  [data-orbit-real-page="ops-0918"] .op-card { grid-template-columns: 1fr; }
  [data-orbit-real-page="ops-0918"] .op-count { padding-left: 0; border-left: 0; }
}
/* ── 提示条（设计稿无：加载 / 错误 / 空态；沿用卡片口径与设计错误色 #FBECEA/#B5473A）── */
[data-orbit-real-page="ops-0918"] .op-note { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-note-error { border-color: #FBECEA; background: #FBECEA; color: #B5473A; }
[data-orbit-real-page="ops-0918"] .op-note-title { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; color: #0E1225; }
[data-orbit-real-page="ops-0918"] .op-note-copy { display: flex; flex-direction: column; gap: 6px; }
/* ── 运营台共用头部（设计稿 94–111 行）── */
[data-orbit-real-page="ops-0918"] .op-console { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="ops-0918"] .op-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-crumb-link { color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="ops-0918"] .op-head-copy { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(30px, 3.6vw, 42px); letter-spacing: -0.03em; }
[data-orbit-real-page="ops-0918"] .op-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .op-head-actions { display: flex; gap: 12px; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-dark { padding: 13px 20px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-dark:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-dark:active { transform: none; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-dark:disabled { cursor: default; opacity: 0.6; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-ghost { padding: 13px 20px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; transition: none; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-ghost:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-ghost:active { transform: none; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-ghost:disabled { cursor: default; opacity: 0.6; }
[data-orbit-real-page="ops-0918"] .op-tabs { display: flex; gap: 30px; flex-wrap: wrap; border-bottom: 1px solid #E8E9F6; }
/* 「更多 ⌄」菜单（审阅修订 5）：summary 复用 op-btn-ghost 外观；展开层沿用 op-menu */
[data-orbit-real-page="ops-0918"] .op-head-more { position: relative; }
[data-orbit-real-page="ops-0918"] .op-head-more-summary { list-style: none; }
[data-orbit-real-page="ops-0918"] .op-head-more-summary::-webkit-details-marker { display: none; }
[data-orbit-real-page="ops-0918"] .op-head-more > .op-menu { top: calc(100% + 6px); }
/* ── toast（设计稿 477–479 行）── */
[data-orbit-real-page="ops-0918"] .op-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 200; padding: 12px 22px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 14px; box-shadow: 0 18px 40px rgba(14,18,37,0.25); }
/* ── 概览（设计稿 115–164 行）── */
[data-orbit-real-page="ops-0918"] .op-screen { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="ops-0918"] .op-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-stat { display: flex; align-items: center; gap: 16px; padding: 22px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .op-stat-soft { background: #F7F7FD; }
[data-orbit-real-page="ops-0918"] .op-stat-icon { width: 46px; height: 46px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 18px; }
[data-orbit-real-page="ops-0918"] .op-stat-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="ops-0918"] .op-stat-label { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-stat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 30px; letter-spacing: -0.02em; }
[data-orbit-real-page="ops-0918"] .op-stat-n-status { font-size: 24px; }
[data-orbit-real-page="ops-0918"] .op-ops-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
[data-orbit-real-page="ops-0918"] .op-progress { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 26px; }
[data-orbit-real-page="ops-0918"] .op-sec-head { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="ops-0918"] .op-sec-title-22 { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
[data-orbit-real-page="ops-0918"] .op-sec-title-20 { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page="ops-0918"] .op-sec-sub { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-steps { display: grid; grid-template-columns: repeat(5, 1fr); align-items: start; }
[data-orbit-real-page="ops-0918"] .op-step { display: flex; flex-direction: column; align-items: center; gap: 14px; position: relative; }
[data-orbit-real-page="ops-0918"] .op-step-rail { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; height: 26px; }
[data-orbit-real-page="ops-0918"] .op-step-line-l { position: absolute; left: 0; right: 50%; top: 12px; height: 2px; }
[data-orbit-real-page="ops-0918"] .op-step-line-r { position: absolute; left: 50%; right: 0; top: 12px; height: 2px; }
[data-orbit-real-page="ops-0918"] .op-step-dot { position: relative; width: 26px; height: 26px; border-radius: 50%; border: 2px solid; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="ops-0918"] .op-step-label { font-size: 14px; text-align: center; }
[data-orbit-real-page="ops-0918"] .op-step-meta { font-size: 12px; text-align: center; }
[data-orbit-real-page="ops-0918"] .op-actions { display: flex; flex-wrap: wrap; gap: 14px; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-primary-lg { padding: 14px 22px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-primary-lg:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-ghost-lg { padding: 14px 22px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; font-weight: 400; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-ghost-lg:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="ops-0918"] .op-hint { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-side { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="ops-0918"] .op-config { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="ops-0918"] .op-config-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-edit { padding: 9px 14px; border: 1px solid #DDDEFA; border-radius: 9px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; font-weight: 400; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-edit:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="ops-0918"] .op-config-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; }
[data-orbit-real-page="ops-0918"] .op-config-key { display: flex; align-items: center; gap: 10px; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .op-config-ico { color: #4B4FC7; }
[data-orbit-real-page="ops-0918"] .op-config-val { font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-todo { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-todo-row { display: flex; align-items: center; gap: 12px; }
[data-orbit-real-page="ops-0918"] .op-todo-ico { width: 30px; height: 30px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="ops-0918"] .op-todo-warn { background: #FBF1E4; color: #9A6B22; }
[data-orbit-real-page="ops-0918"] .op-todo-info { background: #ECEEFB; color: #4B4FC7; }
[data-orbit-real-page="ops-0918"] .op-todo-text { flex: 1; min-width: 0; font-size: 14px; }
[data-orbit-real-page="ops-0918"] .btn.op-link-btn { padding: 0; border: 0; background: transparent; color: #4B4FC7; font-size: 13px; font-weight: 400; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .btn.op-link-btn:hover { color: #2E3270; }
/* ── 匹配与分组（设计稿 166–209 行）── */
[data-orbit-real-page="ops-0918"] .op-mstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-mstat { display: flex; align-items: center; gap: 16px; padding: 20px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .op-mstat-icon { width: 44px; height: 44px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="ops-0918"] .op-mstat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; }
[data-orbit-real-page="ops-0918"] .op-mstat-unit { font-size: 14px; font-family: 'Noto Sans SC'; font-weight: 400; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-rounds { display: flex; gap: 8px; padding: 6px; border-radius: 12px; background: #F7F7FD; align-self: flex-start; }
[data-orbit-real-page="ops-0918"] .btn.op-round { padding: 11px 28px; border: 0; border-radius: 9px; font-size: 14px; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .op-tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 1fr)); gap: 18px; }
[data-orbit-real-page="ops-0918"] .op-table { border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="ops-0918"] .op-table-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-table-name { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-table-ico { color: #4B4FC7; }
[data-orbit-real-page="ops-0918"] .op-table-title { font-size: 16px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-table-count { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-seats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-seat { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: #F7F7FD; }
[data-orbit-real-page="ops-0918"] .op-seat-ava { width: 30px; height: 30px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-seat-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-seat-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="ops-0918"] .op-seat-role { font-size: 11px; color: #6B6F99; }
/* 桌卡详情（审阅修订 5：theme / rationale / icebreakers / seat；设计无，沿用桌卡字号口径） */
[data-orbit-real-page="ops-0918"] .op-table-theme { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .op-table-rationale { font-size: 12px; color: #6B6F99; line-height: 1.55; }
[data-orbit-real-page="ops-0918"] .op-ice summary { cursor: pointer; font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-ice ol { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: #3B3F7A; line-height: 1.6; }
[data-orbit-real-page="ops-0918"] .op-warn { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border: 1px solid #F0E2C6; border-radius: 14px; background: #FDF8EF; }
[data-orbit-real-page="ops-0918"] .op-warn-ico { width: 30px; height: 30px; flex: none; border-radius: 50%; background: #F5E3C2; color: #9A6B22; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="ops-0918"] .op-warn-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="ops-0918"] .op-warn-title { font-size: 14px; font-weight: 500; color: #6B4B12; }
[data-orbit-real-page="ops-0918"] .op-warn-sub { font-size: 13px; color: #9A6B22; }
[data-orbit-real-page="ops-0918"] .op-warn-link { border: 0; background: transparent; color: #9A6B22; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .op-warn-link:hover { color: #6B4B12; }
[data-orbit-real-page="ops-0918"] .op-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 14px; }
[data-orbit-real-page="ops-0918"] .op-foot-hint { flex: 1; min-width: 200px; font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-publish { padding: 13px 22px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-publish:hover { background: #2E3270; color: #FFFFFF; }
/* 中和 .btn 基类（orbit-reference-styles.tsx:594–611）：本屏全部按钮类 */
[data-orbit-real-page="ops-0918"] .btn.op-btn-primary-lg, [data-orbit-real-page="ops-0918"] .btn.op-btn-ghost-lg, [data-orbit-real-page="ops-0918"] .btn.op-btn-edit, [data-orbit-real-page="ops-0918"] .btn.op-link-btn, [data-orbit-real-page="ops-0918"] .btn.op-round, [data-orbit-real-page="ops-0918"] .btn.op-warn-link, [data-orbit-real-page="ops-0918"] .btn.op-btn-publish, [data-orbit-real-page="ops-0918"] .btn.op-btn-sm, [data-orbit-real-page="ops-0918"] .btn.op-head-more-summary { height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-primary-lg:active, [data-orbit-real-page="ops-0918"] .btn.op-btn-ghost-lg:active, [data-orbit-real-page="ops-0918"] .btn.op-btn-edit:active, [data-orbit-real-page="ops-0918"] .btn.op-link-btn:active, [data-orbit-real-page="ops-0918"] .btn.op-round:active, [data-orbit-real-page="ops-0918"] .btn.op-warn-link:active, [data-orbit-real-page="ops-0918"] .btn.op-btn-publish:active, [data-orbit-real-page="ops-0918"] .btn.op-btn-sm:active, [data-orbit-real-page="ops-0918"] .btn.op-head-more-summary:active { transform: none; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-primary-lg:disabled, [data-orbit-real-page="ops-0918"] .btn.op-btn-ghost-lg:disabled, [data-orbit-real-page="ops-0918"] .btn.op-btn-publish:disabled, [data-orbit-real-page="ops-0918"] .btn.op-link-btn:disabled, [data-orbit-real-page="ops-0918"] .btn.op-btn-sm:disabled { cursor: default; opacity: 0.6; }
/* ── 参会者（设计稿 211–251 行）── */
[data-orbit-real-page="ops-0918"] .op-pbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-pfilters { display: flex; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page="ops-0918"] .btn.op-pfilter { padding: 11px 20px; border: 1px solid transparent; border-radius: 999px; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .op-psearch { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; min-width: 300px; }
[data-orbit-real-page="ops-0918"] .op-pgrid { display: grid; grid-template-columns: minmax(0, 2.4fr) minmax(240px, 1fr); gap: 20px; align-items: start; }
[data-orbit-real-page="ops-0918"] .op-plist { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 8px 24px; }
[data-orbit-real-page="ops-0918"] .op-prow { display: grid; grid-template-columns: 56px minmax(0, 1fr) 110px 110px 120px; gap: 18px; align-items: center; padding: 18px 0; border-bottom: 1px solid #F1F1FA; }
[data-orbit-real-page="ops-0918"] .op-pava { width: 56px; height: 56px; border-radius: 50%; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-pname { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-pname-main { font-size: 16px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-porg { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-pcol { display: flex; flex-direction: column; gap: 7px; }
[data-orbit-real-page="ops-0918"] .op-plabel { font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-pchip { align-self: flex-start; padding: 5px 12px; border-radius: 999px; font-size: 12px; }
[data-orbit-real-page="ops-0918"] .btn.op-pdetail { padding: 11px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer; font-weight: 400; }
[data-orbit-real-page="ops-0918"] .btn.op-pdetail:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="ops-0918"] .op-pside { display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-pstats { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="ops-0918"] .op-pstat { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="ops-0918"] .op-pstat-next { padding-top: 18px; border-top: 1px solid #F1F1FA; }
[data-orbit-real-page="ops-0918"] .op-pstat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 30px; }
[data-orbit-real-page="ops-0918"] .op-ptip { border: 1px solid #E8E9F6; border-radius: 18px; background: #F7F7FD; padding: 20px; display: flex; gap: 12px; align-items: flex-start; }
[data-orbit-real-page="ops-0918"] .op-ptip-ico { color: #4B4FC7; }
[data-orbit-real-page="ops-0918"] .op-ptip-copy { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="ops-0918"] .op-ptip-title { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-ptip-sub { font-size: 13px; color: #3B3F7A; }
/* 表格空行 / 行下详情（设计无：沿用行内边距） */
[data-orbit-real-page="ops-0918"] .op-prow-empty { padding: 18px 0; }
[data-orbit-real-page="ops-0918"] .op-prow-detail { padding: 0 0 18px; border-bottom: 1px solid #F1F1FA; }
/* ── 准入队列 + 申请详情（设计无：旧 event-admission-review-workspace 语义，沿用附加区 op-* 口径）── */
[data-orbit-real-page="ops-0918"] .op-alert-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="ops-0918"] .op-queue-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 390px), 1fr)); align-items: start; }
[data-orbit-real-page="ops-0918"] .op-queue { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-queue-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="ops-0918"] .btn.op-applicant { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; cursor: pointer; white-space: normal; }
[data-orbit-real-page="ops-0918"] .btn.op-applicant:hover { border-color: #B9BCEB; }
[data-orbit-real-page="ops-0918"] .btn.op-applicant.op-applicant-on { border-color: #4B4FC7; background: #F7F7FD; }
[data-orbit-real-page="ops-0918"] .btn.op-applicant:disabled { cursor: default; opacity: 0.6; }
[data-orbit-real-page="ops-0918"] .op-applicant-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
[data-orbit-real-page="ops-0918"] .op-applicant-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page="ops-0918"] .op-applicant-meta { font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-detail { border: 1px solid #E8E9F6; border-radius: 16px; background: #F7F7FD; padding: 20px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-detail-head { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="ops-0918"] .op-detail-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
[data-orbit-real-page="ops-0918"] .op-detail-sec { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-detail-title { font-size: 15px; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-detail-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
[data-orbit-real-page="ops-0918"] .op-detail-field { border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="ops-0918"] .op-detail-field-label { font-size: 13px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-detail-field-answer { margin: 0; font-size: 13px; color: #3B3F7A; white-space: pre-wrap; }
[data-orbit-real-page="ops-0918"] .op-detail-actions { border-top: 1px solid #E8E9F6; display: flex; flex-wrap: wrap; gap: 10px; padding-top: 16px; }
/* ── 签到（设计稿 253–298 行）── */
[data-orbit-real-page="ops-0918"] .op-cstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-cstat { display: flex; align-items: center; gap: 16px; padding: 20px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .op-cstat-ico { width: 44px; height: 44px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="ops-0918"] .op-cstat-ico-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page="ops-0918"] .op-cstat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 28px; }
[data-orbit-real-page="ops-0918"] .op-cnote { display: flex; align-items: flex-start; gap: 14px; padding: 20px; border: 1px solid #E8E9F6; border-radius: 16px; background: #F7F7FD; }
[data-orbit-real-page="ops-0918"] .op-cnote-ico { width: 38px; height: 38px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="ops-0918"] .op-cnote-copy { display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page="ops-0918"] .op-cnote-title { font-size: 13px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-cnote-sub { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-cgrid { display: grid; grid-template-columns: minmax(0, 2.4fr) minmax(260px, 1fr); gap: 20px; align-items: start; }
[data-orbit-real-page="ops-0918"] .op-ctable { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-cbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; }
[data-orbit-real-page="ops-0918"] .op-csearch { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; min-width: 260px; }
[data-orbit-real-page="ops-0918"] .op-cbar-tools { display: flex; align-items: center; gap: 12px; }
[data-orbit-real-page="ops-0918"] .op-cfilters { display: flex; gap: 6px; padding: 5px; border-radius: 10px; background: #F7F7FD; }
/* 「刷新名单」设计无（旧名单手动刷新保留）：取设计 232 行 ghost 按钮 */
[data-orbit-real-page="ops-0918"] .btn.op-crefresh { padding: 11px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="ops-0918"] .btn.op-crefresh:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="ops-0918"] .btn.op-cfilter { padding: 9px 18px; border: 0; border-radius: 8px; font-size: 13px; cursor: pointer; }
/* 设计五列 minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1fr) 110px 120px：「公司 / 职位」「票种 / 分组」无来源 → 三列 */
[data-orbit-real-page="ops-0918"] .op-chead { display: grid; grid-template-columns: minmax(0, 1fr) 110px 120px; gap: 14px; padding: 0 4px 12px; border-bottom: 1px solid #E8E9F6; font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-chead-center { text-align: center; }
[data-orbit-real-page="ops-0918"] .op-crow { display: grid; grid-template-columns: minmax(0, 1fr) 110px 120px; gap: 14px; align-items: center; padding: 14px 4px; border-bottom: 1px solid #F1F1FA; }
[data-orbit-real-page="ops-0918"] .op-cperson { display: flex; align-items: center; gap: 12px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-cava { width: 34px; height: 34px; flex: none; border-radius: 50%; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-cname { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-cchip { align-self: center; justify-self: start; padding: 5px 12px; border-radius: 999px; font-size: 12px; }
[data-orbit-real-page="ops-0918"] .btn.op-cact { padding: 11px 12px; border: 1px solid transparent; border-radius: 9px; font-size: 13px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .btn.op-cact:hover { opacity: 0.88; }
[data-orbit-real-page="ops-0918"] .op-clatest { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="ops-0918"] .op-clatest-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-clatest-title { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; }
[data-orbit-real-page="ops-0918"] .btn.op-clatest-all { border: 0; background: transparent; color: #4B4FC7; font-size: 13px; cursor: pointer; padding: 0; font-weight: 400; }
[data-orbit-real-page="ops-0918"] .op-litem { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #F1F1FA; }
[data-orbit-real-page="ops-0918"] .op-lava { width: 38px; height: 38px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-lcopy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
[data-orbit-real-page="ops-0918"] .op-lname { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .op-ltime { font-size: 13px; color: #6B6F99; }
/* 中和 .btn 基类（orbit-reference-styles.tsx:594–611）：参会者 / 签到屏按钮类 */
[data-orbit-real-page="ops-0918"] .btn.op-pfilter, [data-orbit-real-page="ops-0918"] .btn.op-pdetail, [data-orbit-real-page="ops-0918"] .btn.op-applicant, [data-orbit-real-page="ops-0918"] .btn.op-cfilter, [data-orbit-real-page="ops-0918"] .btn.op-cact, [data-orbit-real-page="ops-0918"] .btn.op-crefresh, [data-orbit-real-page="ops-0918"] .btn.op-clatest-all { height: auto; gap: 0; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="ops-0918"] .btn.op-pfilter, [data-orbit-real-page="ops-0918"] .btn.op-pdetail, [data-orbit-real-page="ops-0918"] .btn.op-cfilter, [data-orbit-real-page="ops-0918"] .btn.op-cact, [data-orbit-real-page="ops-0918"] .btn.op-crefresh, [data-orbit-real-page="ops-0918"] .btn.op-clatest-all { display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; text-align: center; }
[data-orbit-real-page="ops-0918"] .btn.op-pfilter:active, [data-orbit-real-page="ops-0918"] .btn.op-pdetail:active, [data-orbit-real-page="ops-0918"] .btn.op-applicant:active, [data-orbit-real-page="ops-0918"] .btn.op-cfilter:active, [data-orbit-real-page="ops-0918"] .btn.op-cact:active, [data-orbit-real-page="ops-0918"] .btn.op-crefresh:active, [data-orbit-real-page="ops-0918"] .btn.op-clatest-all:active { transform: none; }
[data-orbit-real-page="ops-0918"] .btn.op-pdetail:disabled, [data-orbit-real-page="ops-0918"] .btn.op-cact:disabled { opacity: 1; }
[data-orbit-real-page="ops-0918"] .btn.op-pdetail:disabled { cursor: default; color: #9FA3C4; border-color: #F1F1FA; }
[data-orbit-real-page="ops-0918"] .btn.op-crefresh:disabled { cursor: default; opacity: 0.6; }
@media (max-width: 860px) {
  [data-orbit-real-page="ops-0918"] .op-pgrid, [data-orbit-real-page="ops-0918"] .op-cgrid { grid-template-columns: 1fr; }
  [data-orbit-real-page="ops-0918"] .op-prow { grid-template-columns: 56px minmax(0, 1fr); row-gap: 10px; }
}
/* ── 既有运营能力附加区（设计无：生成列表 / 配置折叠 / 签到链接 / 名片审计；沿用旧运营台 ops-* 口径改 op-* 前缀。op-dir-id 供参会者屏申请卡 / 访谈元信息复用）── */
[data-orbit-real-page="ops-0918"] .op-alert { border: 1px solid #FBECEA; background: #FBECEA; color: #B5473A; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
[data-orbit-real-page="ops-0918"] .op-notice { border: 1px solid #DDDEFA; background: #ECEEFB; color: #2E3270; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
[data-orbit-real-page="ops-0918"] .op-extra { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="ops-0918"] .op-extra-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="ops-0918"] .op-extra-head > div { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
[data-orbit-real-page="ops-0918"] .op-eyebrow { font-size: 10px; letter-spacing: .14em; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page="ops-0918"] .op-copy { margin: 0; font-size: 13px; color: #6B6F99; line-height: 1.6; }
[data-orbit-real-page="ops-0918"] .op-empty { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-empty-dashed { border: 1px dashed #DDDEFA; border-radius: 12px; padding: 16px; }
[data-orbit-real-page="ops-0918"] .op-fold > summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="ops-0918"] .op-fold > summary::-webkit-details-marker { display: none; }
[data-orbit-real-page="ops-0918"] .op-fold-body { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
[data-orbit-real-page="ops-0918"] .op-confirm { border: 1px solid #DDDEFA; border-radius: 14px; background: #F7F7FD; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-confirm-actions { display: flex; gap: 8px; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-sm { padding: 10px 14px; font-size: 13px; border-radius: 9px; border: 1px solid transparent; cursor: pointer; font-weight: 400; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-sm.op-dark { background: #0E1225; border-color: #0E1225; color: #FFFFFF; font-weight: 500; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-sm.op-dark:hover { background: #2E3270; border-color: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-sm.op-ghost { background: #FFFFFF; border-color: #DDDEFA; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .btn.op-btn-sm.op-ghost:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="ops-0918"] .op-gen { border: 1px solid #E8E9F6; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-gen-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="ops-0918"] .op-gen-snapshot { font-size: 11px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-top: 5px; }
[data-orbit-real-page="ops-0918"] .op-gen-progress { display: grid; gap: 8px; }
[data-orbit-real-page="ops-0918"] .op-gen-eta { font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="ops-0918"] .op-gen-attention { color: #9A6B22; font-size: 12px; }
[data-orbit-real-page="ops-0918"] .op-gen-error { color: #B5473A; font-size: 12px; }
[data-orbit-real-page="ops-0918"] .op-gen-error-detail { color: #6B6F99; margin-top: 3px; }
[data-orbit-real-page="ops-0918"] .op-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: #F1F1FA; color: #6B6F99; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page="ops-0918"] .op-pill-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page="ops-0918"] .op-pill-red { background: #FBECEA; color: #B5473A; }
[data-orbit-real-page="ops-0918"] .op-pill-purple { background: #ECEEFB; color: #4B4FC7; }
[data-orbit-real-page="ops-0918"] .op-progress-track { background: #ECEEFB; border-radius: 999px; height: 6px; overflow: hidden; }
[data-orbit-real-page="ops-0918"] .op-progress-bar { background: linear-gradient(90deg, #4B4FC7, #8A8EE0); border-radius: 999px; height: 100%; transition: width .6s ease; }
[data-orbit-real-page="ops-0918"] .op-form-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); }
[data-orbit-real-page="ops-0918"] .op-field-label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #3B3F7A; }
[data-orbit-real-page="ops-0918"] .op-field-key { margin-left: 6px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
[data-orbit-real-page="ops-0918"] .op-field { padding: 12px 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; font-size: 14px; font-family: inherit; color: #0E1225; outline: none; }
[data-orbit-real-page="ops-0918"] .op-field:focus { border-color: #4B4FC7; }
[data-orbit-real-page="ops-0918"] .op-field[readonly] { background: #F7F7FD; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-advanced summary { cursor: pointer; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="ops-0918"] .op-advanced > div { margin-top: 12px; }
[data-orbit-real-page="ops-0918"] .op-timeline { border-top: 1px solid #E8E9F6; padding-top: 18px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-timeline-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
[data-orbit-real-page="ops-0918"] .op-gate { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid #E8E9F6; border-radius: 10px; padding: 11px; }
[data-orbit-real-page="ops-0918"] .op-gate-name { font-size: 12px; font-weight: 700; }
[data-orbit-real-page="ops-0918"] .op-gate-at { font-size: 11px; color: #9FA3C4; margin-top: 3px; }
[data-orbit-real-page="ops-0918"] .op-checkin-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page="ops-0918"] .op-code { background: #F7F7FD; border-radius: 8px; flex: 1 1 320px; overflow-wrap: anywhere; padding: 10px 12px; font-size: 12px; }
[data-orbit-real-page="ops-0918"] .op-dir-id { font-size: 10px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page="ops-0918"] .op-audit-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid #F1F1FA; padding: 12px 0; font-size: 13px; }
@media (max-width: 860px) {
  [data-orbit-real-page="ops-0918"] .op-ops-grid { grid-template-columns: 1fr; }
  [data-orbit-real-page="ops-0918"] .op-steps { grid-template-columns: repeat(2, 1fr); row-gap: 18px; }
}
`;
