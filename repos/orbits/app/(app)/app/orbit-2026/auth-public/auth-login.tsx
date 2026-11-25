"use client";

/** b1 / b12 登录态；认证请求和安全 next 由 useAccountAuth 处理。 */
import { useEffect, useState } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthGoogleButton, AuthNoticeCard, AuthPasswordField, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { useAccountAuth } from "./use-account-auth";
import type { SignInNote } from "../../../../api/_shared/mcp-access";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { agentConnectionsWords } from "../copy/agent-connections";
import { ClientTile } from "../agent-connections/parts";
import note from "../agent-connections/sign-in-note.module.css";

/** agent-design AG17 (approved draft D8): why the sign-in comes up — an assistant wants to connect, or a change waits. The rest of the dialog is unchanged. */
function SignInNoteLine({ note: value, language }: { note: SignInNote; language: OrbitLanguage }) {
  const t = agentConnectionsWords(language);
  return (
    <div className={note.note} role="note" data-orbit-sign-in-note={value.kind}>
      {value.kind === "connect" ? <ClientTile name={value.clientName} size="sm" /> : <span className={note.orbit} aria-hidden>O</span>}
      <div><b>{value.kind === "connect" ? t("signInConnect", { client: value.clientName }) : t("signInProposal")}</b><span>{value.kind === "connect" ? t("signInConnectLine") : t("signInProposalLine")}</span></div>
    </div>
  );
}

export function AuthLogin({ defaultNext, oauthProviders, signInNote = null }: { defaultNext: string; oauthProviders: readonly string[]; signInNote?: SignInNote | null }) {
  const { t, language } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("login"), defaultNext });
  const { error, localField, label, onSubmit } = useAuthSubmit(session, "login");
  // b1 #2: the failure message sits under the field it belongs to (wrong pair → under パスワード).
  const emailError = localField === "email" ? error : "";
  const passwordError = emailError ? "" : error;
  const next = session.query.next;
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <form className="au-view" method="post" noValidate onSubmit={onSubmit}>
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("login")}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</h2>
        <p className="au-sub">{t({ en: "Welcome back.", ja: "おかえりなさい。", zh: "欢迎回来。" })}</p>
      </div>
      {signInNote ? <SignInNoteLine note={signInNote} language={language} /> : null}
      <AuthNoticeCard notice={session.message} />
      {oauthProviders.includes("google") ? <AuthGoogleButton aria-label={t({ en: "Sign in with Google", ja: "Google でログイン", zh: "使用 Google 登录" })} label={t({ en: "Sign in with Google", ja: "Google でログイン", zh: "使用 Google 登录" })} onClick={session.onGoogleSignIn} /> : null}
      {oauthProviders.includes("google") ? <span className="au-divider">{t({ en: "Or use your email", ja: "またはメールアドレスで", zh: "或使用邮箱" })}</span> : null}
      <fieldset className="au-fields" disabled={!ready}>
        <AuthEmailField autoComplete="username" error={emailError} session={session} />
        <AuthPasswordField
          autoComplete="current-password"
          error={passwordError}
          placeholder="••••••••"
          session={session}
          trimPaste
        />
      </fieldset>
      <a className="au-forgot" href={authRoutePath("forgot", next)}>{t({ en: "Forgot password?", ja: "パスワードをお忘れですか？", zh: "忘记密码？" })}</a>
      <AuthPrimaryButton className="au-btn-login" disabled={!ready} label={label} submitting={session.submitting} />
      <p className="au-switch au-foot">
        {t({ en: "No account yet? ", ja: "アカウントをお持ちでない方は ", zh: "还没有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("register", next)}>{t({ en: "Sign up", ja: "新規登録", zh: "创建账号" })}</a>
      </p>
    </form>
  );
}
