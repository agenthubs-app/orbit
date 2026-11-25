"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";
import { normalizeProfileAuthReturnPath } from "../../profile/profile-onboarding-navigation";

// 原样抽自 account/reset-password/reset-password-form.tsx（7–19 行：token / sending ref、
// ready / password / confirmation / error / busy / done 状态、挂载后从 location.hash 读
// token；21–52 行：submit——双提交 / done 守卫、两次密码不一致本地校验、
// POST /api/auth/password-reset/confirm {token,password}、成功后清 token +
// history.replaceState 清 hash + done）。token 合法性判断（43 位 [A-Za-z0-9_-]）
// 原在 JSX 内联（59 行）：以 `tokenValid` 暴露同一正则结果供新屏使用。
// 合并前终审修正：旧 JSX 已删，`token` ref 不再暴露（grep 全仓无消费者）；ref 仍是 hook 内部状态。

/**
 * 找回密码时的原页面：邮件里的重设链接只带 token（地址由服务端异步投递任务生成），所以在申请的浏览器本机记住
 * `next`，重设完成后的「用新密码登录」带回去。与重设链接同寿命（30 分钟，PASSWORD_RESET_TTL_MS）；
 * 换设备 / 清了存储时照常回默认首页。
 */
const RESET_RETURN_KEY = "orbit:auth:reset-next";
const RESET_RETURN_TTL_MS = 30 * 60 * 1000;

export function rememberPasswordResetReturnPath(next: string, now = Date.now()): void {
  try {
    window.localStorage.setItem(RESET_RETURN_KEY, JSON.stringify({ next: normalizeProfileAuthReturnPath(next), expiresAt: now + RESET_RETURN_TTL_MS }));
  } catch {
    // Storage unavailable: the reset still works, sign-in then goes to the default page.
  }
}

export function readPasswordResetReturnPath(now = Date.now()): string {
  try {
    const stored = window.localStorage.getItem(RESET_RETURN_KEY);
    if (!stored) return "";
    const value = JSON.parse(stored) as { next?: unknown; expiresAt?: unknown };
    if (typeof value.next !== "string" || typeof value.expiresAt !== "number" || value.expiresAt <= now) {
      window.localStorage.removeItem(RESET_RETURN_KEY);
      return "";
    }
    return normalizeProfileAuthReturnPath(value.next);
  } catch {
    return "";
  }
}

export function forgetPasswordResetReturnPath(): void {
  try { window.localStorage.removeItem(RESET_RETURN_KEY); } catch { /* storage may be unavailable */ }
}

/** 与旧 JSX 第 59 行的内联正则一致。 */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface PasswordResetSession {
  busy: boolean;
  confirmation: string;
  done: boolean;
  error: string;
  /** 申请找回时记下的原页面（没有则空串）：登录链接带上它。 */
  next: string;
  password: string;
  /** 挂载后（已读 hash）才为 true；SSR / 首帧为 false。 */
  ready: boolean;
  setConfirmation: (value: string) => void;
  setPassword: (value: string) => void;
  submit: (event: FormEvent) => Promise<void>;
  /** `ready && RESET_TOKEN_PATTERN.test(token.current)`——新屏用这个，不再内联正则；提交成功后 token 清空。 */
  tokenValid: boolean;
}

export function usePasswordReset(): PasswordResetSession {
  const { t } = useOrbitLanguage();
  const token = useRef("");
  const sending = useRef(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [next, setNext] = useState("");
  useEffect(() => {
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setNext(readPasswordResetReturnPath());
    setReady(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || done) return;
    setError("");
    if (password !== confirmation) {
      setError(t({ zh: "两次输入的密码不一致。", ja: "パスワードが一致しません。", en: "The passwords do not match." }));
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
        setError(body?.error?.message ?? t({ zh: "重置失败，请稍后重试。", ja: "再設定できませんでした。もう一度お試しください。", en: "Password reset failed. Please try again." }));
        return;
      }
      token.current = "";
      window.history.replaceState(null, "", window.location.pathname);
      setPassword("");
      setConfirmation("");
      // 原页面已交给「用新密码登录」的链接，本机不再留着。
      forgetPasswordResetReturnPath();
      setDone(true);
    } catch {
      setError(t({ zh: "网络异常，请重试；如果链接已使用，请尝试用新密码登录。", ja: "通信エラーです。再試行するか、新しいパスワードでログインしてください。", en: "Connection failed. Retry, or try signing in with the new password if the link has already been used." }));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    confirmation,
    done,
    error,
    next,
    password,
    ready,
    setConfirmation,
    setPassword,
    submit,
    tokenValid: ready && RESET_TOKEN_PATTERN.test(token.current),
  };
}
