"use client";

/**
 * 注册屏（Orbit_0918）：设计 docs/designs/Orbit_0918/Orbit 首页.dc.html 371–392 行逐元素。
 * 真实行为来自 `useAccountAuth`（mode="signup" + defaultNext；注册 → /api/auth/register → 自动登录 → continuation，
 * 失败回退 `/app/account/login?…&created=1&email=` 全在 hook）。409 → 设计 527「该邮箱已注册，请直接登录。」。
 * 条款行（389）：仓库无 legal 路由 → 「服务条款」「隐私政策」渲染为无 href 的同样式 `<span>`（记偏差）。
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
        <h2 className="au-h2" id={authTitleId("register")}>{t({ en: "Create account", zh: "创建账号" })}</h2>
        <p className="au-sub">{t({ en: "From scattered contacts to the right relationships.", zh: "从零散的联系人，到对的关系。" })}</p>
      </div>
      <div className="au-fields">
        <AuthEmailField session={session} />
        <AuthPasswordField autoComplete="new-password" placeholder={t({ en: "At least 8 characters", zh: "至少 8 位" })} session={session} />
      </div>
      <AuthErrorCard error={error} />
      <AuthPrimaryButton className="au-btn-primary" label={label} submitting={session.submitting} />
      {oauthProviders.includes("google") ? <AuthGoogleButton onClick={session.onGoogleSignIn} /> : null}
      <p className="au-terms">
        {t({ en: "By signing up you agree to the ", zh: "注册即表示同意 " })}
        <span className="au-terms-link">{t({ en: "Terms of Service", zh: "服务条款" })}</span>
        {t({ en: " and ", zh: " 与 " })}
        <span className="au-terms-link">{t({ en: "Privacy Policy", zh: "隐私政策" })}</span>
        {t({ en: ".", zh: "。" })}
      </p>
      <p className="au-switch">
        {t({ en: "Already have an account? ", zh: "已有账号？ " })}
        <a className="au-switch-link" href={authRoutePath("login", next)}>{t({ en: "Sign in", zh: "直接登录" })}</a>
      </p>
    </form>
  );
}
