"use client";

/** b1 / b12 登录态；认证请求和安全 next 由 useAccountAuth 处理。 */
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthGoogleButton, AuthNoticeCard, AuthPasswordField, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { useAccountAuth } from "./use-account-auth";

export function AuthLogin({ defaultNext, oauthProviders }: { defaultNext: string; oauthProviders: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("login"), defaultNext });
  const { error, localField, label, onSubmit } = useAuthSubmit(session, "login");
  // b1 #2: the failure message sits under the field it belongs to (wrong pair → under パスワード).
  const emailError = localField === "email" ? error : "";
  const passwordError = emailError ? "" : error;
  const next = session.query.next;

  return (
    <form className="au-view" noValidate onSubmit={onSubmit}>
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("login")}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</h2>
        <p className="au-sub">{t({ en: "Welcome back.", ja: "おかえりなさい。", zh: "欢迎回来。" })}</p>
      </div>
      <AuthNoticeCard notice={session.message} />
      {oauthProviders.includes("google") ? <AuthGoogleButton label={t({ en: "Sign in with Google", ja: "Google でログイン", zh: "使用 Google 登录" })} onClick={session.onGoogleSignIn} /> : null}
      {oauthProviders.includes("google") ? <span className="au-divider">{t({ en: "Or use your email", ja: "またはメールアドレスで", zh: "或使用邮箱" })}</span> : null}
      <div className="au-fields">
        <AuthEmailField error={emailError} session={session} />
        <AuthPasswordField
          autoComplete="current-password"
          error={passwordError}
          placeholder="••••••••"
          session={session}
        />
      </div>
      <a className="au-forgot" href={authRoutePath("forgot", next)}>{t({ en: "Forgot password?", ja: "パスワードをお忘れですか？", zh: "忘记密码？" })}</a>
      <AuthPrimaryButton className="au-btn-login" label={label} submitting={session.submitting} />
      <p className="au-switch au-foot">
        {t({ en: "No account yet? ", ja: "アカウントをお持ちでない方は ", zh: "还没有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("register", next)}>{t({ en: "Sign up", ja: "新規登録", zh: "创建账号" })}</a>
      </p>
    </form>
  );
}
