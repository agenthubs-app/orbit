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
}: {
  view: ProfileView;
  session: ProfileEditorSession;
  children: ReactNode;
  onboardingBanner?: { missing: string[]; go: string };
  showSaveBar?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  savingLabel?: string;
}) {
  const { t } = useOrbitLanguage();
  const copy = TITLES[view];
  const saveDisabled = session.editorDisabled || session.saving || session.matchingSaving;
  const saveText = session.saving || session.matchingSaving
    ? savingLabel ?? t({ en: "Saving…", zh: "保存中…" })
    : t({ en: "Save changes", zh: "保存修改" });

  return (
    <main data-orbit-route="app-profile-screens" data-profile-view={view} className="pc-main">
      <style>{PROFILE_STYLES}</style>

      <span className="pc-crumb"><a className="pc-crumb-link" href="/app/profile">{t({ en: "Account", zh: "个人中心" })}</a> / {t(copy.crumb)}</span>

      <div className="pc-head">
        <div className="pc-head-copy">
          <h1 className="pc-h1">{t(copy.title)}</h1>
          <p className="pc-sub">{t(copy.sub)}</p>
        </div>
        {showSaveBar ? (
          <span className="pc-save-bar">
            <button className="btn pc-btn-cancel" onClick={onCancel} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
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
          return (
            <a key={tab.key} className={`pc-tab ${on ? "pc-tab-on" : "pc-tab-off"}`} href={tab.href} aria-current={on ? "page" : undefined}>
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
[data-orbit-real-page="profile-0918"] .btn.pc-btn-primary { padding: 13px 22px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="profile-0918"] .btn.pc-btn-primary:hover { background: #2E3270; color: #FFFFFF; }
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
/* ── toast（设计稿 281–284 行）── */
[data-orbit-real-page="profile-0918"] .pc-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 200; padding: 12px 22px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 14px; box-shadow: 0 18px 40px rgba(14,18,37,0.25); }
`;
