"use client";

/** Reset token comes from the URL fragment and is cleared by usePasswordReset after confirmation. */
import { useState, type FormEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AuthErrorCard, AuthPrimaryButton, AUTH_PASSWORD_MAX_LENGTH } from "./auth-form";
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
          <h2 className="au-h2" id={titleId}>{t({ en: "This link cannot be used", ja: "このリンクは使えません", zh: "此链接无法使用" })}</h2>
          <p className="au-sub" role="alert">{t({ en: "The link may be invalid or already used.", ja: "リンクが無効か、すでに使われている可能性があります。", zh: "链接可能已失效或已被使用。" })}</p>
        </div>
        <a className="btn au-btn-primary au-btn-link" href={authRoutePath("forgot", "")}>{t({ en: "Request a reset", ja: "再設定を申し込む", zh: "申请重置密码" })}</a>
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
        <h2 className="au-h2" id={titleId}>{session.done ? t({ en: "Password updated", ja: "パスワードを更新しました", zh: "密码已更新" }) : t({ en: "New password", ja: "新しいパスワード", zh: "新密码" })}</h2>
        <p className="au-sub">{session.done ? t({ en: "Sign in with your new password.", ja: "新しいパスワードでログインできます。", zh: "请使用新密码登录。" }) : t({ en: "Set it from the link in your email.", ja: "メールで受け取ったリンクから設定します。", zh: "通过邮件中的链接设置密码。" })}</p>
      </div>
      {session.done ? (
        <a className="btn au-btn-primary au-btn-link" href={authRoutePath("login", "")}>{t({ en: "Sign in with the new password", ja: "新しいパスワードでログイン", zh: "用新密码登录" })}</a>
      ) : (
        <form className="au-view" noValidate onSubmit={onSubmit}>
          <div className="au-fields">
            <div className="au-label">
              <label htmlFor={AUTH_NEW_PASSWORD_ID}>{t({ en: "New password", ja: "新しいパスワード", zh: "新密码" })}</label>
              <input
                autoComplete="new-password"
                className="au-input"
                id={AUTH_NEW_PASSWORD_ID}
                maxLength={AUTH_PASSWORD_MAX_LENGTH}
                minLength={AUTH_PASSWORD_MIN_LENGTH}
                onChange={(event) => session.setPassword(event.target.value)}
                placeholder="••••••••"
                required
                type="password"
                value={session.password}
              />
              <span className="au-hint">{t({ en: "At least 8 characters", ja: "8文字以上", zh: "至少 8 位" })}</span>
            </div>
            <div className="au-label">
              <label htmlFor={AUTH_CONFIRM_PASSWORD_ID}>{t({ en: "Enter it again", ja: "もう一度入力", zh: "再次输入" })}</label>
              <input
                autoComplete="new-password"
                className="au-input"
                id={AUTH_CONFIRM_PASSWORD_ID}
                maxLength={AUTH_PASSWORD_MAX_LENGTH}
                minLength={AUTH_PASSWORD_MIN_LENGTH}
                onChange={(event) => session.setConfirmation(event.target.value)}
                placeholder={t({ en: "Enter it again", ja: "もう一度入力", zh: "再输入一次" })}
                required
                type="password"
                value={session.confirmation}
              />
            </div>
          </div>
          <AuthErrorCard error={error} />
          <AuthPrimaryButton className="au-btn-primary" disabled={!session.ready} label={session.busy ? t(labels.loading) : t({ en: "Change password and return to sign in", ja: "変更してログインへ", zh: "修改密码并返回登录" })} submitting={session.busy} />
        </form>
      )}
    </div>
  );
}
