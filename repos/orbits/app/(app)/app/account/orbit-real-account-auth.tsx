"use client";

import { FormEvent, useEffect, useState } from "react";
import type { OrbitAccountAuthViewModel } from "../orbit-account-auth-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon, Logo } from "../orbit-reference-primitives";

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

function readAccountAuthQuery(defaultNext: string) {
  const searchParams = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const rawNext = searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") ? rawNext : defaultNext;

  return {
    created: searchParams.get("created") === "1",
    email: searchParams.get("email") ?? "",
    next,
  };
}

export function OrbitRealAccountAuth({
  onClose,
  viewModel,
}: {
  onClose?: () => void;
  viewModel: OrbitAccountAuthViewModel;
}) {
  const { t } = useOrbitLanguage();
  const [query] = useState(() => readAccountAuthQuery(viewModel.defaultNext));
  const [email, setEmail] = useState(query.email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [code, setCode] = useState("");

  function handleClose() {
    if (onClose) {
      onClose();
      return;
    }
    navigate("/");
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSignup = viewModel.mode === "signup";
  const isForgot = viewModel.mode === "forgot";
  const message = query.created ? t({ en: "Account created. Please sign in and complete your general profile first.", zh: "账号已创建。请登录后先完成通用档案。" }) : "";
  const primary = isForgot && forgotStep === 2 ? t({ en: "Reset and sign in", zh: "重置并登录" }) : viewModel.primaryLabel;
  const switchHref = isSignup
    ? `/account/login?next=${encodeURIComponent(query.next)}`
    : `/account/signup?next=${encodeURIComponent(query.next)}`;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      if (isSignup) {
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
      navigate(query.next);
    }, 420);
  }

  return (
    <main className="orbit-account-auth-page" data-orbit-real-page>
      <div className="orbit-account-auth-backdrop" />
      <section aria-modal="true" className="orbit-account-auth-modal" role="dialog">
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
            <label className="orbit-account-auth-field">
              <span className="field-label">{t({ en: "Email", zh: "邮箱" })}</span>
              <input
                autoComplete="email"
                className="field"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t({ en: "Enter your email address", zh: "输入邮箱地址" })}
                required
                type="email"
                value={email}
              />
            </label>

            {isForgot && forgotStep === 2 ? (
              <>
                <div className="orbit-account-auth-field">
                  <span className="field-label">{t({ en: "Verification code", zh: "验证码" })}</span>
                  <input
                    className="field mono"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    placeholder={t({ en: "6-digit code", zh: "6 位验证码" })}
                    value={code}
                  />
                </div>
                <div className="orbit-account-auth-field">
                  <label className="field-label">{t({ en: "New password", zh: "新密码" })}</label>
                  <span style={{ display: "flex", gap: 8 }}>
                    <input
                      autoComplete="new-password"
                      className="field"
                      minLength={6}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t({ en: "Set a password of at least 6 characters", zh: "设置至少 6 位密码" })}
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" })}
                      className="btn btn-ghost hit-44"
                      onClick={() => setShowPassword((current) => !current)}
                      type="button"
                    >
                      <Icon name="eye" size={17} />
                    </button>
                  </span>
                </div>
              </>
            ) : !isForgot ? (
              <div className="orbit-account-auth-field">
                <span style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
                  <label className="field-label" style={{ marginBottom: 0 }}>{t({ en: "Password", zh: "密码" })}</label>
                  {!isSignup ? (
                    <a
                      href={`/app/account/forgot-password?next=${encodeURIComponent(query.next)}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(`/account/forgot-password?next=${encodeURIComponent(query.next)}`);
                      }}
                      style={{
                        color: "var(--accent)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {t({ en: "Forgot password?", zh: "忘记密码?" })}
                    </a>
                  ) : null}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <input
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="field"
                    minLength={isSignup ? 6 : undefined}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isSignup ? t({ en: "Set a password of at least 6 characters", zh: "设置至少 6 位密码" }) : t({ en: "Enter your password", zh: "输入密码" })}
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" })}
                    className="btn btn-ghost hit-44"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    <Icon name="eye" size={17} />
                  </button>
                </span>
              </div>
            ) : null}

            {error ? <div className="orbit-alert error" role="alert">{error}</div> : null}
            {message ? <div className="orbit-alert notice">{message}</div> : null}

            <button className="btn btn-primary btn-block btn-lg" disabled={submitting} type="submit">
              {submitting ? viewModel.busyLabel : primary}
              {!submitting ? <Icon color="var(--on-dark)" name="arrow" size={17} /> : null}
            </button>
          </form>

          <div className="orbit-account-auth-divider"><span /><em>{t({ en: "or", zh: "或" })}</em><span /></div>
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
