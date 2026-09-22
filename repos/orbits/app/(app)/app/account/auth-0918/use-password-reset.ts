"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";

// 原样抽自 account/reset-password/reset-password-form.tsx（7–19 行：token / sending ref、
// ready / password / confirmation / error / busy / done 状态、挂载后从 location.hash 读
// token；21–52 行：submit——双提交 / done 守卫、两次密码不一致本地校验、
// POST /api/auth/password-reset/confirm {token,password}、成功后清 token +
// history.replaceState 清 hash + done）。token 合法性判断（43 位 [A-Za-z0-9_-]）
// 原在 JSX 内联（59 行）：ref 原样暴露给旧 JSX，另以 `tokenValid` 暴露同一正则结果供新屏使用。

/** 与旧 JSX 第 59 行的内联正则一致。 */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface PasswordResetSession {
  busy: boolean;
  confirmation: string;
  done: boolean;
  error: string;
  password: string;
  /** 挂载后（已读 hash）才为 true；SSR / 首帧为 false。 */
  ready: boolean;
  setConfirmation: (value: string) => void;
  setPassword: (value: string) => void;
  submit: (event: FormEvent) => Promise<void>;
  /** 旧 JSX 直接读 `token.current`（59 行内联正则），故原样暴露 ref；提交成功后清空。 */
  token: RefObject<string>;
  /** `ready && RESET_TOKEN_PATTERN.test(token.current)`——新屏用这个，不再内联正则。 */
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

  return {
    busy,
    confirmation,
    done,
    error,
    password,
    ready,
    setConfirmation,
    setPassword,
    submit,
    token,
    tokenValid: ready && RESET_TOKEN_PATTERN.test(token.current),
  };
}
