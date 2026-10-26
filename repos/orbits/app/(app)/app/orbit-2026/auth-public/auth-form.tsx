"use client";

/** 认证四态共用的邮箱、密码、错误提示和提交控件。 */
import { useState, type FormEvent, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AUTH_BUTTON_LABELS, AUTH_PASSWORD_MIN_LENGTH, authRoutePath, validateEmail, validatePassword, type AuthView } from "./auth-model";
import type { AccountAuthSession } from "./use-account-auth";

export const AUTH_EMAIL_ID = "au-email";
export const AUTH_PASSWORD_ID = "au-password";
export const AUTH_PASSWORD_MAX_LENGTH = 72;

/**
 * 提交流程：先跑 auth-model 校验（设计 526–528 文案，零网络；找回只校验邮箱），通过后才交给 hook 的 `onSubmit`。
 * 成功态（「✓ 已登录」/「✓ 账号已创建」）读 hook 的 `succeeded`（成功路径导航前显式置位）；错误文案 hook 已对齐设计（任务 3）。
 * `onDelegate`（终审修正）：校验通过、真正调用 hook 之前同步回调一次——找回屏用它清「重新申请」的本地 `dismissed`，
 * 校验失败时不回调（否则失败提交会把上一次的成功卡重新亮出来而没有任何请求）。`onSubmit` 返回是否已委托给 hook。
 */
export function useAuthSubmit(session: AccountAuthSession, view: Exclude<AuthView, "reset">, onDelegate?: () => void) {
  const { t } = useOrbitLanguage();
  const [localError, setLocalError] = useState("");
  const [localField, setLocalField] = useState<"email" | "password" | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const emailProblem = validateEmail(session.email);
    const problem = emailProblem ?? (view === "forgot" ? null : validatePassword(session.password));
    if (problem) {
      setLocalError(t(problem));
      setLocalField(emailProblem ? "email" : "password");
      return false;
    }
    setLocalError("");
    setLocalField(null);
    onDelegate?.();
    await session.onSubmit(event);
    return true;
  }

  const labels = AUTH_BUTTON_LABELS[view];
  const label = session.submitting ? t(labels.loading) : session.succeeded && labels.success ? t(labels.success) : t(labels.idle);
  const error = localError || session.error;

  return { error, localError, localField, label, onSubmit };
}

export function AuthEmailField({ session, error }: { session: AccountAuthSession; error?: string }) {
  const { t } = useOrbitLanguage();
  return (
    <div className="au-label">
      <label htmlFor={AUTH_EMAIL_ID}>{t({ en: "Email", ja: "メールアドレス", zh: "邮箱" })}</label>
      <input
        autoComplete="email"
        aria-invalid={error ? true : undefined}
        className={`au-input${error ? " au-input-invalid" : ""}`}
        id={AUTH_EMAIL_ID}
        inputMode="email"
        onChange={(event) => session.setEmail(event.target.value)}
        placeholder="you@company.com"
        required
        type="email"
        value={session.email}
      />
      {error ? <p className="au-field-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function AuthPasswordField({
  autoComplete,
  error,
  labelExtra,
  placeholder,
  session,
}: {
  autoComplete: "current-password" | "new-password";
  error?: string;
  labelExtra?: ReactNode;
  placeholder: string;
  session: AccountAuthSession;
}) {
  const { t } = useOrbitLanguage();
  const label = <label htmlFor={AUTH_PASSWORD_ID}>{t({ en: "Password", ja: "パスワード", zh: "密码" })}</label>;
  return (
    <div className="au-label">
      {labelExtra ? <span className="au-label-row">{label}{labelExtra}</span> : label}
      <span className="au-field-wrap">
        <input
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={`au-input${error ? " au-input-invalid" : ""}`}
          id={AUTH_PASSWORD_ID}
          maxLength={AUTH_PASSWORD_MAX_LENGTH}
          minLength={AUTH_PASSWORD_MIN_LENGTH}
          onChange={(event) => session.setPassword(event.target.value)}
          placeholder={placeholder}
          required
          type={session.showPassword ? "text" : "password"}
          value={session.password}
        />
        <button
          aria-label={session.showPassword ? t({ en: "Hide password", ja: "パスワードを隠す", zh: "隐藏密码" }) : t({ en: "Show password", ja: "パスワードを表示", zh: "显示密码" })}
          aria-pressed={session.showPassword}
          className="btn au-eye"
          onClick={() => session.setShowPassword((current) => !current)}
          type="button"
        >
          {session.showPassword ? t({ en: "Hide", ja: "隠す", zh: "隐藏" }) : t({ en: "Show", ja: "表示", zh: "显示" })}
        </button>
      </span>
      {error ? <p className="au-field-error" role="alert">{error}</p> : null}
    </div>
  );
}

/** 设计 363（登录）/ 385（注册）错误卡；审阅修订 12：`role="alert"`。 */
export function AuthErrorCard({ error }: { error: string }) {
  return error ? <div className="au-error" role="alert">{error}</div> : null;
}

/** `?created=1` 提示（旧 `message`）：设计外，错误卡同尺寸的蓝色 notice；审阅修订 12：`role="status"`。 */
export function AuthNoticeCard({ notice }: { notice: string }) {
  return notice ? <div className="au-notice" role="status">{notice}</div> : null;
}

export function AuthPrimaryButton({
  className,
  disabled,
  label,
  submitting,
}: {
  className: "au-btn-login" | "au-btn-primary";
  /** 新密码屏：`ready` 之前禁用（审阅修订 11）；其余屏只随 submitting。 */
  disabled?: boolean;
  label: string;
  submitting: boolean;
}) {
  // 设计 366/388/414/456：`opacity:{{ btnOpacity }}`（renderVals 508：loading 0.6，否则 1）内联；其余全部走类。
  return (
    <button aria-busy={submitting || undefined} className={`btn ${className}`} disabled={submitting || Boolean(disabled)} style={{ opacity: submitting ? 0.6 : 1 }} type="submit">
      {label}
    </button>
  );
}

/** 设计 418 / 432 / 461「← 返回登录」：应用里是真实导航（找回带 `?next=`；新密码页无 next 上下文）。 */
export function AuthBackToLogin({ next = "" }: { next?: string }) {
  const { t } = useOrbitLanguage();
  return (
    <p className="au-back">
      <a className="au-back-link" href={authRoutePath("login", next)}>{t({ en: "← Back to sign in", ja: "← ログインに戻る", zh: "← 返回登录" })}</a>
    </p>
  );
}

/** b1 #2 / #3 .gbtn: 48px pill, surface with a surface-3 rim, a round「G」mark; the label differs for sign-in and sign-up. */
export function AuthGoogleButton({ "aria-label": ariaLabel, label, onClick }: { "aria-label"?: string; label: string; onClick: () => void }) {
  return (
    <button aria-label={ariaLabel} className="btn au-google" onClick={onClick} type="button">
      <span aria-hidden="true" className="au-g">G</span>
      {label}
    </button>
  );
}
