"use client";

/**
 * 登录后修改密码（含批量建账户的首次改密）。结构与类名照搬 auth-reset.tsx 的新密码屏（设计 422–463），
 * 不新造样式；隐藏的 `autocomplete="username"` 邮箱字段让密码管理器把新密码记到对的账户上。
 */
import { useOrbitLanguage } from "../../orbit-language-context";
import { AuthErrorCard, AuthPrimaryButton, AUTH_PASSWORD_MAX_LENGTH } from "./auth-form";
import { AUTH_BUTTON_LABELS, AUTH_PASSWORD_MIN_LENGTH } from "./auth-model";
import { usePasswordChange } from "./use-password-change";

export const AUTH_CHANGE_PASSWORD_TITLE_ID = "au-title-change-password";
export const AUTH_CURRENT_PASSWORD_ID = "au-current-password";
export const AUTH_CHANGED_PASSWORD_ID = "au-changed-password";

export function AuthChangePassword({ email, first, next }: { email: string; first: boolean; next: string }) {
  const { t } = useOrbitLanguage();
  const session = usePasswordChange({ email, next });
  const labels = AUTH_BUTTON_LABELS.reset;

  return (
    <div className="au-view">
      <div className="au-head">
        <h2 className="au-h2" id={AUTH_CHANGE_PASSWORD_TITLE_ID}>{t({ en: "Change password", ja: "パスワードを変更", zh: "修改密码" })}</h2>
        <p className="au-sub">{first
          ? t({ en: "Replace the initial password from your email with your own.", ja: "メールで届いた初期パスワードを、ご自身のものに変更してください。", zh: "请把邮件里的初始密码改成你自己的密码。" })
          : t({ en: "Enter your current password, then a new one.", ja: "現在のパスワードと新しいパスワードを入力します。", zh: "输入当前密码和新密码。" })}</p>
      </div>
      <form className="au-view" noValidate onSubmit={session.submit}>
        <input aria-hidden="true" autoComplete="username" hidden name="username" readOnly tabIndex={-1} type="email" value={email} />
        <div className="au-fields">
          <div className="au-label">
            <label htmlFor={AUTH_CURRENT_PASSWORD_ID}>{t({ en: "Current password", ja: "現在のパスワード", zh: "当前密码" })}</label>
            <input
              autoComplete="current-password"
              className="au-input"
              id={AUTH_CURRENT_PASSWORD_ID}
              maxLength={AUTH_PASSWORD_MAX_LENGTH}
              name="current-password"
              onChange={(event) => session.setCurrentPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={session.currentPassword}
            />
          </div>
          <div className="au-label">
            <label htmlFor={AUTH_CHANGED_PASSWORD_ID}>{t({ en: "New password", ja: "新しいパスワード", zh: "新密码" })}</label>
            <input
              autoComplete="new-password"
              className="au-input"
              id={AUTH_CHANGED_PASSWORD_ID}
              maxLength={AUTH_PASSWORD_MAX_LENGTH}
              minLength={AUTH_PASSWORD_MIN_LENGTH}
              name="new-password"
              onChange={(event) => session.setNewPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={session.newPassword}
            />
            <span className="au-hint">{t({ en: "At least 8 characters", ja: "8文字以上", zh: "至少 8 位" })}</span>
          </div>
        </div>
        <AuthErrorCard error={session.error} />
        <AuthPrimaryButton className="au-btn-primary" label={session.busy ? t(labels.loading) : t({ en: "Change password", ja: "パスワードを変更", zh: "修改密码" })} submitting={session.busy} />
      </form>
    </div>
  );
}
