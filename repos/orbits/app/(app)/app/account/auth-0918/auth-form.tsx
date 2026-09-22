"use client";

/**
 * 认证弹窗（Orbit_0918）登录 / 注册 / 找回 共用的表单件：邮箱字段（设计 354–356 / 408–410）、密码字段（357–360 / 381–383，
 * 含设计外的 显示/隐藏 眼睛钮 `btn au-eye`，审阅修订 9）、错误卡（363 / 385 / 412 / 453）、created 提示（设计外蓝色 notice）、
 * 「← 返回登录」行（418 / 432 / 461）、Google 钮（设计外 `btn au-google`）与 提交流程 hook（`<form noValidate>` + 本地校验，审阅修订 8）。
 * 文件不在计划的文件结构清单内（记录）：多屏共享的部分抽出，避免各屏各抄一份。
 */
import { useState, type FormEvent, type ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { Icon } from "../../orbit-reference-primitives";
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

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const problem = validateEmail(session.email) ?? (view === "forgot" ? null : validatePassword(session.password));
    if (problem) {
      setLocalError(t(problem));
      return false;
    }
    setLocalError("");
    onDelegate?.();
    await session.onSubmit(event);
    return true;
  }

  const labels = AUTH_BUTTON_LABELS[view];
  const label = session.submitting ? t(labels.loading) : session.succeeded && labels.success ? t(labels.success) : t(labels.idle);
  const error = localError || session.error;

  return { error, label, onSubmit };
}

export function AuthEmailField({ session }: { session: AccountAuthSession }) {
  const { t } = useOrbitLanguage();
  return (
    <div className="au-label">
      <label htmlFor={AUTH_EMAIL_ID}>{t({ en: "Email", zh: "邮箱" })}</label>
      <input
        autoComplete="email"
        className="au-input"
        id={AUTH_EMAIL_ID}
        inputMode="email"
        onChange={(event) => session.setEmail(event.target.value)}
        placeholder="you@company.com"
        required
        type="email"
        value={session.email}
      />
    </div>
  );
}

export function AuthPasswordField({
  autoComplete,
  labelExtra,
  placeholder,
  session,
}: {
  autoComplete: "current-password" | "new-password";
  labelExtra?: ReactNode;
  placeholder: string;
  session: AccountAuthSession;
}) {
  const { t } = useOrbitLanguage();
  const label = <label htmlFor={AUTH_PASSWORD_ID}>{t({ en: "Password", zh: "密码" })}</label>;
  return (
    <div className="au-label">
      {labelExtra ? <span className="au-label-row">{label}{labelExtra}</span> : label}
      <span className="au-field-wrap">
        <input
          autoComplete={autoComplete}
          className="au-input"
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
          aria-label={session.showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" })}
          aria-pressed={session.showPassword}
          className="btn au-eye"
          onClick={() => session.setShowPassword((current) => !current)}
          type="button"
        >
          <Icon name="eye" size={17} />
        </button>
      </span>
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
      <a className="au-back-link" href={authRoutePath("login", next)}>{t({ en: "← Back to sign in", zh: "← 返回登录" })}</a>
    </p>
  );
}

/** 设计外：`oauthProviders.includes("google")` 时在主按钮下方加一枚 Google 钮（白底 #DDDEFA 边、999px、与主按钮同 padding）。 */
export function AuthGoogleButton({ onClick }: { onClick: () => void }) {
  const { t } = useOrbitLanguage();
  return (
    <button className="btn au-google" onClick={onClick} type="button">
      <svg aria-hidden="true" height="17" viewBox="0 0 24 24" width="17">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" fill="#34A853" />
        <path d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
      </svg>
      {t({ en: "Continue with Google", zh: "使用 Google 登录" })}
    </button>
  );
}
