"use client";

import { useRef, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";

import { profileContinuationPath } from "../../profile/profile-onboarding-navigation";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AUTH_ERROR_COPY, AUTH_PASSWORD_MIN_LENGTH, authRoutePath, type AuthCopy } from "./auth-model";
import { navigate } from "./use-account-auth";

/** 服务端错误码 → 三语文案（HTTP 返回的中文 message 只作兜底）。 */
export const PASSWORD_CHANGE_ERROR_COPY = {
  CONFLICT: { en: "Your password was just changed elsewhere. Sign in again and retry.", ja: "パスワードが別の場所で変更されました。もう一度ログインしてからお試しください。", zh: "密码刚刚已被修改，请重新登录后再试。" },
  INVALID_INPUT: { en: "New password must be at least 8 characters and no more than 72 UTF-8 bytes.", ja: "新しいパスワードは8文字以上、UTF-8 で72バイト以内にしてください。", zh: "新密码至少 8 位，UTF-8 长度不超过 72 字节。" },
  NO_PASSWORD: { en: "This account signs in with Google and has no password to change.", ja: "このアカウントは Google でログインするため、変更するパスワードがありません。", zh: "该账号通过 Google 登录，没有可修改的密码。" },
  SAME_PASSWORD: { en: "The new password must differ from the current one.", ja: "新しいパスワードは現在のものと別にしてください。", zh: "新密码不能与当前密码相同。" },
  UNAUTHORIZED: { en: "Your session has ended. Please sign in again.", ja: "ログインの有効期限が切れました。もう一度ログインしてください。", zh: "登录已失效，请重新登录。" },
  WRONG_PASSWORD: { en: "The current password is incorrect.", ja: "現在のパスワードが正しくありません。", zh: "当前密码不正确。" },
} as const satisfies Record<string, AuthCopy>;

const CURRENT_REQUIRED: AuthCopy = { en: "Enter your current password.", ja: "現在のパスワードを入力してください。", zh: "请输入当前密码。" };

/** 本地校验（零网络）：当前密码必填；新密码长度规则同注册 / 重置；不能与当前相同。 */
export function validatePasswordChange(currentPassword: string, newPassword: string): AuthCopy | null {
  if (!currentPassword) return CURRENT_REQUIRED;
  if (newPassword.length < AUTH_PASSWORD_MIN_LENGTH) return AUTH_ERROR_COPY.resetTooShort;
  if (new TextEncoder().encode(newPassword).byteLength > 72) return AUTH_ERROR_COPY.passwordTooLong;
  if (newPassword === currentPassword) return PASSWORD_CHANGE_ERROR_COPY.SAME_PASSWORD;
  return null;
}

export interface PasswordChangeSession {
  busy: boolean;
  currentPassword: string;
  error: string;
  newPassword: string;
  setCurrentPassword: (value: string) => void;
  setNewPassword: (value: string) => void;
  submit: (event: FormEvent) => Promise<void>;
}

/**
 * 成功后旧会话随 passwordChangedAt 失效：用新密码重新 `signIn("credentials")`，再去 `next`（经资料续接）；
 * 重新登录失败时回登录页（带 next）。
 */
export function usePasswordChange({ email, next }: { email: string; next: string }): PasswordChangeSession {
  const { t } = useOrbitLanguage();
  const sending = useRef(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const problem = validatePasswordChange(currentPassword, newPassword);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError("");
    sending.current = true;
    setBusy(true);
    let leaving = false;
    try {
      const response = await fetch("/api/auth/password/change", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => null) as { success?: boolean; error?: { code?: string; message?: string } } | null;
      if (!response.ok || !body?.success) {
        const code = body?.error?.code as keyof typeof PASSWORD_CHANGE_ERROR_COPY | undefined;
        setError(code && code in PASSWORD_CHANGE_ERROR_COPY ? t(PASSWORD_CHANGE_ERROR_COPY[code])
          : body?.error?.message ?? t({ en: "Could not change the password. Please try again later.", ja: "パスワードを変更できませんでした。しばらくしてからお試しください。", zh: "修改失败，请稍后重试。" }));
        return;
      }
      const renewed = await signIn("credentials", { email, password: newPassword, redirect: false }).catch(() => null);
      leaving = true;
      navigate(renewed && !renewed.error ? profileContinuationPath(next) : authRoutePath("login", next));
    } catch {
      setError(t({ en: "Connection failed. Please try again.", ja: "通信エラーが発生しました。もう一度お試しください。", zh: "网络异常，请稍后再试。" }));
    } finally {
      // Navigating away: keep the button busy so it cannot be pressed again with the now-stale password.
      if (!leaving) {
        sending.current = false;
        setBusy(false);
      }
    }
  }

  return { busy, currentPassword, error, newPassword, setCurrentPassword, setNewPassword, submit };
}
