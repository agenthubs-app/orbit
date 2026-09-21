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

export function NetworkAvatar({ initial, size = 40 }: { initial: string; size?: 40 | 56 | 64 }) {
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
`;
