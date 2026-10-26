"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthErrorCard, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { Icon } from "../ui";
import { useAccountAuth } from "./use-account-auth";

export function AuthForgot({ defaultNext, oauthProviders = [] }: { defaultNext: string; oauthProviders?: readonly string[] }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("forgot"), defaultNext });
  const { error, localError, label, onSubmit } = useAuthSubmit(session, "forgot");
  const next = session.query.next;

  if (session.resetSent) return <div className="au-view">
    <div className="au-head">
      <h2 className="au-h2" id={authTitleId("forgot")}>{t({ en: "Request accepted", ja: "受け付けました", zh: "已受理" })}</h2>
      <p className="au-sub" role="status">{t({ en: "If the address is registered, an email will arrive.", ja: "登録済みのアドレスであればメールが届きます。", zh: "如果该地址已注册，你会收到邮件。" })}</p>
    </div>
    <a className="btn au-btn-primary au-btn-link" href={authRoutePath("login", next)}>{t({ en: "Back to sign in", ja: "ログインに戻る", zh: "返回登录" })}</a>
  </div>;

  // b1 #4: a back button (to sign-in) on the close button's row, the title under it.
  return <div className="au-view">
    <a aria-label={t({ en: "Back to sign in", ja: "ログインに戻る", zh: "返回登录" })} className="btn au-lbtn au-back-btn" href={authRoutePath("login", next)}><Icon name="left" size={16} /></a>
    <div className="au-head au-head-below">
      <h2 className="au-h2" id={authTitleId("forgot")}>{t({ en: "Reset password", ja: "パスワードの再設定", zh: "重置密码" })}</h2>
      <p className="au-sub">{t({ en: "Enter your email address. If it is registered, a reset link will arrive.", ja: "メールアドレスを入力してください。登録済みのアドレスであれば、再設定リンクが届きます。", zh: "请输入邮箱地址。如果该地址已注册，你会收到重置链接。" })}</p>
    </div>
    <form className="au-view" noValidate onSubmit={onSubmit}>
      <AuthEmailField error={localError} session={session} />
      <AuthErrorCard error={localError ? "" : error} />
      <AuthPrimaryButton className="au-btn-primary" label={session.submitting ? label : t({ en: "Send reset link", ja: "再設定リンクを送る", zh: "发送重置链接" })} submitting={session.submitting} />
    </form>
    {oauthProviders.includes("google") ? <p className="au-switch au-foot">
      {t({ en: "Signed up with Google? ", ja: "Google で登録した方は ", zh: "使用 Google 注册的用户可 " })}
      <button className="btn au-switch-link au-inline" onClick={session.onGoogleSignIn} type="button">{t({ en: "Sign in with Google", ja: "Google でログイン", zh: "使用 Google 登录" })}</button>
    </p> : null}
  </div>;
}
