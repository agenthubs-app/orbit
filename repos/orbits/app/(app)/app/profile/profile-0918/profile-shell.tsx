/**
 * 个人中心（Orbit_0918）壳：面包屑 + 标题/副标 + 保存栏 + 三页签 + onboarding 门禁横幅 + 会话消息 + 全部 pc-* 样式。
 * JSX 逐元素来自 docs/designs/Orbit_0918/个人中心.dc.html 第 43–65 行（<main> 到页签）与 281–284 行（toast）。
 * 横幅设计稿没有：用设计通知条口径 pc-notice pc-notice-warning（背景 #FBF1DC 文字 #8A6420）。
 */
"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { ProfileEditorSession } from "./use-profile-editor-session";

export type ProfileView = "profile" | "persona" | "basic" | "settings" | "connect";

type Copy = { zh: string; en: string };

// 设计稿 renderVals().titles：[title, sub, crumb]；basic 屏设计无，文案由实现者补。
const TITLES: Record<ProfileView, { title: Copy; sub: Copy; crumb: Copy }> = {
  profile: {
    title: { zh: "个人资料", en: "Profile" },
    sub: { zh: "管理你的商务画像、联系信息与公开预览。", en: "Manage your business persona, contact details and public preview." },
    crumb: { zh: "个人资料", en: "Profile" },
  },
  persona: {
    title: { zh: "编辑商务画像", en: "Edit business persona" },
    sub: { zh: "完善你的目标、提供内容、寻求对象与交流话题。", en: "Refine your goals, what you offer, who you seek and the topics you want to discuss." },
    crumb: { zh: "个人资料 / 编辑商务画像", en: "Profile / Edit business persona" },
  },
  basic: {
    title: { zh: "编辑基础资料", en: "Edit basic profile" },
    sub: { zh: "姓名、行业、生日等基础信息，用于报名与资料门禁。", en: "Name, industry, birth date and other basics used for registration and the profile gate." },
    crumb: { zh: "个人资料 / 编辑基础资料", en: "Profile / Edit basic profile" },
  },
  settings: {
    title: { zh: "iOrbit 设置", en: "iOrbit settings" },
    sub: { zh: "决定 iOrbit 如何理解你。你可以手动编辑以下信息。", en: "Decide how iOrbit understands you. You can edit the information below." },
    crumb: { zh: "iOrbit 设置", en: "iOrbit settings" },
  },
  connect: {
    title: { zh: "连接", en: "Connections" },
    sub: { zh: "连接你常用的工具，让 iOrbit 更好地理解你的工作安排。", en: "Connect the tools you use so iOrbit understands your schedule better." },
    crumb: { zh: "连接", en: "Connections" },
  },
};

// 设计稿 tabs：个人资料（profile/persona/basic 高亮）/ iOrbit 设置 / 连接；页签为路由链接。
const TABS: { key: "profile" | "settings" | "connect"; href: string; label: Copy; active: readonly ProfileView[] }[] = [
  { key: "profile", href: "/app/profile", label: { zh: "个人资料", en: "Profile" }, active: ["profile", "persona", "basic"] },
  { key: "settings", href: "/app/settings", label: { zh: "iOrbit 设置", en: "iOrbit settings" }, active: ["settings"] },
  { key: "connect", href: "/app/profile?view=connect", label: { zh: "连接", en: "Connections" }, active: ["connect"] },
];

export interface ProfileOnboardingQuery {
  onboarding?: boolean;
  onboardingNext?: string;
}

/** `/app/profile` 内部链接：带 view，并在门禁流程中保留 `onboarding=1` / `next=`（横幅与 onboardingNext 才能存活）。 */
export function profileRoutePath(view: ProfileView | undefined, query: ProfileOnboardingQuery = {}): string {
  const params = new URLSearchParams();
  if (view && view !== "profile") params.set("view", view);
  if (query.onboarding) params.set("onboarding", "1");
  if (query.onboarding && query.onboardingNext) params.set("next", query.onboardingNext);
  const qs = params.toString();
  return qs ? `/app/profile?${qs}` : "/app/profile";
}

export function ProfileToast({ text }: { text: string }) {
  if (!text) return null;
  return <div className="pc-toast" role="status">{text}</div>;
}

export function ProfileShell({
  view,
  session,
  children,
  onboardingBanner,
  showSaveBar,
  onSave,
  onCancel,
  savingLabel,
  onboardingQuery,
}: {
  view: ProfileView;
  session: ProfileEditorSession;
  children: ReactNode;
  onboardingBanner?: { missing: string[]; go: string };
  showSaveBar?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  savingLabel?: string;
  /** 当前 URL 的 onboarding/next；有值时壳内 /app/profile 链接原样带上。 */
  onboardingQuery?: ProfileOnboardingQuery;
}) {
  const { t } = useOrbitLanguage();
  const copy = TITLES[view];
  // 门禁中（横幅可见）「个人资料」页签与面包屑落到基础资料编辑屏；否则回个人资料并保留 query。
  const profileHref = profileRoutePath(onboardingBanner ? "basic" : undefined, onboardingQuery);
  const saveDisabled = session.editorDisabled || session.saving || session.matchingSaving;
  const saveText = session.saving || session.matchingSaving
    ? savingLabel ?? t({ en: "Saving…", zh: "保存中…" })
    : t({ en: "Save changes", zh: "保存修改" });

  return (
    <main data-orbit-route="app-profile-screens" data-profile-view={view} className="pc-main">
      <style>{PROFILE_STYLES}</style>

      <span className="pc-crumb"><a className="pc-crumb-link" href={profileHref}>{t({ en: "Account", zh: "个人中心" })}</a> / {t(copy.crumb)}</span>

      <div className="pc-head">
        <div className="pc-head-copy">
          <h1 className="pc-h1">{t(copy.title)}</h1>
          <p className="pc-sub">{t(copy.sub)}</p>
        </div>
        {showSaveBar ? (
          <span className="pc-save-bar">
            <button className="btn pc-btn-cancel" disabled={session.saving || session.matchingSaving || session.extracting} onClick={onCancel} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
            <button aria-busy={session.saving || session.matchingSaving || undefined} className="btn pc-btn-primary" disabled={saveDisabled} onClick={onSave} type="button">{saveText}</button>
          </span>
        ) : null}
      </div>

      {onboardingBanner ? (
        <div className="pc-notice pc-notice-warning" role="status">
          <span className="pc-notice-text">
            {t({ en: "Finish your basic profile before entering iOrbit, Events and Network.", zh: "完成基础资料后才能进入 iOrbit、活动、人脉。" })}
            {onboardingBanner.missing.length ? ` ${t({ en: "Still needed: ", zh: "还需填写：" })}${onboardingBanner.missing.join(t({ en: ", ", zh: "、" }))}` : ""}
          </span>
          <a className="btn pc-btn-primary" href={onboardingBanner.go}>{t({ en: "Fill it in", zh: "去填写" })}</a>
        </div>
      ) : null}

      {session.message ? (
        <div role={session.messageKind === "error" ? "alert" : "status"} className={`pc-notice pc-notice-${session.messageKind}`}>
          <span className="pc-notice-text">{session.message}</span>
          {session.requiresReconcile ? (
            <button aria-busy={session.reloading || undefined} className="btn pc-btn-reload" disabled={session.reloading} onClick={() => void session.reloadLatestProfile()} type="button">
              {session.reloading ? t({ en: "Reloading latest…", zh: "正在刷新最新资料…" }) : t({ en: "Reload latest", zh: "刷新最新资料" })}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pc-tabs">
        {TABS.map((tab) => {
          const on = tab.active.includes(view);
          // settings 页签走 proxy 门禁路由，不带 onboarding 语义；profile/connect 页签经 profileRoutePath 保留 query。
          const href = tab.key === "profile" ? profileHref : tab.key === "connect" ? profileRoutePath("connect", onboardingQuery) : tab.href;
          return (
            <a key={tab.key} className={`pc-tab ${on ? "pc-tab-on" : "pc-tab-off"}`} href={href} aria-current={on ? "page" : undefined}>
              {t(tab.label)}
            </a>
          );
        })}
      </div>

      {children}
    </main>
  );
}

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。前缀 [data-orbit-real-page="profile-0918"]。
export const PROFILE_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
[data-orbit-real-page="profile-0918"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip; }
[data-orbit-real-page="profile-0918"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="profile-0918"] a:hover { color: #0E1225; }
[data-orbit-real-page="profile-0918"] input, [data-orbit-real-page="profile-0918"] textarea, [data-orbit-real-page="profile-0918"] button, [data-orbit-real-page="profile-0918"] select { font-family: inherit; }
[data-orbit-real-page="profile-0918"] input::placeholder, [data-orbit-real-page="profile-0918"] textarea::placeholder { color: #9FA3C4; }
/* ── 壳（设计稿 43–65 行）── */
[data-orbit-real-page="profile-0918"] .pc-main { max-width: 1240px; margin: 0 auto; padding: 14px 40px 72px; display: flex; flex-direction: column; gap: 22px; }
[data-orbit-real-page="profile-0918"] .pc-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-crumb-link { color: #6B6F99; }
/* 跨域 <a> 字色门禁：面包屑落成 <a>，作用域 a:hover 会把设计的 #6B6F99 换成
   #0E1225。设计稿无 style-hover，这里只中和基线。 */
[data-orbit-real-page="profile-0918"] .pc-crumb-link:hover { color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 20px; }
[data-orbit-real-page="profile-0918"] .pc-head-copy { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
[data-orbit-real-page="profile-0918"] .pc-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(30px, 3.6vw, 42px); letter-spacing: -0.03em; }
[data-orbit-real-page="profile-0918"] .pc-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-save-bar { display: flex; gap: 12px; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-cancel { padding: 13px 22px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-cancel:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-cancel:active { transform: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-cancel:disabled { cursor: default; opacity: 0.6; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-primary { padding: 13px 22px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-primary:hover { background: #2E3270; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-primary:active { transform: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-primary:disabled { cursor: default; opacity: 0.6; }
[data-orbit-real-page="profile-0918"] .pc-tabs { display: flex; gap: 32px; flex-wrap: wrap; border-bottom: 1px solid #E8E9F6; }
[data-orbit-real-page="profile-0918"] .pc-tab { padding: 0 0 14px; border: 0; border-bottom: 2px solid transparent; background: transparent; cursor: pointer;
  /* 设计稿页签是 button 且显式 font-size:15px，渲染结果 15px，直接对齐 */
  font-size: 15px; line-height: normal; }
[data-orbit-real-page="profile-0918"] .pc-tab-on { border-bottom-color: #0E1225; color: #0E1225; font-weight: 700; }
[data-orbit-real-page="profile-0918"] .pc-tab-off { color: #6B6F99; font-weight: 400; }
/* 页签改为 <a>：中和页面级 a:hover 变色（设计 button 页签无 hover） */
[data-orbit-real-page="profile-0918"] .pc-tab-off:hover { color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-tab-on:hover { color: #0E1225; }
/* ── 通知条（设计稿无：门禁横幅 / 会话消息）── */
[data-orbit-real-page="profile-0918"] .pc-notice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; border-radius: 12px; padding: 12px 16px; font-size: 14px; }
[data-orbit-real-page="profile-0918"] .pc-notice-text { flex: 1; min-width: 0; }
[data-orbit-real-page="profile-0918"] .pc-notice-warning { background: #FBF1DC; color: #8A6420; }
[data-orbit-real-page="profile-0918"] .pc-notice-error { background: #FBEAEA; color: #B5473A; }
[data-orbit-real-page="profile-0918"] .pc-notice-success { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page="profile-0918"] .pc-notice-info { background: #F7F7FD; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-reload { padding: 8px 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-reload:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-reload:active { transform: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-reload:disabled { cursor: default; opacity: 0.6; }
/* ── 卡片基类（设计稿 70 行 section 的边框/圆角/底色/内边距；各屏在此之上追加）── */
[data-orbit-real-page="profile-0918"] .pc-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="profile-0918"] .pc-empty { padding: 40px; text-align: center; color: #9FA3C4; font-size: 14px; }
/* ── 个人资料屏（设计稿 67–152 行）── */
[data-orbit-real-page="profile-0918"] .pc-overview { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 20px; align-items: start; animation: orbit-fade .3s ease; }
[data-orbit-real-page="profile-0918"] .pc-col { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="profile-0918"] .pc-hero { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; }
[data-orbit-real-page="profile-0918"] .pc-avatar { width: 92px; height: 92px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 34px; }
[data-orbit-real-page="profile-0918"] .pc-hero-copy { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="profile-0918"] .pc-name { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; }
[data-orbit-real-page="profile-0918"] .pc-role { font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-hero-side { display: flex; flex-direction: column; gap: 14px; min-width: 240px; }
[data-orbit-real-page="profile-0918"] .pc-progress { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="profile-0918"] .pc-progress-label { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-score { font-weight: 700; color: #0E1225; }
[data-orbit-real-page="profile-0918"] .pc-bar { display: block; height: 7px; border-radius: 999px; background: #ECEEFB; }
[data-orbit-real-page="profile-0918"] .pc-bar-fill { display: block; height: 7px; border-radius: 999px; background: #4B4FC7; }
[data-orbit-real-page="profile-0918"] .pc-hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
[data-orbit-real-page="profile-0918"] .pc-stack { display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="profile-0918"] .pc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="profile-0918"] .pc-h2 { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-small { padding: 9px 16px; border: 1px solid #DDDEFA; border-radius: 9px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-small:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-small:active { transform: none; }
[data-orbit-real-page="profile-0918"] .pc-grid { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 16px 20px; align-items: start; font-size: 14px; }
[data-orbit-real-page="profile-0918"] .pc-grid-k { color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-grid-bio { line-height: 1.8; }
[data-orbit-real-page="profile-0918"] .pc-persona-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 14px; }
[data-orbit-real-page="profile-0918"] .pc-persona-card { padding: 18px; border-radius: 14px; background: #F7F7FD; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="profile-0918"] .pc-persona-head { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="profile-0918"] .pc-persona-icon { width: 28px; height: 28px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="profile-0918"] .pc-persona-title { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page="profile-0918"] .pc-chip { padding: 6px 12px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 12px; }
/* 空画像组占位（设计无：同 chip 几何，白底灰字） */
[data-orbit-real-page="profile-0918"] .pc-chip-empty { padding: 6px 12px; border-radius: 999px; background: #FFFFFF; color: #9FA3C4; font-size: 12px; }
[data-orbit-real-page="profile-0918"] .pc-side-card { padding: 24px; }
[data-orbit-real-page="profile-0918"] .pc-contact { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 6px 10px; align-items: center; }
[data-orbit-real-page="profile-0918"] .pc-contact-icon { width: 24px; height: 24px; border-radius: 7px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 11px; }
[data-orbit-real-page="profile-0918"] .pc-contact-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
[data-orbit-real-page="profile-0918"] .pc-contact-label { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-contact-value { font-size: 13px; color: #4B4FC7; word-break: break-all; }
[data-orbit-real-page="profile-0918"] .pc-contact-scope { justify-self: start; padding: 5px 10px; border-radius: 999px; background: #F7F7FD; color: #6B6F99; font-size: 11px; }
/* 无联系方式占位（设计无） */
[data-orbit-real-page="profile-0918"] .pc-empty-line { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-suggest-card { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="profile-0918"] .btn.pc-suggest { display: flex; align-items: center; gap: 12px; padding: 14px 4px; border: 0; border-top: 1px solid #F1F1FA; background: transparent; text-align: left; cursor: pointer;
  /* 覆盖 .btn 基类非设计声明；设计按钮未设字号，按渲染结果 13.3333px；链接形态中和页面级 a 色 */
  height: auto; justify-content: flex-start; white-space: normal; letter-spacing: 0; line-height: normal; font-size: 13.3333px; font-weight: 400; color: #0E1225; border-radius: 0; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-suggest:hover { color: #0E1225; }
[data-orbit-real-page="profile-0918"] .btn.pc-suggest:active { transform: none; }
[data-orbit-real-page="profile-0918"] .pc-suggest-icon { width: 32px; height: 32px; flex: none; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="profile-0918"] .pc-suggest-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="profile-0918"] .pc-suggest-title { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-suggest-desc { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-suggest-caret { color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-preview-card { display: flex; flex-direction: column; gap: 16px; }
/* ── 编辑商务画像屏（设计稿 154–207 行）── */
[data-orbit-real-page="profile-0918"] .pc-editor { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 20px; align-items: start; animation: orbit-fade .3s ease; }
[data-orbit-real-page="profile-0918"] .pc-h2-lg { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 21px; letter-spacing: -0.02em; }
[data-orbit-real-page="profile-0918"] .pc-group { padding: 20px; border-radius: 14px; background: #F7F7FD; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="profile-0918"] .pc-group-head { display: flex; gap: 12px; align-items: flex-start; }
[data-orbit-real-page="profile-0918"] .pc-group-icon { width: 32px; height: 32px; flex: none; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="profile-0918"] .pc-group-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="profile-0918"] .pc-group-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-group-hint { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-tags { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page="profile-0918"] .pc-tag { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 12px; }
[data-orbit-real-page="profile-0918"] .btn.pc-tag-remove { border: 0; background: transparent; color: #6B6F99; font-size: 12px; cursor: pointer; padding: 0;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; border-radius: 0; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-tag-remove:active { transform: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-tag-remove:disabled { cursor: default; opacity: 0.6; }
/* 只读 chip（我的目标 = intro，无移除按钮；设计无）与空组占位 */
[data-orbit-real-page="profile-0918"] .pc-tag-readonly { gap: 0; }
[data-orbit-real-page="profile-0918"] .pc-tag-empty { background: #FFFFFF; color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-input-wrap { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; }
[data-orbit-real-page="profile-0918"] .pc-input-plus { color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 13px;
  /* 设计 input 保留 UA 默认内边距 1px 2px；参考样式隔离层（orbit-reference-styles.tsx:35–50）把 input padding 归零，这里还原 */
  padding: 1px 2px; }
[data-orbit-real-page="profile-0918"] .pc-side-section { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="profile-0918"] .pc-side-head { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="profile-0918"] .pc-side-title-row { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="profile-0918"] .pc-side-title-icon { color: #4B4FC7; }
[data-orbit-real-page="profile-0918"] .pc-side-desc { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-preview-box { padding: 20px; border-radius: 14px; background: #F7F7FD; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="profile-0918"] .pc-preview-head { display: flex; gap: 14px; align-items: center; }
[data-orbit-real-page="profile-0918"] .pc-preview-avatar { width: 52px; height: 52px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 20px; }
[data-orbit-real-page="profile-0918"] .pc-preview-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="profile-0918"] .pc-preview-name { font-size: 16px; }
[data-orbit-real-page="profile-0918"] .pc-preview-role { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-preview-bio { font-size: 13px; line-height: 1.8; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-preview-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: center; padding-top: 12px; border-top: 1px solid #E8E9F6; }
[data-orbit-real-page="profile-0918"] .pc-preview-label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-preview-label-icon { color: #4B4FC7; }
[data-orbit-real-page="profile-0918"] .pc-preview-tags { display: flex; flex-wrap: wrap; gap: 6px; }
[data-orbit-real-page="profile-0918"] .pc-preview-tag { padding: 5px 10px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 11px; }
[data-orbit-real-page="profile-0918"] .pc-preview-tag-empty { background: #FFFFFF; color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-tip { display: flex; gap: 14px; align-items: flex-start; }
[data-orbit-real-page="profile-0918"] .pc-tip-n { width: 28px; height: 28px; flex: none; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page="profile-0918"] .pc-tip-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="profile-0918"] .pc-tip-title { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-tip-desc { font-size: 12px; color: #6B6F99; }
/* ── 编辑基础资料屏（设计无；复用画像编辑的卡片 / 标签 / 输入声明）── */
[data-orbit-real-page="profile-0918"] .pc-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 16px; }
[data-orbit-real-page="profile-0918"] .pc-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
[data-orbit-real-page="profile-0918"] .pc-field-label { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-required { padding: 2px 8px; border-radius: 999px; background: #FBEAEA; color: #B5473A; font-size: 11px; font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-select { appearance: auto; color: #0E1225; cursor: pointer; }
[data-orbit-real-page="profile-0918"] .pc-select:disabled { cursor: default; color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-input:disabled { color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-input-wrap-area { align-items: stretch; }
[data-orbit-real-page="profile-0918"] .pc-textarea { resize: none; line-height: 1.55; padding: 2px; }
[data-orbit-real-page="profile-0918"] .pc-readonly { padding: 12px 14px; border: 1px solid #E8E9F6; border-radius: 10px; background: #F7F7FD; color: #3B3F7A; font-size: 13px; word-break: break-all; }
[data-orbit-real-page="profile-0918"] .pc-readonly-scope { align-self: flex-start; padding: 5px 10px; border-radius: 999px; background: #F7F7FD; color: #6B6F99; font-size: 11px; }
[data-orbit-real-page="profile-0918"] .pc-methods { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page="profile-0918"] .btn.pc-method { padding: 9px 16px; border: 1px solid #DDDEFA; border-radius: 9px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; font-weight: 400; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-method:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="profile-0918"] .btn.pc-method:active { transform: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-method:disabled { cursor: default; opacity: 0.6; }
[data-orbit-real-page="profile-0918"] .btn.pc-method.pc-method-on { border-color: #0E1225; background: #0E1225; color: #FFFFFF; }
[data-orbit-real-page="profile-0918"] .btn.pc-method.pc-method-on:hover { border-color: #2E3270; background: #2E3270; color: #FFFFFF; }
/* ── iOrbit 设置屏（设计稿 209–242 行）── */
[data-orbit-real-page="profile-0918"] .pc-settings { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); gap: 20px; align-items: start; animation: orbit-fade .3s ease; }
[data-orbit-real-page="profile-0918"] .pc-settings-card { display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="profile-0918"] .pc-settings-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="profile-0918"] .pc-settings-title { display: flex; align-items: center; gap: 12px; }
[data-orbit-real-page="profile-0918"] .pc-settings-icon { width: 40px; height: 40px; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="profile-0918"] .pc-about { width: 100%; padding: 16px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; font-size: 14px; line-height: 1.8; color: #0E1225; resize: vertical; outline: none; }
[data-orbit-real-page="profile-0918"] .pc-about:disabled { color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-goal-text { font-size: 14px; line-height: 1.8; color: #0E1225; }
/* 当前目标为空（设计无：同段落几何，灰字） */
[data-orbit-real-page="profile-0918"] .pc-goal-empty { color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-info-card { display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="profile-0918"] .pc-info-head { display: flex; gap: 14px; align-items: flex-start; }
[data-orbit-real-page="profile-0918"] .pc-info-icon { width: 40px; height: 40px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="profile-0918"] .pc-info-copy { display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page="profile-0918"] .pc-info-block { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="profile-0918"] .pc-info-block-next { padding-top: 14px; border-top: 1px solid #E8E9F6; }
[data-orbit-real-page="profile-0918"] .pc-info-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-info-label-icon { color: #4B4FC7; }
[data-orbit-real-page="profile-0918"] .pc-info-label-text { font-weight: 500; }
[data-orbit-real-page="profile-0918"] .pc-info-text { font-size: 13px; line-height: 1.8; color: #6B6F99; }
/* 摘要为空（设计无：同文本几何，灰字） */
[data-orbit-real-page="profile-0918"] .pc-info-empty { color: #9FA3C4; }
[data-orbit-real-page="profile-0918"] .pc-info-note { font-size: 12px; color: #9FA3C4; }
/* 既有设置面板区（设计无：五个模块各套一个 pc-card 外框，皮肤见 profile-legacy-settings.tsx） */
[data-orbit-real-page="profile-0918"] .pc-legacy-settings { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="profile-0918"] .pc-legacy-card { padding: 0; overflow: hidden; }
/* ── 连接屏（设计稿 244–280 行）── */
[data-orbit-real-page="profile-0918"] .pc-connect { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 20px; align-items: start; animation: orbit-fade .3s ease; }
[data-orbit-real-page="profile-0918"] .pc-int-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 20px; }
[data-orbit-real-page="profile-0918"] .pc-int-card { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="profile-0918"] .pc-int-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="profile-0918"] .pc-int-glyph { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; }
[data-orbit-real-page="profile-0918"] .pc-int-state { padding: 6px 14px; border-radius: 999px; font-size: 12px; }
[data-orbit-real-page="profile-0918"] .pc-int-state-off { background: #F1F1FA; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-int-copy { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="profile-0918"] .pc-int-name { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; }
[data-orbit-real-page="profile-0918"] .pc-int-desc { font-size: 13px; line-height: 1.8; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-int-scopes { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid #F1F1FA; }
[data-orbit-real-page="profile-0918"] .pc-int-scope { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="profile-0918"] .pc-int-check { width: 20px; height: 20px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 11px; }
/* 设计 259 行按钮的盒几何（padding/边框/圆角/字号/字重）；非交互 span 居中排版对齐 button 默认 */
[data-orbit-real-page="profile-0918"] .pc-connect-cta { padding: 14px; border: 1px solid; border-radius: 10px; font-size: 14px; font-weight: 500; display: block; text-align: center; line-height: normal; }
/* 「即将开放」占位（既有决定：无 OAuth / 无 toggle / 无存储状态）：灰底灰字，非交互 */
[data-orbit-real-page="profile-0918"] .pc-connect-cta-soon { border-color: #E8E9F6; background: #F7F7FD; color: #9FA3C4; cursor: default; }
[data-orbit-real-page="profile-0918"] .pc-conn-card { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="profile-0918"] .pc-conn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; text-align: center; }
[data-orbit-real-page="profile-0918"] .pc-conn-cell { display: flex; flex-direction: column; align-items: center; gap: 8px; }
[data-orbit-real-page="profile-0918"] .pc-conn-cell-next { border-left: 1px solid #F1F1FA; }
[data-orbit-real-page="profile-0918"] .pc-conn-icon-on { width: 30px; height: 30px; border-radius: 50%; background: #E6F1EC; color: #2F6B4F; display: flex; align-items: center; justify-content: center; font-size: 12px; }
[data-orbit-real-page="profile-0918"] .pc-conn-icon-off { width: 30px; height: 30px; border-radius: 50%; background: #F1F1FA; color: #9FA3C4; display: flex; align-items: center; justify-content: center; font-size: 12px; }
[data-orbit-real-page="profile-0918"] .pc-conn-count { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 30px; }
[data-orbit-real-page="profile-0918"] .pc-conn-label { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="profile-0918"] .pc-note-card { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="profile-0918"] .pc-note-row { display: flex; gap: 14px; align-items: flex-start; }
[data-orbit-real-page="profile-0918"] .pc-note-icon { width: 38px; height: 38px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="profile-0918"] .pc-note-text { font-size: 13px; line-height: 1.8; color: #6B6F99; }
/* ── toast（设计稿 281–284 行）── */
[data-orbit-real-page="profile-0918"] .pc-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 200; padding: 12px 22px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 14px; box-shadow: 0 18px 40px rgba(14,18,37,0.25); }
`;
