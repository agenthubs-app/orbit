"use client";

/** b1 #3 注册态；条款在新标签打开、没勾同意时提交给出原因，注册后尝试自动登录。 */
import { useEffect, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthErrorCard, AuthGoogleButton, AuthPasswordField, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { AUTH_ERROR_COPY, AUTH_PASSWORD_MIN_LENGTH, authRoutePath, authTitleId } from "./auth-model";
import { Checkbox, Icon } from "../ui";
import { useAccountAuth } from "./use-account-auth";

export function AuthRegister({ defaultNext, oauthProviders }: { defaultNext: string; oauthProviders: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("signup"), defaultNext });
  const [agreed, setAgreed] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const { error, localError, localField, label, onSubmit } = useAuthSubmit(session, "register", undefined, () => {
    setConsentMissing(!agreed);
    return agreed;
  });
  const emailError = session.emailTaken ? error : localField === "email" ? localError : "";
  const passwordError = localField === "password" ? localError : "";
  const next = session.query.next;
  // 水合前不可提交：否则浏览器会用原生方式提交，把密码带进地址栏（与登录屏同一处理）。
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const longEnough = session.password.length >= AUTH_PASSWORD_MIN_LENGTH;

  return (
    <form className="au-view" method="post" noValidate onSubmit={onSubmit}>
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("register")}>{t({ en: "Create account", ja: "アカウントを作成", zh: "创建账号" })}</h2>
        <p className="au-sub">{t({ en: "It takes about a minute. You can add your cards right after.", ja: "1分で完了します。名刺の取り込みはこのあとすぐ。", zh: "约 1 分钟完成，之后马上就能导入名片。" })}</p>
      </div>
      {oauthProviders.includes("google") ? <AuthGoogleButton aria-label={t({ en: "Sign up with Google", ja: "Google で登録", zh: "使用 Google 注册" })} label={t({ en: "Sign up with Google", ja: "Google で登録", zh: "使用 Google 注册" })} onClick={session.onGoogleSignIn} /> : null}
      {oauthProviders.includes("google") ? <span className="au-divider">{t({ en: "Or use your email", ja: "またはメールアドレスで", zh: "或使用邮箱" })}</span> : null}
      <fieldset className="au-fields" disabled={!ready}>
        <AuthEmailField error={emailError} session={session} />
        <AuthPasswordField autoComplete="new-password" error={passwordError} placeholder="" session={session} />
      </fieldset>
      <div className={`au-reqs${longEnough ? " au-reqs-ok" : ""}`}><Icon name="check" size={16} />{t({ en: "At least 8 characters", ja: "8文字以上", zh: "至少 8 位" })}</div>
      <AuthErrorCard error={emailError || passwordError ? "" : error} />
      {session.emailTaken ? <p className="au-recovery-links">
        <a href={authRoutePath("login", next)}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</a>
        <a href={authRoutePath("forgot", next)}>{t({ en: "Reset password", ja: "パスワードを再設定", zh: "重置密码" })}</a>
      </p> : null}
      {/* label：点文字等于点勾选框；里面的链接照常打开（链接是交互内容，不会触发勾选）。 */}
      <label className="au-consent">
        <Checkbox checked={agreed} label={t({ en: "I agree to the Terms of Use and Privacy Policy", ja: "利用規約とプライバシーポリシーに同意します", zh: "同意使用条款和隐私政策" })} onChange={(value) => { setAgreed(value); if (value) setConsentMissing(false); }} />
        <span>{t({ en: "I agree to the {terms} and {privacy}", ja: "{terms}と{privacy}に同意します", zh: "同意{terms}和{privacy}" }).split(/(\{terms\}|\{privacy\})/u).map((part, index) => part === "{terms}"
          ? <a className="au-terms-link" href="/terms" key={index} rel="noopener noreferrer" target="_blank">{t({ en: "Terms of Use", ja: "利用規約", zh: "使用条款" })}</a>
          : part === "{privacy}" ? <a className="au-terms-link" href="/privacy" key={index} rel="noopener noreferrer" target="_blank">{t({ en: "Privacy Policy", ja: "プライバシーポリシー", zh: "隐私政策" })}</a>
            : part)}</span>
      </label>
      {consentMissing ? <p className="au-field-error" role="alert">{t(AUTH_ERROR_COPY.consentRequired)}</p> : null}
      <AuthPrimaryButton className="au-btn-primary" disabled={!ready} label={label} submitting={session.submitting} />
      <p className="au-switch au-foot">
        {t({ en: "Already have an account? ", ja: "すでにお持ちの方は ", zh: "已有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("login", next)}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</a>
      </p>
    </form>
  );
}
