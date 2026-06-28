"use client";

import { FormEvent, useState } from "react";
import type { OrbitAccountAuthViewModel } from "../orbit-account-auth-route-view-model";
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
  const [query] = useState(() => readAccountAuthQuery(viewModel.defaultNext));
  const [email, setEmail] = useState(query.email);
  const [password, setPassword] = useState("");
  const [error] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [code, setCode] = useState("");

  const isSignup = viewModel.mode === "signup";
  const isForgot = viewModel.mode === "forgot";
  const message = query.created ? "账号已创建。请登录后先完成通用档案。" : "";
  const primary = isForgot && forgotStep === 2 ? "重置并登录" : viewModel.primaryLabel;
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
            aria-label="关闭"
            className="orbit-account-auth-close"
            href="/app"
            onClick={(event) => {
              event.preventDefault();
              if (onClose) {
                onClose();
                return;
              }
              navigate("/");
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
              <span className="field-label">邮箱</span>
              <input
                autoComplete="username"
                className="field"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="输入邮箱地址"
                required
                type="email"
                value={email}
              />
            </label>

            {isForgot && forgotStep === 2 ? (
              <>
                <div className="orbit-account-auth-field">
                  <span className="field-label">验证码</span>
                  <input
                    className="field mono"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    placeholder="6 位验证码"
                    value={code}
                  />
                </div>
                <div className="orbit-account-auth-field">
                  <label className="field-label">新密码</label>
                  <input
                    autoComplete="new-password"
                    className="field"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="设置至少 6 位密码"
                    required
                    type="password"
                    value={password}
                  />
                </div>
              </>
            ) : !isForgot ? (
              <div className="orbit-account-auth-field">
                <span style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
                  <label className="field-label" style={{ marginBottom: 0 }}>密码</label>
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
                      忘记密码?
                    </a>
                  ) : null}
                </span>
                <input
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  className="field"
                  minLength={isSignup ? 6 : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? "设置至少 6 位密码" : "输入密码"}
                  required
                  type="password"
                  value={password}
                />
              </div>
            ) : null}

            {error ? <div className="orbit-alert error">{error}</div> : null}
            {message ? <div className="orbit-alert notice">{message}</div> : null}

            <button className="btn btn-primary btn-block btn-lg" disabled={submitting} type="submit">
              {submitting ? viewModel.busyLabel : primary}
              {!submitting ? <Icon color="#fff" name="arrow" size={17} /> : null}
            </button>
          </form>

          <div className="orbit-account-auth-divider"><span /><em>或</em><span /></div>
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
