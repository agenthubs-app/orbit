"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import type { OrbitAccountAuthViewModel } from "../orbit-account-auth-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { FormField, Icon, Logo } from "../orbit-reference-primitives";

function productHref(prototypeHref: string) {
  if (prototypeHref === "/") return "/app";
  if (prototypeHref.startsWith("/app")) return prototypeHref;
  if (prototypeHref.startsWith("/account/")) return `/app${prototypeHref}`;
  if (prototypeHref.startsWith("/home")) return `/app${prototypeHref}`;
  return `/app${prototypeHref}`;
}

function navigate(prototypeHref: string) {
  window.location.href = productHref(prototypeHref);
}

type AccountAuthQuery = { created: boolean; email: string; next: string };

// Server-safe fallback: no window access, so this returns the exact same
// value during SSR and during the client's first (pre-hydration) render.
// The real query string is only read post-mount (see the useEffect below) —
// reading window.location.search here would make the client's first render
// diverge from the server's markup (server always guesses `defaultNext`;
// the client would immediately compute the real `next` from the URL),
// producing a hydration mismatch on every `?next=` href in this form.
function accountAuthQueryFallback(defaultNext: string): AccountAuthQuery {
  return { created: false, email: "", next: defaultNext };
}

function readAccountAuthQueryFromLocation(defaultNext: string): AccountAuthQuery {
  const searchParams = new URLSearchParams(window.location.search);
  const rawNext = searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") ? rawNext : defaultNext;

  return {
    created: searchParams.get("created") === "1",
    email: searchParams.get("email") ?? "",
    next,
  };
}

export function OrbitRealAccountAuth({
  oauthProviders = [],
  onClose,
  viewModel,
}: {
  oauthProviders?: readonly string[];
  onClose?: () => void;
  viewModel: OrbitAccountAuthViewModel;
}) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState<AccountAuthQuery>(() =>
    accountAuthQueryFallback(viewModel.defaultNext),
  );
  const [email, setEmail] = useState(query.email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [code, setCode] = useState("");

  // Post-hydration update (legal — it runs after the first paint matches
  // SSR): now that we're definitely on the client, read the real ?next=/
  // ?email=/?created= from the URL and correct the state that was seeded
  // with the server-safe fallback above.
  useEffect(() => {
    const real = readAccountAuthQueryFromLocation(viewModel.defaultNext);
    setQuery(real);
    setEmail((current) => current || real.email);
  }, [viewModel.defaultNext]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    navigate("/");
  }, [onClose]);

  // Shared focus-trap/Esc/aria-modal behavior (audit P0-7) — this dialog
  // previously hand-rolled its own Esc listener with no focus trap.
  const cardRef = useOrbitModalA11y(handleClose);

  const isSignup = viewModel.mode === "signup";
  const isForgot = viewModel.mode === "forgot";
  const message = query.created ? t({ en: "Account created. Please sign in and complete your general profile first.", zh: "账号已创建。请登录后先完成通用档案。" }) : "";
  const primary = isForgot && forgotStep === 2 ? t({ en: "Reset and sign in", zh: "重置并登录" }) : viewModel.primaryLabel;
  const switchHref = isSignup
    ? `/account/login?next=${encodeURIComponent(query.next)}`
    : `/account/signup?next=${encodeURIComponent(query.next)}`;

  // 注册走 /api/auth/register,登录走 NextAuth credentials(auth.ts →
  // features/auth 校验)。忘记密码后端尚未接入,保持原型的两步视觉流程。
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
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
              ? t({ en: "An account with this email already exists.", zh: "该邮箱已注册,请直接登录。" })
              : payload?.error?.message ??
                  t({ en: "Sign-up failed. Please try again.", zh: "注册失败,请稍后再试。" }),
          );
          return;
        }

        navigate(
          `/account/login?next=${encodeURIComponent(query.next)}&created=1&email=${encodeURIComponent(email)}`,
        );
        return;
      }

      if (isForgot) {
        if (forgotStep === 1) {
          setForgotStep(2);
        } else {
          navigate(`/account/login?next=${encodeURIComponent(query.next)}`);
        }
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t({ en: "Email or password is incorrect.", zh: "邮箱或密码不正确。" }));
        return;
      }

      navigate(query.next);
    } catch {
      setError(t({ en: "Something went wrong. Please try again.", zh: "网络异常,请稍后再试。" }));
    } finally {
      setSubmitting(false);
    }
  }

  function onGoogleSignIn() {
    setError("");
    void signIn("google", { callbackUrl: productHref(query.next) });
  }

  return (
    <main className="orbit-account-auth-page" data-orbit-real-page>
      <div className="orbit-account-auth-backdrop" onClick={handleClose} />
      <section
        aria-label={viewModel.title}
        aria-modal="true"
        className="orbit-account-auth-modal"
        ref={cardRef}
        role="dialog"
        style={{ outline: "none" }}
        tabIndex={-1}
      >
        <div aria-hidden="true" className="orbit-account-auth-grip" />
        <header className="orbit-account-auth-modal-head">
          <Logo size={22} />
          <a
            aria-label={t({ en: "Close", zh: "关闭" })}
            className="orbit-account-auth-close"
            href="/app"
            onClick={(event) => {
              event.preventDefault();
              handleClose();
            }}
          >
            <Icon name="x" size={17} />
          </a>
        </header>
        <div className="orbit-account-auth-scroll scroll">
          <div className="orbit-account-auth-head">
            <span className="eyebrow">ACCOUNT</span>
            <h1 className="h-title">{viewModel.title}</h1>
            <p>{viewModel.description}</p>
          </div>
          <form className="orbit-account-auth-form" onSubmit={onSubmit}>
            <FormField className="orbit-account-auth-field" id="orbit-auth-email" label={t({ en: "Email", zh: "邮箱" })}>
              <input
                autoComplete="email"
                className="field"
                id="orbit-auth-email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t({ en: "Enter your email address", zh: "输入邮箱地址" })}
                required
                type="email"
                value={email}
              />
            </FormField>

            {isForgot && forgotStep === 2 ? (
              <>
                <FormField className="orbit-account-auth-field" id="orbit-auth-code" label={t({ en: "Verification code", zh: "验证码" })}>
                  <input
                    className="field mono"
                    id="orbit-auth-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    placeholder={t({ en: "6-digit code", zh: "6 位验证码" })}
                    value={code}
                  />
                </FormField>
                <FormField className="orbit-account-auth-field" id="orbit-auth-new-password" label={t({ en: "New password", zh: "新密码" })}>
                  <span className="orbit-field-with-affordance">
                    <input
                      autoComplete="new-password"
                      className="field"
                      id="orbit-auth-new-password"
                      minLength={6}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t({ en: "Set a password of at least 6 characters", zh: "设置至少 6 位密码" })}
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" })}
                      className="btn btn-icon orbit-field-affordance"
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((current) => !current)}
                      type="button"
                    >
                      <Icon name="eye" size={17} />
                    </button>
                  </span>
                </FormField>
              </>
            ) : !isForgot ? (
              <FormField
                className="orbit-account-auth-field"
                id="orbit-auth-password"
                label={t({ en: "Password", zh: "密码" })}
                labelExtra={!isSignup ? (
                  <a
                    href={`/app/account/forgot-password?next=${encodeURIComponent(query.next)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(`/account/forgot-password?next=${encodeURIComponent(query.next)}`);
                    }}
                    style={{
                      color: "var(--accent)",
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    {t({ en: "Forgot password?", zh: "忘记密码?" })}
                  </a>
                ) : undefined}
              >
                <span className="orbit-field-with-affordance">
                  <input
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="field"
                    id="orbit-auth-password"
                    minLength={isSignup ? 8 : undefined}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isSignup ? t({ en: "Set a password of at least 8 characters", zh: "设置至少 8 位密码" }) : t({ en: "Enter your password", zh: "输入密码" })}
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" })}
                    className="btn btn-icon orbit-field-affordance"
                    aria-pressed={showPassword}
                      onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    <Icon name="eye" size={17} />
                  </button>
                </span>
              </FormField>
            ) : null}

            {error ? <div className="orbit-alert error" role="alert">{error}</div> : null}
            {message ? <div className="orbit-alert notice">{message}</div> : null}

            <button aria-busy={submitting || undefined} className={`btn btn-primary btn-block btn-lg${submitting ? " is-loading" : ""}`} disabled={submitting} type="submit">
              {submitting ? viewModel.busyLabel : primary}
              {!submitting ? <Icon color="var(--on-dark)" name="arrow" size={17} /> : null}
            </button>
          </form>

          <div className="orbit-account-auth-divider"><span /><em>{t({ en: "or", zh: "或" })}</em><span /></div>
          {!isForgot && oauthProviders.includes("google") ? (
            <button
              className="btn btn-ghost btn-block"
              onClick={onGoogleSignIn}
              style={{ marginBottom: 10 }}
              type="button"
            >
              <svg aria-hidden="true" height="17" viewBox="0 0 24 24" width="17">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" fill="#34A853" />
                <path d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              {t({ en: "Continue with Google", zh: "使用 Google 登录" })}
            </button>
          ) : null}
          {!isForgot ? (
            <a
              className="btn btn-ghost btn-block orbit-account-auth-switch"
              href={productHref(switchHref)}
              onClick={(event) => {
                event.preventDefault();
                navigate(switchHref);
              }}
            >
              {viewModel.switchLabel}
            </a>
          ) : (
            <a
              className="btn btn-ghost btn-block orbit-account-auth-switch"
              href={productHref(`/account/login?next=${encodeURIComponent(query.next)}`)}
              onClick={(event) => {
                event.preventDefault();
                navigate(`/account/login?next=${encodeURIComponent(query.next)}`);
              }}
            >
              {viewModel.switchLabel}
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
