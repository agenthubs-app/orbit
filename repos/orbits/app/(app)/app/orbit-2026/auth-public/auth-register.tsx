"use client";

/**
 * 注册屏（Orbit_0918）：设计 docs/designs/Orbit_0918/Orbit 首页.dc.html 371–392 行逐元素。
 * 真实行为来自 `useAccountAuth`（mode="signup" + defaultNext；注册 → /api/auth/register → 自动登录 → continuation，
 * 失败回退 `/app/account/login?…&created=1&email=` 全在 hook）。409 → 设计 527「该邮箱已注册，请直接登录。」。
 * 条款行（389）：在新标签打开公开法务页，保留当前注册表单输入。
 * 设计外（记偏差）：眼睛钮、Google 钮。「直接登录」= 真实路由导航（带 ?next=）。
 */
import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthErrorCard, AuthGoogleButton, AuthPasswordField, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { useAccountAuth } from "./use-account-auth";

export function AuthRegister({ defaultNext, oauthProviders }: { defaultNext: string; oauthProviders: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("signup"), defaultNext });
  const { error, label, onSubmit } = useAuthSubmit(session, "register");
  const next = session.query.next;

  return (
    <form className="au-view" noValidate onSubmit={onSubmit}>
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("register")}>{t({ en: "Create account", ja: "アカウントを作成", zh: "创建账号" })}</h2>
        <p className="au-sub">{t({ en: "It takes about a minute.", ja: "1分で完了します。", zh: "约 1 分钟完成。" })}</p>
      </div>
      {oauthProviders.includes("google") ? <AuthGoogleButton aria-label={t({ en: "Sign up with Google", ja: "Google で登録", zh: "使用 Google 注册" })} onClick={session.onGoogleSignIn} /> : null}
      {oauthProviders.includes("google") ? <span className="au-divider">{t({ en: "Or use your email", ja: "またはメールアドレスで", zh: "或使用邮箱" })}</span> : null}
      <div className="au-fields">
        <AuthEmailField session={session} />
        <AuthPasswordField autoComplete="new-password" placeholder={t({ en: "At least 8 characters", ja: "8文字以上", zh: "至少 8 位" })} session={session} />
      </div>
      <AuthErrorCard error={error} />
      <AuthPrimaryButton className="au-btn-primary" label={label} submitting={session.submitting} />
      <p className="au-terms">
        <a className="au-terms-link" href="/terms" rel="noopener noreferrer" target="_blank">{t({ en: "Terms of Use", ja: "利用規約", zh: "使用条款" })}</a>
        {" · "}
        <a className="au-terms-link" href="/privacy" rel="noopener noreferrer" target="_blank">{t({ en: "Privacy Policy", ja: "プライバシーポリシー", zh: "隐私政策" })}</a>
      </p>
      <p className="au-switch">
        {t({ en: "Already have an account? ", ja: "アカウントをお持ちですか？ ", zh: "已有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("login", next)}>{t({ en: "Sign in", ja: "ログイン", zh: "直接登录" })}</a>
      </p>
    </form>
  );
}
