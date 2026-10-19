"use client";

/**
 * 登录屏（Orbit_0918）：设计 docs/designs/Orbit_0918/Orbit 首页.dc.html 348–369 行逐元素。
 * 真实行为来自 `useAccountAuth`（本屏自己调用一次，viewModel 只取 mode="login" + defaultNext；
 * 标题 / 描述 / 按钮文案改由 auth-model + t() 给出设计文案，view model 的 copy 字段不再渲染）。
 * 设计外（记偏差）：`?created=1` 蓝色 notice、眼睛钮、Google 钮；「忘记密码？」/「创建账号」= 真实路由导航（带 ?next=）。
 */
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthErrorCard, AuthGoogleButton, AuthNoticeCard, AuthPasswordField, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { useAccountAuth } from "./use-account-auth";

export function AuthLogin({ defaultNext, oauthProviders }: { defaultNext: string; oauthProviders: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("login"), defaultNext });
  const { error, label, onSubmit } = useAuthSubmit(session, "login");
  const next = session.query.next;

  return (
    <form className="au-view" noValidate onSubmit={onSubmit}>
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("login")}>{t({ en: "Sign in", ja: "ログイン", zh: "登录" })}</h2>
        <p className="au-sub">{t({ en: "Welcome back.", ja: "おかえりなさい。", zh: "欢迎回来。" })}</p>
      </div>
      <AuthNoticeCard notice={session.message} />
      {oauthProviders.includes("google") ? <AuthGoogleButton aria-label={t({ en: "Continue with Google", ja: "Google でログイン", zh: "使用 Google 登录" })} onClick={session.onGoogleSignIn} /> : null}
      {oauthProviders.includes("google") ? <span className="au-divider">{t({ en: "Or use your email", ja: "またはメールアドレスで", zh: "或使用邮箱" })}</span> : null}
      <div className="au-fields">
        <AuthEmailField session={session} />
        <AuthPasswordField
          autoComplete="current-password"
          labelExtra={<a className="au-forgot" href={authRoutePath("forgot", next)}>{t({ en: "Forgot password?", ja: "パスワードをお忘れですか？", zh: "忘记密码？" })}</a>}
          placeholder="••••••••"
          session={session}
        />
      </div>
      <AuthErrorCard error={error} />
      <AuthPrimaryButton className="au-btn-login" label={label} submitting={session.submitting} />
      <p className="au-switch">
        {t({ en: "No account yet? ", ja: "アカウントをお持ちでない方は ", zh: "还没有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("register", next)}>{t({ en: "Sign up", ja: "新規登録", zh: "创建账号" })}</a>
      </p>
    </form>
  );
}
