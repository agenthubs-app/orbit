"use client";

/**
 * 认证弹窗壳（Orbit_0918）：遮罩（设计 343）/ 面板（344）/ ×（345）/ 「Orbit」字标（346）+ `AUTH_STYLES`。
 * 浮在未登录落地页（`landing-0918` 作用域）之上；本层作用域 `[data-orbit-real-page="auth-0918"]` 只包弹窗。
 * 关闭（×、遮罩、Esc）= 旧行为 `navigate("/")` → `/app`；焦点陷阱 / Esc / 打开时自动聚焦 沿用 `useOrbitModalA11y`
 * （首个可聚焦元素 = ×，DOM 顺序与旧实现一致，审阅修订 4）。不用 `ModalShell`（像素结构不同，审阅修订 17）。
 * 遮罩点击关闭是旧能力、设计无：只在 `event.target === event.currentTarget` 时关闭（审阅修订 3）。
 * 视图 hook：各屏自行调用一次 `useAccountAuth`（壳不持有会话，Task 3 的 reset 屏用另一 hook）。
 */
import { useCallback, type MouseEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { AuthLogin } from "./auth-login";
import { authTitleId, type AuthView } from "./auth-model";
import { AuthRegister } from "./auth-register";
import { navigate } from "./use-account-auth";

/** 任务 2 只接 登录 / 注册；找回 / 新密码 屏由任务 3 加入后放宽为 `AuthView`。 */
export type AuthModalView = Extract<AuthView, "login" | "register">;

export function AuthModal({ defaultNext, oauthProviders, view }: { defaultNext: string; oauthProviders: readonly string[]; view: AuthModalView }) {
  const { t } = useOrbitLanguage();
  const handleClose = useCallback(() => {
    navigate("/");
  }, []);
  const cardRef = useOrbitModalA11y(handleClose);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) handleClose();
  };

  return (
    <div data-orbit-real-page="auth-0918">
      <style>{AUTH_STYLES}</style>
      <div className="au-overlay" onClick={onOverlayClick}>
        <div aria-labelledby={authTitleId(view)} aria-modal="true" className="au-panel" ref={cardRef} role="dialog" tabIndex={-1}>
          <button aria-label={t({ en: "Close", zh: "关闭" })} className="btn au-close" onClick={handleClose} type="button">×</button>
          <span className="au-wordmark">Orbit</span>
          {view === "register" ? (
            <AuthRegister defaultNext={defaultNext} oauthProviders={oauthProviders} />
          ) : (
            <AuthLogin defaultNext={defaultNext} oauthProviders={oauthProviders} />
          )}
        </div>
      </div>
    </div>
  );
}

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。前缀 [data-orbit-real-page="auth-0918"]，类前缀 au-。
// `.btn.au-*` 规则整段中和 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 + `:active{transform:none}`。
export const AUTH_STYLES = `
/* ── 作用域基线（设计 helmet：body 字体 / 链接色）── */
[data-orbit-real-page="auth-0918"] { color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; }
[data-orbit-real-page="auth-0918"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="auth-0918"] a:hover { color: #0E1225; }
[data-orbit-real-page="auth-0918"] button { font-family: inherit; }
/* 设计 helmet 未给 input 字体（只有 body），输入框按 Chromium UA 默认渲染为 Arial（playwright 实测 computed fontFamily = Arial）；
   基类 reset（orbit-reference-styles.tsx:34–50）强制 font: inherit → 这里补回 UA 默认 */
[data-orbit-real-page="auth-0918"] input { font-family: Arial; }
/* ── 壳（设计 343 遮罩 / 344 面板 / 345 × / 346 字标）── */
[data-orbit-real-page="auth-0918"] .au-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(14,18,37,0.45); backdrop-filter: blur(6px); }
[data-orbit-real-page="auth-0918"] .au-panel { position: relative; width: 100%; max-width: 440px; max-height: calc(100vh - 48px); overflow: auto; background: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 30px 80px rgba(14,18,37,0.3); display: flex; flex-direction: column; gap: 24px; }
/* 面板 tabIndex=-1 供焦点陷阱兜底（旧实现内联 outline:none；审阅修订 15：内联只留 opacity → 改为规则） */
[data-orbit-real-page="auth-0918"] .au-panel:focus { outline: none; }
[data-orbit-real-page="auth-0918"] .btn.au-close { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border: 0; border-radius: 50%; background: #F7F7FD; color: #6B6F99; font-size: 18px; line-height: 1; cursor: pointer; font-family: inherit;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  padding: 0; gap: 0; font-weight: 400; letter-spacing: 0; transition: none; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; }
[data-orbit-real-page="auth-0918"] .btn.au-close:hover { background: #ECEEFB; color: #0E1225; }
[data-orbit-real-page="auth-0918"] .btn.au-close:active { transform: none; }
[data-orbit-real-page="auth-0918"] .au-wordmark { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.03em; }
/* ── 视图（设计 348–351 / 371–374）── */
[data-orbit-real-page="auth-0918"] .au-view { display: flex; flex-direction: column; gap: 24px; }
[data-orbit-real-page="auth-0918"] .au-head { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="auth-0918"] .au-h2 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 34px; line-height: 1.15; letter-spacing: -0.03em; }
[data-orbit-real-page="auth-0918"] .au-sub { margin: 0; font-size: 15px; line-height: 1.65; color: #3B3F7A; }
/* ── 字段（设计 353–360 / 376–383）：label 结构改为 div + label[for]（眼睛钮不能落进 label 的可访问名），CSS 逐字 ── */
[data-orbit-real-page="auth-0918"] .au-fields { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="auth-0918"] .au-label { display: flex; flex-direction: column; gap: 7px; font-size: 13px; font-weight: 500; color: #3B3F7A; }
[data-orbit-real-page="auth-0918"] .au-input { padding: 14px 16px; border: 1px solid #DDDEFA; border-radius: 12px; background: #F7F7FD; font-size: 15px; color: #0E1225; outline: none; width: 100%; }
[data-orbit-real-page="auth-0918"] .au-input:focus { border-color: #4B4FC7; background: #FFFFFF; }
[data-orbit-real-page="auth-0918"] .au-label-row { display: flex; justify-content: space-between; }
[data-orbit-real-page="auth-0918"] .au-forgot { font-weight: 400; color: #4B4FC7; }
[data-orbit-real-page="auth-0918"] .au-forgot:hover { color: #4B4FC7; }
/* 设计外：显示/隐藏密码眼睛钮（审阅修订 9；orbit-reference-styles.tsx:2225–2260 的字段内右侧 affordance 同法） */
[data-orbit-real-page="auth-0918"] .au-field-wrap { position: relative; display: flex; align-items: center; }
[data-orbit-real-page="auth-0918"] .au-field-wrap .au-input { padding-right: 52px; }
[data-orbit-real-page="auth-0918"] .btn.au-eye { position: absolute; right: 8px; width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: #6B6F99; cursor: pointer;
  padding: 0; gap: 0; font-weight: 400; letter-spacing: 0; line-height: normal; transition: none; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; }
[data-orbit-real-page="auth-0918"] .btn.au-eye:hover { background: #ECEEFB; color: #0E1225; }
[data-orbit-real-page="auth-0918"] .btn.au-eye:active { transform: none; }
/* ── 错误卡（设计 363 / 385）与 created 提示（设计外：同尺寸蓝色 notice，配色取找回成功卡 401）── */
[data-orbit-real-page="auth-0918"] .au-error { padding: 12px 14px; border-radius: 10px; background: #FDF2F4; border: 1px solid #F5C6D0; color: #A32642; font-size: 13px; line-height: 1.5; }
[data-orbit-real-page="auth-0918"] .au-notice { padding: 12px 14px; border-radius: 10px; background: #ECEEFB; border: 1px solid #DDDEFA; color: #2E3270; font-size: 13px; line-height: 1.5; }
/* ── 主按钮：登录 366（多 display:flex; align-items:center; justify-content:center; gap:10px）与 注册 388 是两个类（审阅修订 7）── */
[data-orbit-real-page="auth-0918"] .btn.au-btn-login { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px; border: 0; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 16px; font-weight: 500; cursor: pointer; font-family: inherit;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; white-space: nowrap; letter-spacing: 0; line-height: normal; transition: none; text-decoration: none; }
[data-orbit-real-page="auth-0918"] .btn.au-btn-login:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="auth-0918"] .btn.au-btn-login:active { transform: none; }
[data-orbit-real-page="auth-0918"] .btn.au-btn-primary { padding: 16px; border: 0; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 16px; font-weight: 500; cursor: pointer; font-family: inherit;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; letter-spacing: 0; line-height: normal; transition: none; text-decoration: none; }
[data-orbit-real-page="auth-0918"] .btn.au-btn-primary:hover { background: #2E3270; color: #FFFFFF; }
[data-orbit-real-page="auth-0918"] .btn.au-btn-primary:active { transform: none; }
/* 审阅修订 6：中和 .btn[disabled]（orbit-reference-styles.tsx:712–719 会改底色/字色/opacity .45）；设计只靠内联 opacity:0.6 */
[data-orbit-real-page="auth-0918"] .btn.au-btn-login[disabled], [data-orbit-real-page="auth-0918"] .btn.au-btn-primary[disabled] { background: #0E1225; color: #FFFFFF; cursor: pointer; box-shadow: none; }
/* 设计外：Google 钮（白底 #DDDEFA 边、999px、与主按钮同 padding） */
[data-orbit-real-page="auth-0918"] .btn.au-google { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #0E1225; font-size: 16px; font-weight: 500; cursor: pointer; font-family: inherit;
  height: auto; white-space: nowrap; letter-spacing: 0; line-height: normal; transition: none; text-decoration: none; }
[data-orbit-real-page="auth-0918"] .btn.au-google:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="auth-0918"] .btn.au-google:active { transform: none; }
/* ── 切换行（设计 367 / 391）与 条款行（389；链接渲染为无 href 的 span）── */
[data-orbit-real-page="auth-0918"] .au-switch { margin: 0; text-align: center; font-size: 14px; color: #6B6F99; }
[data-orbit-real-page="auth-0918"] .au-switch-link { color: #4B4FC7; font-weight: 500; border-bottom: 1px solid #B9BCEB; }
[data-orbit-real-page="auth-0918"] .au-switch-link:hover { color: #4B4FC7; }
[data-orbit-real-page="auth-0918"] .au-terms { margin: 0; text-align: center; font-size: 13px; line-height: 1.6; color: #8A8DB0; }
[data-orbit-real-page="auth-0918"] .au-terms-link { color: #6B6F99; border-bottom: 1px solid #DDDEFA; }
`;
