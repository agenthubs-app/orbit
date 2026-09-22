"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { usePasswordReset } from "../auth-0918/use-password-reset";

// 认证弹窗 任务 1：token / 状态 / submit 原样搬入 ../auth-0918/use-password-reset.ts；
// 本文件只保留 JSX（不动）。

export function PasswordResetForm() {
  const { t } = useOrbitLanguage();
  const { busy, confirmation, done, error, password, ready, setConfirmation, setPassword, submit, token } = usePasswordReset();

  return <main className="orbit-account-auth-page" data-orbit-real-page>
    <section className="orbit-account-auth-modal" aria-labelledby="reset-title">
      <div className="orbit-account-auth-scroll scroll">
        <h1 id="reset-title" className="h-title">{t({ zh: "设置新密码", en: "Set a new password" })}</h1>
        {done ? <p role="status">{t({ zh: "密码已更新，旧会话已失效。请用新密码登录。", en: "Password updated and previous sessions revoked. Sign in with your new password." })}</p>
          : ready && !/^[A-Za-z0-9_-]{43}$/u.test(token.current) ? <p role="alert">{t({ zh: "重置链接不完整，请重新申请。", en: "This reset link is incomplete. Request a new one." })}</p>
          : <form onSubmit={submit} className="orbit-account-auth-form">
            <p>{t({ zh: "密码至少 8 位。完成后，你需要在其他设备上重新登录。", en: "Use at least 8 characters. You will need to sign in again on other devices." })}</p>
            <label htmlFor="reset-password">{t({ zh: "新密码", en: "New password" })}</label>
            <input id="reset-password" className="field" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
            <label htmlFor="reset-confirmation">{t({ zh: "再次输入新密码", en: "Confirm new password" })}</label>
            <input id="reset-confirmation" className="field" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            {error ? <p role="alert" className="orbit-alert error">{error}</p> : null}
            <button className="btn btn-primary btn-block" type="submit" disabled={!ready || busy} aria-busy={busy}>{busy ? t({ zh: "更新中…", en: "Updating…" }) : t({ zh: "更新密码", en: "Update password" })}</button>
          </form>}
        <a className="btn btn-ghost btn-block" href="/app/account/login">{t({ zh: "返回登录", en: "Back to sign-in" })}</a>
        {!done ? <a className="btn btn-ghost btn-block" href="/app/account/forgot-password">{t({ zh: "重新申请链接", en: "Request a new link" })}</a> : null}
      </div>
    </section>
  </main>;
}
