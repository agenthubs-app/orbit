"use client";

/** b1 #3 注册态；条款在新标签打开、勾选同意后才能提交，注册后尝试自动登录。 */
import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthErrorCard, AuthGoogleButton, AuthPasswordField, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { AUTH_PASSWORD_MIN_LENGTH, authRoutePath, authTitleId } from "./auth-model";
import { Checkbox, Icon } from "../ui";
import { useAccountAuth } from "./use-account-auth";

export function AuthRegister({ defaultNext, oauthProviders }: { defaultNext: string; oauthProviders: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("signup"), defaultNext });
  const { error, localError, localField, label, onSubmit } = useAuthSubmit(session, "register");
  const emailError = session.emailTaken ? error : localField === "email" ? localError : "";
  const passwordError = localField === "password" ? localError : "";
  const next = session.query.next;
  const [agreed, setAgreed] = useState(false);
  const longEnough = session.password.length >= AUTH_PASSWORD_MIN_LENGTH;

  return (
    <form className="au-view" noValidate onSubmit={onSubmit}>
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("register")}>{t({ en: "Create account", ja: "アカウントを作成", zh: "创建账号" })}</h2>
        <p className="au-sub">{t({ en: "It takes about a minute. You can add your cards right after.", ja: "1分で完了します。名刺の取り込みはこのあとすぐ。", zh: "约 1 分钟完成，之后马上就能导入名片。" })}</p>
      </div>
      {oauthProviders.includes("google") ? <AuthGoogleButton label={t({ en: "Sign up with Google", ja: "Google で登録", zh: "使用 Google 注册" })} onClick={session.onGoogleSignIn} /> : null}
      {oauthProviders.includes("google") ? <span className="au-divider">{t({ en: "Or use your email", ja: "またはメールアドレスで", zh: "或使用邮箱" })}</span> : null}
      <div className="au-fields">
        <AuthEmailField error={emailError} session={session} />
        <AuthPasswordField autoComplete="new-password" error={passwordError} placeholder="••••••••" session={session} />
      </div>
      <div className={`au-reqs${longEnough ? " au-reqs-ok" : ""}`}><Icon name="check" size={16} />{t({ en: "At least 8 characters", ja: "8文字以上", zh: "至少 8 位" })}</div>
      <AuthErrorCard error={emailError || passwordError ? "" : error} />
      {session.emailTaken ? <p className="au-recovery-links">
        <a href={authRoutePath("login", next)}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</a>
        <a href={authRoutePath("forgot", next)}>{t({ en: "Reset password", ja: "パスワードを再設定", zh: "重置密码" })}</a>
      </p> : null}
      <div className="au-consent">
        <Checkbox checked={agreed} label={t({ en: "I agree to the Terms of Use and Privacy Policy", ja: "利用規約とプライバシーポリシーに同意します", zh: "同意使用条款和隐私政策" })} onChange={setAgreed} />
        <span>{t({ en: "I agree to the {terms} and {privacy}", ja: "{terms}と{privacy}に同意します", zh: "同意{terms}和{privacy}" }).split(/(\{terms\}|\{privacy\})/u).map((part, index) => part === "{terms}"
          ? <a className="au-terms-link" href="/terms" key={index} rel="noopener noreferrer" target="_blank">{t({ en: "Terms of Use", ja: "利用規約", zh: "使用条款" })}</a>
          : part === "{privacy}" ? <a className="au-terms-link" href="/privacy" key={index} rel="noopener noreferrer" target="_blank">{t({ en: "Privacy Policy", ja: "プライバシーポリシー", zh: "隐私政策" })}</a>
            : part)}</span>
      </div>
      <AuthPrimaryButton className="au-btn-primary" disabled={!agreed} label={label} submitting={session.submitting} />
      <p className="au-switch au-foot">
        {t({ en: "Already have an account? ", ja: "すでにお持ちの方は ", zh: "已有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("login", next)}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</a>
      </p>
    </form>
  );
}
