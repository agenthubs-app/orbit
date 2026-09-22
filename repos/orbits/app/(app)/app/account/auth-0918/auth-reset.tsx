"use client";

/**
 * 新密码屏（Orbit_0918）：设计 docs/designs/Orbit_0918/Orbit 首页.dc.html 422–463 行逐元素。
 * 真实行为来自 `usePasswordReset`（token 从 `location.hash` `#token=` 读取（43 位 `[A-Za-z0-9_-]`）、`sending` ref
 * 双提交保护、`POST /api/auth/password-reset/confirm`、成功后 `history.replaceState` 清 hash + `done`，全在 hook）。
 * 审阅修订 11 **SSR 形状**：先渲染 tokenValid 分支（主按钮 `disabled` 直到 `ready`），`useEffect` 读完 hash 后才切
 * 「链接已失效」分支（避免 hydration mismatch；无 token 链接会闪一帧，记录）。
 * 成功态：标题「密码已更新」+ 副标设计文案 + 第三行 t()「其他设备上的旧会话已失效，需要重新登录。」（保留旧实现的会话失效告知）。
 * 设计 431 / 445 是 button 元素（onClick=goForgot / goLogin），应用里是真实导航 → `<a class="btn au-btn-primary au-btn-link">`（记录）。
 * 本地校验（审阅修订 8）：`validateResetPair` 先长度「新密码至少 8 位。」后一致「两次输入的密码不一致。」，通过才 `submit`
 * （hook 内仍有不一致守卫，原样）。设计外的眼睛钮只在 登录 / 注册（hook 有 `showPassword`），本屏无（记录）。
 */
import { useState, type FormEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AuthBackToLogin, AuthErrorCard, AuthPrimaryButton, AUTH_PASSWORD_MAX_LENGTH } from "./auth-form";
import { AUTH_BUTTON_LABELS, AUTH_PASSWORD_MIN_LENGTH, authRoutePath, authTitleId, validateResetPair } from "./auth-model";
import { usePasswordReset } from "./use-password-reset";

export const AUTH_NEW_PASSWORD_ID = "au-new-password";
export const AUTH_CONFIRM_PASSWORD_ID = "au-confirm-password";

export function AuthReset() {
  const { t } = useOrbitLanguage();
  const session = usePasswordReset();
  const [localError, setLocalError] = useState("");
  const titleId = authTitleId("reset");

  // done 先于 tokenValid：hook 成功后清空 token（旧 JSX 同序），否则成功态会掉进「链接已失效」。
  if (session.ready && !session.tokenValid && !session.done) {
    return (
      <div className="au-view">
        <div className="au-head">
          <h2 className="au-h2" id={titleId}>{t({ en: "Link expired", zh: "链接已失效" })}</h2>
          <p className="au-sub">{t({ en: "This reset link is invalid or has expired. Reset links are only valid for 30 minutes.", zh: "这条重置链接无效或已过期。重置链接仅在 30 分钟内有效。" })}</p>
        </div>
        <a className="btn au-btn-primary au-btn-link" href={authRoutePath("forgot", "")}>{t({ en: "Request a new reset link", zh: "重新申请重置链接" })}</a>
        <AuthBackToLogin />
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateResetPair(session.password, session.confirmation);
    if (problem) {
      setLocalError(t(problem));
      return;
    }
    setLocalError("");
    await session.submit(event);
  }

  const labels = AUTH_BUTTON_LABELS.reset;
  const error = localError || session.error;

  return (
    <div className="au-view">
      <div className="au-head">
        <h2 className="au-h2" id={titleId}>{session.done ? t({ en: "Password updated", zh: "密码已更新" }) : t({ en: "Set a new password", zh: "设置新密码" })}</h2>
        <p className="au-sub">{session.done ? t({ en: "Your password has been reset. You can sign in with the new password now.", zh: "你的密码已重置，现在可以用新密码登录。" }) : t({ en: "Choose a new password of at least 8 characters.", zh: "请设置一个至少 8 位的新密码。" })}</p>
        {session.done ? <p className="au-sub">{t({ en: "Sessions on other devices have been signed out and need to sign in again.", zh: "其他设备上的旧会话已失效，需要重新登录。" })}</p> : null}
      </div>
      {session.done ? (
        <a className="btn au-btn-primary au-btn-link" href={authRoutePath("login", "")}>{t({ en: "Sign in with the new password", zh: "用新密码登录" })}</a>
      ) : (
        <form className="au-view" noValidate onSubmit={onSubmit}>
          <div className="au-fields">
            <div className="au-label">
              <label htmlFor={AUTH_NEW_PASSWORD_ID}>{t({ en: "New password", zh: "新密码" })}</label>
              <input
                autoComplete="new-password"
                className="au-input"
                id={AUTH_NEW_PASSWORD_ID}
                maxLength={AUTH_PASSWORD_MAX_LENGTH}
                minLength={AUTH_PASSWORD_MIN_LENGTH}
                onChange={(event) => session.setPassword(event.target.value)}
                placeholder={t({ en: "At least 8 characters", zh: "至少 8 位" })}
                required
                type="password"
                value={session.password}
              />
            </div>
            <div className="au-label">
              <label htmlFor={AUTH_CONFIRM_PASSWORD_ID}>{t({ en: "Confirm new password", zh: "确认新密码" })}</label>
              <input
                autoComplete="new-password"
                className="au-input"
                id={AUTH_CONFIRM_PASSWORD_ID}
                maxLength={AUTH_PASSWORD_MAX_LENGTH}
                minLength={AUTH_PASSWORD_MIN_LENGTH}
                onChange={(event) => session.setConfirmation(event.target.value)}
                placeholder={t({ en: "Enter it again", zh: "再输入一次" })}
                required
                type="password"
                value={session.confirmation}
              />
            </div>
          </div>
          <AuthErrorCard error={error} />
          <AuthPrimaryButton className="au-btn-primary" disabled={!session.ready} label={session.busy ? t(labels.loading) : t(labels.idle)} submitting={session.busy} />
        </form>
      )}
      <AuthBackToLogin />
    </div>
  );
}
