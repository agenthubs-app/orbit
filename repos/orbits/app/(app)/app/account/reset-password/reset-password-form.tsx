"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";

export function PasswordResetForm() {
  const { t } = useOrbitLanguage();
  const token = useRef("");
  const sending = useRef(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setReady(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || done) return;
    setError("");
    if (password !== confirmation) {
      setError(t({ zh: "两次输入的密码不一致。", en: "The passwords do not match." }));
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.current, password }),
      });
      const body = await response.json().catch(() => null) as { success?: boolean; error?: { message?: string } } | null;
      if (!response.ok || !body?.success) {
        setError(body?.error?.message ?? t({ zh: "重置失败，请稍后重试。", en: "Password reset failed. Please try again." }));
        return;
      }
      token.current = "";
      window.history.replaceState(null, "", window.location.pathname);
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch {
      setError(t({ zh: "网络异常，请重试；如果链接已使用，请尝试用新密码登录。", en: "Connection failed. Retry, or try signing in with the new password if the link has already been used." }));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

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
