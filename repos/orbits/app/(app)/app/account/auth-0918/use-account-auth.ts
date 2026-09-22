"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { normalizeOrbitAuthReturnPath } from "../../../../../features/auth/app-auth-routing";
import {
  normalizeProfileAuthReturnPath,
  profileContinuationPath,
} from "../../profile/profile-onboarding-navigation";
import type { OrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AUTH_ERROR_COPY } from "./auth-model";

// 原样抽自 account/orbit-real-account-auth.tsx（15–57 行：productHref / navigate /
// AccountAuthQuery / SSR 安全回退 / 从 location 读 query；68–78 行：状态；83–87 行：
// 挂载后读取真实 ?next=/?email=/?created=；101–120 行：isSignup / isForgot / created
// 提示 / 主按钮文案 / 切换链接；122–208 行：onSubmit（注册 → /api/auth/register +
// 自动 signIn("credentials")；找回 → /api/auth/password-reset/request；登录 →
// signIn("credentials") + profile continuation）与 onGoogleSignIn）。
// 关闭动作 `handleClose` + `useOrbitModalA11y` 在 auth-modal.tsx（tests/ui/orbit-modal-standard 锁定）。
// 任务 3（旧组件已删）：登录失败 / 409 文案对齐设计 526–527（`AUTH_ERROR_COPY`，撤掉任务 2 的
// `bridgeLegacyAuthError` 过渡桥）；新增 `succeeded`（登录 / 注册成功路径显式置位，供「✓ 已登录」
// 「✓ 账号已创建」，替代 submitting true→false 的推断）；`resetNotice` 文案改为 `resetSent` 布尔
// （找回成功卡文案由屏内 t() 给出设计 401–404 文案 + 「受理 ≠ 送达」补句）。

export function productHref(prototypeHref: string) {
  if (prototypeHref === "/") return "/app";
  if (prototypeHref.startsWith("/app")) return prototypeHref;
  if (prototypeHref.startsWith("/account/")) return `/app${prototypeHref}`;
  if (prototypeHref.startsWith("/home")) return `/app${prototypeHref}`;
  return `/app${prototypeHref}`;
}

export function navigate(prototypeHref: string) {
  window.location.href = productHref(prototypeHref);
}

export type AccountAuthQuery = { created: boolean; email: string; next: string };

// Server-safe fallback: no window access, so this returns the exact same
// value during SSR and during the client's first (pre-hydration) render.
// The real query string is only read post-mount (see the useEffect below) —
// reading window.location.search here would make the client's first render
// diverge from the server's markup (server always guesses `defaultNext`;
// the client would immediately compute the real `next` from the URL),
// producing a hydration mismatch on every `?next=` href in this form.
function accountAuthQueryFallback(defaultNext: string): AccountAuthQuery {
  return {
    created: false,
    email: "",
    next: normalizeProfileAuthReturnPath(defaultNext),
  };
}

function readAccountAuthQueryFromLocation(defaultNext: string): AccountAuthQuery {
  const searchParams = new URLSearchParams(window.location.search);
  const rawNext = searchParams.get("next") ?? "";
  const next = normalizeProfileAuthReturnPath(
    normalizeOrbitAuthReturnPath(rawNext, defaultNext),
    defaultNext,
  );

  return {
    created: searchParams.get("created") === "1",
    email: searchParams.get("email") ?? "",
    next,
  };
}

export interface AccountAuthSession {
  email: string;
  error: string;
  isForgot: boolean;
  isSignup: boolean;
  /** 注册成功但自动登录未建立会话时（?created=1）的登录页提示；否则空串。 */
  message: string;
  onGoogleSignIn: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  /** 主按钮文案：找回态固定「申请重置链接」，其余取 viewModel.primaryLabel。 */
  primary: string;
  query: AccountAuthQuery;
  password: string;
  /** 找回：`/api/auth/password-reset/request` 已受理（受理 ≠ 送达）；下次提交时复位。 */
  resetSent: boolean;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setShowPassword: (update: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
  submitting: boolean;
  /** 登录 / 注册成功路径（导航前）显式置位；下次提交时复位。 */
  succeeded: boolean;
  /** 登录 ⇄ 注册 的原型路径（未经 productHref），带当前 next。 */
  switchHref: string;
}

export function useAccountAuth(viewModel: OrbitAccountAuthViewModel): AccountAuthSession {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState<AccountAuthQuery>(() =>
    accountAuthQueryFallback(viewModel.defaultNext),
  );
  const [email, setEmail] = useState(query.email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  // Post-hydration update (legal — it runs after the first paint matches
  // SSR): now that we're definitely on the client, read the real ?next=/
  // ?email=/?created= from the URL and correct the state that was seeded
  // with the server-safe fallback above.
  useEffect(() => {
    const real = readAccountAuthQueryFromLocation(viewModel.defaultNext);
    setQuery(real);
    setEmail((current) => current || real.email);
  }, [viewModel.defaultNext]);

  const isSignup = viewModel.mode === "signup";
  const isForgot = viewModel.mode === "forgot";
  // 注册成功但自动登录未建立会话时，回到登录页继续完成登录；建立会话
  // 后由 profile continuation 读取权威资料状态，再决定是否需要补全档案。
  const message = query.created
    ? t({
        en: "Account created, but automatic sign-in did not complete. Sign in with the password you just set.",
        ja: "アカウントは作成されましたが、自動サインインが完了しませんでした。設定したパスワードでサインインしてください。",
        zh: "账号已创建，但自动登录未完成。请用刚设置的密码登录。",
      })
    : "";
  const primary = isForgot
    ? t({
        en: "Request reset link",
        zh: "申请重置链接",
      })
    : viewModel.primaryLabel;
  const switchHref = isSignup
    ? `/account/login?next=${encodeURIComponent(query.next)}`
    : `/account/signup?next=${encodeURIComponent(query.next)}`;

  // 注册走 /api/auth/register，登录走 NextAuth credentials（auth.ts →
  // features/auth 校验）。恢复申请写入持久化邮件队列，受理不等于已送达。
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResetSent(false);
    setSucceeded(false);
    setSubmitting(true);

    try {
      if (isSignup) {
        const response = await fetch("/api/auth/register", {
          body: JSON.stringify({ email, password }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
          success?: boolean;
        } | null;

        if (!response.ok || payload?.success !== true) {
          setError(
            response.status === 409
              ? t(AUTH_ERROR_COPY.emailTaken)
              : payload?.error?.message ??
                  t({ en: "Sign-up failed. Please try again.", zh: "注册失败,请稍后再试。" }),
          );
          return;
        }

        // 注册成功后用登录页同一套 credentials 机制直接建立会话，免去用户
        // 重输一遍刚设置的密码；自动登录失败才退回登录页，并如实说明原因。
        setSucceeded(true);
        const autoSignIn = await signIn("credentials", {
          email,
          password,
          redirect: false,
        }).catch(() => null);

        if (autoSignIn && !autoSignIn.error) {
          navigate(profileContinuationPath(query.next));
          return;
        }

        navigate(
          `/account/login?next=${encodeURIComponent(query.next)}&created=1&email=${encodeURIComponent(email)}`,
        );
        return;
      }

      if (isForgot) {
        const response = await fetch("/api/auth/password-reset/request", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; error?: { message?: string } } | null;
        if (!response.ok || !payload?.success) {
          setError(payload?.error?.message ?? t({ en: "Password recovery is temporarily unavailable. Please try again later.", zh: "密码恢复暂不可用，请稍后重试。" }));
          return;
        }
        // 受理 ≠ 送达：只置位，文案由找回屏给出（设计 401–404 + 「如果该邮箱支持密码恢复，链接会很快送达。」）。
        setResetSent(true);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError(t(AUTH_ERROR_COPY.loginFailed));
        return;
      }

      setSucceeded(true);
      navigate(profileContinuationPath(query.next));
    } catch {
      setError(t({ en: "Something went wrong. Please try again.", zh: "网络异常,请稍后再试。" }));
    } finally {
      setSubmitting(false);
    }
  }

  function onGoogleSignIn() {
    setError("");
    void signIn("google", {
      callbackUrl: productHref(profileContinuationPath(query.next)),
    });
  }

  return {
    email,
    error,
    isForgot,
    isSignup,
    message,
    onGoogleSignIn,
    onSubmit,
    password,
    primary,
    query,
    resetSent,
    setEmail,
    setPassword,
    setShowPassword,
    showPassword,
    submitting,
    succeeded,
    switchHref,
  };
}
