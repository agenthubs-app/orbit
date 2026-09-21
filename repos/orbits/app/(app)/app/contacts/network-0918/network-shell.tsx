/**
 * Network v2（Orbit_0918）人脉域壳：页头 + 四页签 + 全部 nw-* 样式。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Network v2.dc.html 第 44–65 行。
 */
"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";

export type NetworkScreen = "overview" | "pipeline" | "all" | "import" | "analysis";

const TABS: { key: NetworkScreen; href: string; zh: string; en: string }[] = [
  { key: "overview", href: "/app/contacts/dashboard", zh: "概览", en: "Overview" },
  { key: "pipeline", href: "/app/contacts/pipeline", zh: "关系管线", en: "Pipeline" },
  { key: "all", href: "/app/contacts", zh: "所有人脉", en: "All contacts" },
  { key: "import", href: "/app/contacts/new", zh: "导入人脉", en: "Import" },
];

export function NetworkAvatar({ initial, size = 40 }: { initial: string; size?: 40 | 44 | 56 | 64 }) {
  return <span className={`nw-avatar nw-avatar-${size}`}>{initial}</span>;
}

export function NetworkChip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span className="nw-chip" style={{ background: bg, color: fg }}>{children}</span>;
}

export function NetworkShell({ screen, total, children, modal }: { screen: NetworkScreen; total: number | null; children: ReactNode; modal?: ReactNode }) {
  const { t } = useOrbitLanguage();
  const isMain = screen !== "analysis";
  return (
    <main data-orbit-real-page="network" data-network-screen={screen} className="nw-main">
      <style>{NETWORK_STYLES}</style>
      {isMain ? (
        <>
          <div className="nw-head">
            <div className="nw-head-copy">
              <h1 className="nw-h1">{t({ en: "Network", zh: "人脉" })}</h1>
              <p className="nw-sub">{t({ en: "Understand your network and keep the relationships that matter moving.", zh: "理解你的人脉结构，把重要关系持续向前推进。" })}</p>
            </div>
            <div className="nw-head-actions">
              {screen === "all" ? (
                <a className="btn nw-btn-ghost" href="/app/contacts/new?method=scan">＋ {t({ en: "New contact", zh: "新建联系人" })}</a>
              ) : null}
              <a className="btn nw-btn-primary" href="/app/contacts/new">＋ {t({ en: "Import contacts", zh: "导入人脉" })}</a>
            </div>
          </div>
          <div className="nw-tabs">
            {TABS.map((tab) => (
              <a key={tab.key} className={`nw-tab ${screen === tab.key ? "nw-tab-on" : "nw-tab-off"}`} href={tab.href} aria-current={screen === tab.key ? "page" : undefined}>
                {t({ en: tab.en, zh: tab.zh })}
              </a>
            ))}
          </div>
        </>
      ) : null}
      {children}
      {modal}
    </main>
  );
}

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。
export const NETWORK_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
[data-orbit-real-page="network"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip; }
[data-orbit-real-page="network"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="network"] a:hover { color: #0E1225; }
[data-orbit-real-page="network"] input, [data-orbit-real-page="network"] textarea, [data-orbit-real-page="network"] button, [data-orbit-real-page="network"] select { font-family: inherit; }
[data-orbit-real-page="network"] input::placeholder, [data-orbit-real-page="network"] textarea::placeholder { color: #9FA3C4; }
[data-orbit-real-page="network"].nw-main { max-width: 1240px; margin: 0 auto; padding: 28px 40px 96px; display: flex; flex-direction: column; gap: 24px; }
[data-orbit-real-page="network"] .nw-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="network"] .nw-head-copy { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="network"] .nw-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
[data-orbit-real-page="network"] .nw-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-head-actions { display: flex; gap: 12px; }
[data-orbit-real-page="network"] .btn.nw-btn-ghost { padding: 13px 22px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #2E3270; font-size: 15px; font-weight: 500; line-height: normal; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; transition: none; }
[data-orbit-real-page="network"] .btn.nw-btn-ghost:hover { background: #ECEEFB; }
[data-orbit-real-page="network"] .btn.nw-btn-ghost:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-btn-primary { padding: 13px 22px; border: 0; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; line-height: normal; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; transition: none; }
[data-orbit-real-page="network"] .btn.nw-btn-primary:hover { background: #2E3270; }
[data-orbit-real-page="network"] .btn.nw-btn-primary:active { transform: none; }
[data-orbit-real-page="network"] .nw-tabs { display: flex; gap: 8px; border-bottom: 1px solid #E8E9F6; font-size: 15px; }
[data-orbit-real-page="network"] .nw-tab { padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; cursor: pointer; transition: color .2s;
  /* 设计稿页签是 button 元素，未继承 15px，按渲染结果 13.33px 对齐 */
  font-size: 13.3333px; }
[data-orbit-real-page="network"] .nw-tab-on { border-bottom-color: #0E1225; color: #0E1225; font-weight: 500; }
[data-orbit-real-page="network"] .nw-tab-off { color: #6B6F99; font-weight: 400; }
[data-orbit-real-page="network"] .nw-avatar { border-radius: 50%; background: #DDDEFA; color: #3B3F7A; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-avatar-40 { width: 40px; height: 40px; }
[data-orbit-real-page="network"] .nw-avatar-44 { width: 44px; height: 44px; }
[data-orbit-real-page="network"] .nw-avatar-56 { width: 56px; height: 56px; font-size: 22px; }
[data-orbit-real-page="network"] .nw-avatar-64 { width: 64px; height: 64px; font-size: 26px; font-family: 'Noto Serif SC', serif; font-weight: 900; }
[data-orbit-real-page="network"] .nw-chip { padding: 5px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 20px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="network"] .nw-card-head { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="network"] .nw-h2 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-card-hint { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-empty { padding: 40px; text-align: center; color: #9FA3C4; font-size: 14px; }
/* ── 所有人脉（设计稿 257–302 行）── */
[data-orbit-real-page="network"] .nw-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 14px; align-items: end; }
[data-orbit-real-page="network"] .nw-search { padding: 12px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; font-size: 14px; outline: none; }
[data-orbit-real-page="network"] .nw-search:focus { border-color: #4B4FC7; }
[data-orbit-real-page="network"] .nw-filter-label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-filter-box { display: flex; justify-content: space-between; padding: 12px 14px; border: 1px solid #DDDEFA; border-radius: 10px; font-size: 14px; color: #0E1225; }
[data-orbit-real-page="network"] .nw-filter-caret { font-size: 11px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-source-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); gap: 12px; }
[data-orbit-real-page="network"] .btn.nw-source-card { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid; border-radius: 14px; text-align: left; cursor: pointer; transition: all .2s;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；border-color/background 由内联 style 提供 */
  height: auto; display: flex; align-items: center; justify-content: normal; gap: 12px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; transition: all .2s; font-size: inherit; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-source-card:hover { border-color: #B9BCEB; }
[data-orbit-real-page="network"] .btn.nw-source-card:active { transform: none; }
[data-orbit-real-page="network"] .nw-source-icon { width: 40px; height: 40px; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-source-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page="network"] .nw-source-label { font-size: 12px; color: #6B6F99; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-source-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-table { display: flex; flex-direction: column; }
[data-orbit-real-page="network"] .nw-thead { display: grid; grid-template-columns: 20px 44px minmax(90px, 1fr) minmax(0, 2fr) 100px 100px 90px minmax(0, 1.5fr) 24px; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 10px; background: #F7F7FD; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-check { width: 16px; height: 16px; border: 1px solid #DDDEFA; border-radius: 4px; background: #FFFFFF; }
[data-orbit-real-page="network"] .btn.nw-row { display: grid; grid-template-columns: 20px 44px minmax(90px, 1fr) minmax(0, 2fr) 100px 100px 90px minmax(0, 1.5fr) 24px; align-items: center; gap: 14px; padding: 12px; border: 0; border-top: 1px solid #EEEFF8; background: transparent; text-align: left; font-size: 14px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: grid; align-items: center; justify-content: normal; gap: 14px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-row:hover { background: #F7F7FD; }
[data-orbit-real-page="network"] .btn.nw-row:active { transform: none; }
[data-orbit-real-page="network"] .nw-row-name { font-size: 15px; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-row-org { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page="network"] .nw-row-org-1 { color: #0E1225; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-row-org-2 { font-size: 13px; color: #6B6F99; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-row-last { color: #6B6F99; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-row-next { color: #3B3F7A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-row-arrow { color: #9FA3C4; }
/* ── 关系管线（设计稿 173–256 行）── */
[data-orbit-real-page="network"] .nw-pipe { display: flex; flex-direction: column; gap: 20px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="network"] .nw-pipe-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 20px; }
[data-orbit-real-page="network"] .nw-pipe-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 22px; }
[data-orbit-real-page="network"] .nw-pipe-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
[data-orbit-real-page="network"] .nw-pipe-new { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-pstat-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
[data-orbit-real-page="network"] .nw-pstat { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px 6px; border-radius: 14px; }
[data-orbit-real-page="network"] .nw-pstat-icon { width: 46px; height: 46px; border-radius: 50%; background: #FFFFFF; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 1px solid #E8E9F6; }
[data-orbit-real-page="network"] .nw-pstat-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 28px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-pstat-label { font-size: 13px; color: #3B3F7A; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-ai-card { border: 1px solid #E8E9F6; border-radius: 18px; background: linear-gradient(135deg, #FFFFFF, #F4F5FD); padding: 26px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="network"] .nw-ai-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
[data-orbit-real-page="network"] .nw-ai-title { display: flex; gap: 12px; }
[data-orbit-real-page="network"] .nw-ai-star { color: #4B4FC7; font-size: 22px; line-height: 1; }
[data-orbit-real-page="network"] .nw-ai-desc { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="network"] .btn.nw-shuffle { border: 0; background: transparent; color: #4B4FC7; font-size: 13px; cursor: pointer; white-space: nowrap;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；设计稿 button 未声明 padding，取浏览器默认 1px 6px */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; padding: 1px 6px; text-align: center; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-shuffle:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-shuffle:disabled { cursor: default; }
[data-orbit-real-page="network"] .nw-suggest-list { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="network"] .btn.nw-suggest { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; text-align: left; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: flex; align-items: center; justify-content: normal; gap: 14px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; transition: none; font-size: inherit; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-suggest:hover { background: #F7F7FD; }
[data-orbit-real-page="network"] .btn.nw-suggest:active { transform: none; }
[data-orbit-real-page="network"] .nw-suggest-icon { width: 40px; height: 40px; border-radius: 10px; background: #ECEEFB; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-suggest-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="network"] .nw-suggest-title { font-size: 15px; }
[data-orbit-real-page="network"] .nw-suggest-desc { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-suggest-tag { padding: 4px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-suggest-arrow { color: #9FA3C4; }
[data-orbit-real-page="network"] .nw-pipe-filters { display: flex; flex-wrap: wrap; gap: 12px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page="network"] .nw-pipe-filter { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid #E8E9F6; border-radius: 10px; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-pipe-filter-v { font-weight: 500; color: #0E1225; }
[data-orbit-real-page="network"] .nw-pipe-filter-caret { font-size: 11px; }
[data-orbit-real-page="network"] .nw-pipe-search { flex: 1; min-width: 220px; padding: 10px 16px; border: 1px solid #E8E9F6; border-radius: 10px; background: #F7F7FD; font-size: 14px; outline: none; }
[data-orbit-real-page="network"] .nw-pipe-search:focus { border-color: #4B4FC7; background: #FFFFFF; }
[data-orbit-real-page="network"] .nw-kanban { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 16px; align-items: start; }
[data-orbit-real-page="network"] .nw-kanban-col { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 16px; }
[data-orbit-real-page="network"] .nw-kanban-head { display: flex; flex-direction: column; gap: 4px; padding: 4px 4px 8px; }
[data-orbit-real-page="network"] .nw-kanban-title { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="network"] .nw-kanban-icon { width: 30px; height: 30px; border-radius: 8px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 14px; }
[data-orbit-real-page="network"] .nw-kanban-label { flex: 1; font-size: 16px; }
[data-orbit-real-page="network"] .nw-kanban-n { font-size: 16px; }
[data-orbit-real-page="network"] .nw-kanban-desc { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-kanban-card { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 12px; background: #FFFFFF; border: 1px solid #E8E9F6; cursor: pointer; transition: box-shadow .2s, transform .2s; }
[data-orbit-real-page="network"] .nw-kanban-card:hover { box-shadow: 0 8px 24px rgba(59, 63, 122, 0.10); transform: translateY(-1px); }
[data-orbit-real-page="network"] .nw-kanban-top { display: flex; align-items: flex-start; gap: 10px; }
[data-orbit-real-page="network"] .btn.nw-kanban-avatar { width: 40px; height: 40px; border: 0; border-radius: 50%; background: #DDDEFA; color: #3B3F7A; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；设计稿是 button，字号取浏览器默认 13.33px */
  gap: 0; padding: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; font-size: 13.3333px; }
[data-orbit-real-page="network"] .btn.nw-kanban-avatar:hover { color: #3B3F7A; }
[data-orbit-real-page="network"] .btn.nw-kanban-avatar:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-kanban-who { flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; text-align: left; display: flex; flex-direction: column; gap: 3px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; align-items: normal; justify-content: normal; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-size: inherit; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-kanban-who:hover { color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-kanban-who:active { transform: none; }
[data-orbit-real-page="network"] .nw-kanban-name { font-size: 15px; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-kanban-org { font-size: 12px; color: #6B6F99; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
[data-orbit-real-page="network"] .nw-kanban-source { align-self: flex-start; padding: 2px 8px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 11px; white-space: nowrap; }
[data-orbit-real-page="network"] .btn.nw-kanban-more { border: 0; background: transparent; color: #9FA3C4; font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; transition: none; border-radius: 0; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-kanban-more:hover { color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-kanban-more:active { transform: none; }
[data-orbit-real-page="network"] .nw-kanban-foot { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #6B6F99; padding-top: 8px; border-top: 1px solid #EEEFF8; }
[data-orbit-real-page="network"] .nw-kanban-v { color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-kanban-next { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* ── 概览（设计稿 66–171 行）── */
[data-orbit-real-page="network"] .nw-dist-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="network"] .nw-seg { display: flex; padding: 3px; border-radius: 10px; background: #F7F7FD; border: 1px solid #E8E9F6; }
[data-orbit-real-page="network"] .btn.nw-seg-btn { padding: 7px 12px; border: 0; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all .2s;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；background/color 由内联 style 提供 */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-seg-btn:active { transform: none; }
[data-orbit-real-page="network"] .nw-donut-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; }
[data-orbit-real-page="network"] .nw-donut { width: 200px; height: 200px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .4s; }
[data-orbit-real-page="network"] .nw-donut-inner { width: 124px; height: 124px; border-radius: 50%; background: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
[data-orbit-real-page="network"] .nw-donut-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 32px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-dist-legend { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 11px; }
[data-orbit-real-page="network"] .nw-dist-row { display: grid; grid-template-columns: 12px 1fr 32px 44px; align-items: center; gap: 12px; font-size: 14px; }
[data-orbit-real-page="network"] .nw-dist-dot { width: 12px; height: 12px; border-radius: 50%; }
[data-orbit-real-page="network"] .nw-dist-label { color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-dist-n { font-weight: 500; text-align: right; }
[data-orbit-real-page="network"] .nw-dist-pct { color: #6B6F99; text-align: right; }
[data-orbit-real-page="network"] .nw-dist-foot { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-cockpit { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="network"] .nw-cockpit-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
[data-orbit-real-page="network"] .nw-cockpit-title { display: flex; gap: 12px; align-items: flex-start; }
[data-orbit-real-page="network"] .nw-cockpit-meta { font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="network"] .btn.nw-cockpit-card { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 0; border-radius: 12px; background: #F7F7FD; text-align: left; cursor: pointer; transition: background .2s;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: flex; align-items: center; justify-content: normal; gap: 14px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; font-size: inherit; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-cockpit-card:hover { background: #ECEEFB; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-cockpit-card:active { transform: none; }
[data-orbit-real-page="network"] .nw-cockpit-foot { margin-top: auto; display: flex; flex-wrap: wrap; gap: 12px; }
[data-orbit-real-page="network"] .btn.nw-cockpit-cta { flex: 1; padding: 14px 20px; border: 0; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer; white-space: nowrap;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="network"] .btn.nw-cockpit-cta:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="network"] .btn.nw-cockpit-cta:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-cockpit-agent { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px 20px; border: 1px solid #B9BCEB; border-radius: 12px; background: #FFFFFF; color: #2E3270; white-space: nowrap;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; gap: 0; text-align: center; letter-spacing: 0; line-height: normal; transition: none; font-size: inherit; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-cockpit-agent:hover { background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="network"] .btn.nw-cockpit-agent:active { transform: none; }
[data-orbit-real-page="network"] .nw-cockpit-agent-hint { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-ov-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="network"] .nw-ov-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="network"] .nw-link { font-size: 14px; color: #4B4FC7; }
[data-orbit-real-page="network"] .nw-link:hover { color: #4B4FC7; }
[data-orbit-real-page="network"] .nw-stage-bar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
[data-orbit-real-page="network"] .btn.nw-stage-seg { padding: 14px 8px; border: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；background/color/clip-path 由内联 style 提供；设计稿是 button，字号取浏览器默认 13.33px */
  height: auto; justify-content: normal; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-size: 13.3333px; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-stage-seg:active { transform: none; }
[data-orbit-real-page="network"] .nw-stage-label { font-size: 13px; }
[data-orbit-real-page="network"] .nw-stage-n { font-size: 22px; }
[data-orbit-real-page="network"] .nw-hl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 14px; }
[data-orbit-real-page="network"] .btn.nw-hl { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; text-align: left; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: flex; align-items: center; justify-content: normal; gap: 14px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; transition: none; font-size: inherit; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-hl:hover { background: #F7F7FD; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-hl:active { transform: none; }
[data-orbit-real-page="network"] .nw-hl-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="network"] .nw-hl-stage { padding: 5px 12px; border-radius: 999px; font-size: 12px; }
[data-orbit-real-page="network"] .nw-recent-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="network"] .nw-recent-thead { display: grid; grid-template-columns: 44px minmax(90px, 1fr) minmax(0, 2fr) minmax(0, 1.2fr) 110px 90px 40px; align-items: center; gap: 16px; padding: 10px 12px; border-radius: 10px; background: #F7F7FD; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-recent-row { display: grid; grid-template-columns: 44px minmax(90px, 1fr) minmax(0, 2fr) minmax(0, 1.2fr) 110px 90px 40px; align-items: center; gap: 16px; padding: 12px; border: 0; border-top: 1px solid #EEEFF8; background: transparent; text-align: left; font-size: 14px; cursor: pointer; }
[data-orbit-real-page="network"] .nw-recent-row:hover { background: #F7F7FD; }
[data-orbit-real-page="network"] .nw-recent-name { font-size: 15px; white-space: nowrap;
  /* 该列内容是动态句子而非姓名（analysis.activity.label），超出列宽时省略号截断 */
  min-width: 0; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page="network"] .nw-recent-org { color: #3B3F7A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-recent-ind { color: #6B6F99; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-recent-last { color: #6B6F99; white-space: nowrap; }
/* ── AI 人脉分析子页（设计稿 393–609 行）── */
[data-orbit-real-page="network"] .nw-an { display: flex; flex-direction: column; gap: 24px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="network"] .nw-an-copy { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="network"] .btn.nw-back { align-self: flex-start; display: flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; justify-content: normal; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-back:hover { background: #ECEEFB; color: #3B3F7A; }
[data-orbit-real-page="network"] .btn.nw-back:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-atab { padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；color/border-bottom-color/font-weight 由 nw-tab-on/off 提供；设计稿是 button，字号取浏览器默认 13.33px */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-size: 13.3333px; }
[data-orbit-real-page="network"] .btn.nw-atab:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-atab.nw-tab-on { border-bottom-color: #0E1225; color: #0E1225; font-weight: 500; }
[data-orbit-real-page="network"] .btn.nw-atab.nw-tab-off { color: #6B6F99; font-weight: 400; }
[data-orbit-real-page="network"] .nw-an-sec { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="network"] .nw-an-hero { position: relative; overflow: hidden; border: 1px solid #E8E9F6; border-radius: 18px; background: linear-gradient(120deg, #FFFFFF 40%, #EEF0FB); padding: 28px 30px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="network"] .nw-an-hero-copy { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
[data-orbit-real-page="network"] .nw-an-hero-star { color: #4B4FC7; font-size: 24px; line-height: 1; }
[data-orbit-real-page="network"] .nw-an-hero-text { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="network"] .nw-an-eyebrow { font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-h2-26 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .btn.nw-an-outline { padding: 12px 20px; border: 1px solid #B9BCEB; border-radius: 12px; background: #FFFFFF; color: #2E3270; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="network"] .btn.nw-an-outline:hover { background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="network"] .btn.nw-an-outline:active { transform: none; }
[data-orbit-real-page="network"] .nw-dim-wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 28px; padding: 8px 0; }
[data-orbit-real-page="network"] .nw-dim-donut { width: 220px; height: 220px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .4s; }
[data-orbit-real-page="network"] .nw-dim-donut-inner { width: 136px; height: 136px; border-radius: 50%; background: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
[data-orbit-real-page="network"] .nw-dim-donut-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 34px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-dim-legend { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="network"] .nw-dim-row { display: flex; align-items: center; gap: 12px; font-size: 14px; }
[data-orbit-real-page="network"] .nw-dim-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-dim-row-copy { display: flex; flex-direction: column; }
[data-orbit-real-page="network"] .nw-dim-row-label { font-weight: 500; }
[data-orbit-real-page="network"] .nw-dims { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
[data-orbit-real-page="network"] .btn.nw-dim-btn { padding: 11px 8px; border: 1px solid; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；background/color/border-color 由内联 style 提供 */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; }
[data-orbit-real-page="network"] .btn.nw-dim-btn:active { transform: none; }
[data-orbit-real-page="network"] .nw-top-head { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="network"] .nw-h3 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-top-thead { display: grid; grid-template-columns: 36px 1fr 80px 70px; gap: 12px; padding: 10px 12px; border-radius: 10px; background: #F7F7FD; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-right { text-align: right; }
[data-orbit-real-page="network"] .nw-top-row { display: grid; grid-template-columns: 36px 1fr 80px 70px; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #EEEFF8; font-size: 14px;
  /* 行是 <a>（下钻到分组详情页）：中和壳的 a 颜色 */
  color: #0E1225; }
[data-orbit-real-page="network"] .nw-top-row:hover { color: #0E1225; }
[data-orbit-real-page="network"] .nw-top-rank { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page="network"] .nw-top-n { font-weight: 500; text-align: right; }
[data-orbit-real-page="network"] .nw-top-pct { color: #4B4FC7; text-align: right; }
[data-orbit-real-page="network"] .nw-dim-sum { display: flex; gap: 12px; padding: 14px; border-radius: 12px; background: #ECEEFB; }
[data-orbit-real-page="network"] .nw-dim-sum-icon { color: #4B4FC7; font-size: 16px; }
[data-orbit-real-page="network"] .nw-dim-sum-t { font-size: 14px; }
[data-orbit-real-page="network"] .nw-dim-sum-p { font-size: 13px; line-height: 1.6; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-insight { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 22px 26px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="network"] .nw-insight-copy { display: flex; gap: 14px; align-items: flex-start; flex: 1; min-width: 280px; }
[data-orbit-real-page="network"] .nw-insight-icon { width: 44px; height: 44px; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-insight-text { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="network"] .nw-insight-t { font-size: 17px; }
[data-orbit-real-page="network"] .nw-insight-p { margin: 0; font-size: 14px; line-height: 1.7; color: #3B3F7A; }
[data-orbit-real-page="network"] .btn.nw-textlink { border: 0; background: transparent; font-size: 14px; color: #4B4FC7; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；设计稿 button 未声明 padding，取浏览器默认 1px 6px */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; padding: 1px 6px; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-textlink:hover { color: #4B4FC7; }
[data-orbit-real-page="network"] .btn.nw-textlink:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-textlink-end { margin-left: auto; }
[data-orbit-real-page="network"] .nw-health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; }
[data-orbit-real-page="network"] .nw-health-item { display: flex; gap: 14px; padding: 18px; border: 1px solid #E8E9F6; border-radius: 14px; }
[data-orbit-real-page="network"] .nw-health-icon { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-health-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
[data-orbit-real-page="network"] .nw-health-row { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="network"] .nw-health-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-health-tag { padding: 3px 10px; border-radius: 999px; font-size: 12px; }
[data-orbit-real-page="network"] .nw-health-desc { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-health-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; padding-top: 14px; border-top: 1px solid #EEEFF8; font-size: 14px; }
[data-orbit-real-page="network"] .nw-health-kv { color: #6B6F99; }
[data-orbit-real-page="network"] .nw-health-kv-v { color: #0E1225; margin-left: 8px; }
[data-orbit-real-page="network"] .nw-an-hero-opp { position: relative; overflow: hidden; border: 1px solid #E8E9F6; border-radius: 18px; background: linear-gradient(120deg, #FFFFFF 45%, #EEF0FB); padding: 28px 30px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="network"] .nw-an-hero-copy-opp { display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1; }
[data-orbit-real-page="network"] .nw-an-hero-star-28 { color: #4B4FC7; font-size: 28px; line-height: 1; }
[data-orbit-real-page="network"] .nw-an-hero-p { margin: 0; font-size: 14px; line-height: 1.7; color: #6B6F99; max-width: 640px; }
[data-orbit-real-page="network"] .nw-hero-chips { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
[data-orbit-real-page="network"] .nw-hero-chip { padding: 8px 14px; border-radius: 999px; background: #FFFFFF; border: 1px solid #E8E9F6; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-opp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 20px; align-items: start; }
[data-orbit-real-page="network"] .nw-goal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="network"] .btn.nw-refresh { padding: 9px 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-block; align-items: normal; justify-content: normal; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; font-weight: 400; }
[data-orbit-real-page="network"] .btn.nw-refresh:hover { background: #ECEEFB; }
[data-orbit-real-page="network"] .btn.nw-refresh:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-refresh:disabled { cursor: default; }
[data-orbit-real-page="network"] .nw-goal-body { display: flex; align-items: center; gap: 28px; }
[data-orbit-real-page="network"] .nw-dial { position: relative; width: 180px; height: 180px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="network"] .nw-dial-ring { position: absolute; inset: 0; border-radius: 50%; border: 1px dashed #DDDEFA; }
[data-orbit-real-page="network"] .nw-dial-ring-2 { position: absolute; inset: 24px; border-radius: 50%; border: 1px dashed #DDDEFA; }
[data-orbit-real-page="network"] .nw-dial-dot-1 { position: absolute; top: 12px; right: 28px; width: 12px; height: 12px; border-radius: 50%; background: #5B8C7A; }
[data-orbit-real-page="network"] .nw-dial-dot-2 { position: absolute; top: 70px; left: 6px; width: 12px; height: 12px; border-radius: 50%; background: #6B8FB5; }
[data-orbit-real-page="network"] .nw-dial-dot-3 { position: absolute; bottom: 22px; left: 24px; width: 12px; height: 12px; border-radius: 50%; background: #9C7A3E; }
[data-orbit-real-page="network"] .nw-dial-center { width: 84px; height: 84px; border-radius: 50%; background: #4B4FC7; color: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
[data-orbit-real-page="network"] .nw-goal-score { font-size: 20px; }
[data-orbit-real-page="network"] .nw-dial-label { font-size: 12px; }
[data-orbit-real-page="network"] .nw-goal-rows { flex: 1; display: flex; flex-direction: column; }
[data-orbit-real-page="network"] .nw-goal-row { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid #EEEFF8; font-size: 15px; }
[data-orbit-real-page="network"] .nw-goal-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; }
[data-orbit-real-page="network"] .nw-goal-label { flex: 1; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-goal-n { color: #2E3270; }
[data-orbit-real-page="network"] .btn.nw-goal-cta { padding: 16px; border: 0; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="network"] .btn.nw-goal-cta:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="network"] .btn.nw-goal-cta:active { transform: none; }
[data-orbit-real-page="network"] .btn.nw-goal-cta:disabled { cursor: default; }
[data-orbit-real-page="network"] .nw-cov-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="network"] .btn.nw-cov-row { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; text-align: left; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: flex; align-items: center; justify-content: normal; gap: 14px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; transition: none; font-size: inherit; font-weight: 400; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-cov-row:hover { background: #F7F7FD; color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-cov-row:active { transform: none; }
[data-orbit-real-page="network"] .nw-cov-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-cov-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
[data-orbit-real-page="network"] .nw-cov-desc { font-size: 13px; color: #6B6F99; line-height: 1.5; }
[data-orbit-real-page="network"] .nw-act-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="network"] .nw-act-title { display: flex; align-items: baseline; gap: 14px; }
[data-orbit-real-page="network"] .nw-act-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; }
[data-orbit-real-page="network"] .btn.nw-act { display: flex; gap: 12px; padding: 18px; border: 1px solid #E8E9F6; border-radius: 14px;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；设计稿是 div，此处为 <a> 到动作链接 */
  height: auto; display: flex; align-items: normal; justify-content: normal; gap: 12px; white-space: normal; text-align: left; letter-spacing: 0; line-height: normal; transition: none; font-size: inherit; font-weight: 400; color: #0E1225; cursor: pointer; }
[data-orbit-real-page="network"] .btn.nw-act:hover { color: #0E1225; }
[data-orbit-real-page="network"] .btn.nw-act:active { transform: none; }
[data-orbit-real-page="network"] .nw-act-rank { width: 26px; height: 26px; border-radius: 50%; background: #4B4FC7; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-act-copy { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
[data-orbit-real-page="network"] .nw-act-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
[data-orbit-real-page="network"] .nw-act-tag { padding: 3px 8px; border-radius: 999px; font-size: 11px; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-act-desc { font-size: 13px; color: #6B6F99; line-height: 1.6; }
[data-orbit-real-page="network"] .nw-report { border: 1px solid #E8E9F6; border-radius: 18px; background: linear-gradient(120deg, #F4F5FD, #FFFFFF 50%); padding: 26px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="network"] .nw-report-copy { display: flex; align-items: center; gap: 18px; }
[data-orbit-real-page="network"] .nw-report-icon { width: 64px; height: 64px; border-radius: 16px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 26px; }
[data-orbit-real-page="network"] .nw-report-t { font-size: 18px; }
[data-orbit-real-page="network"] .nw-report-status { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-report-desc { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="network"] .btn.nw-report-cta { display: flex; flex-direction: column; align-items: center; gap: 6px;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明；设计稿是 <a>，此处为触发 iOrbit 分析的按钮 */
  height: auto; justify-content: normal; padding: 0; border: 0; background: transparent; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; border-radius: 0; font-size: inherit; font-weight: 400; color: #0E1225; cursor: pointer; }
[data-orbit-real-page="network"] .btn.nw-report-cta:active { transform: none; }
[data-orbit-real-page="network"] .nw-report-cta-pill { padding: 16px 40px; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; }
/* ── 分组详情下钻页（contacts-structure-detail.tsx 依赖的四条规则，原样自 contacts-analysis-workspace.tsx:39–46；任务 8 删除 workspace 后仍有样式）── */
[data-orbit-real-page="network"] .analysis-content{max-width:1200px;margin:0 auto}
[data-orbit-real-page="network"] .analysis-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px}
[data-orbit-real-page="network"] .analysis-card{padding:22px;min-width:0;overflow-wrap:anywhere}[data-orbit-real-page="network"] .analysis-card h2{margin:0 0 14px;font-size:18px}[data-orbit-real-page="network"] .analysis-card h3{font-size:15px}[data-orbit-real-page="network"] .analysis-muted{color:var(--text-3);font-size:13px;line-height:1.7}
[data-orbit-real-page="network"] .analysis-notice{padding:14px 18px;border:1px solid var(--border);border-radius:12px;margin:14px 0}
[data-orbit-real-page="network"] .analysis-card{background:#FFFFFF;border:1px solid #E8E9F6;border-radius:18px;box-shadow:none;padding:26px}
[data-orbit-real-page="network"] .analysis-card h2{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;font-size:22px;letter-spacing:-0.02em;color:#0E1225}
[data-orbit-real-page="network"] .analysis-notice{border-color:#E8E9F6;background:#F7F7FD}
@media(max-width:900px){[data-orbit-real-page="network"] .analysis-grid{grid-template-columns:1fr}[data-orbit-real-page="network"] .analysis-card{padding:18px}}
`;
