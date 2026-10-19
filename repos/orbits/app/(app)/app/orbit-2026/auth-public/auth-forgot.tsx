"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthEmailField, AuthErrorCard, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { useAccountAuth } from "./use-account-auth";

export function AuthForgot({ defaultNext }: { defaultNext: string }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("forgot"), defaultNext });
  const { error, label, onSubmit } = useAuthSubmit(session, "forgot");
  const next = session.query.next;

  if (session.resetSent) return <div className="au-view">
    <div className="au-head">
      <h2 className="au-h2" id={authTitleId("forgot")}>{t({ en: "Request accepted", ja: "受け付けました", zh: "已受理" })}</h2>
      <p className="au-sub" role="status">{t({ en: "If the address is registered, an email will arrive.", ja: "登録済みのアドレスであればメールが届きます。", zh: "如果该地址已注册，你会收到邮件。" })}</p>
    </div>
    <a className="btn au-btn-primary au-btn-link" href={authRoutePath("login", next)}>{t({ en: "Back to sign in", ja: "ログインに戻る", zh: "返回登录" })}</a>
  </div>;

  return <div className="au-view">
    <div className="au-head">
      <h2 className="au-h2" id={authTitleId("forgot")}>{t({ en: "Reset password", ja: "パスワードの再設定", zh: "重置密码" })}</h2>
      <p className="au-sub">{t({ en: "Enter your email address.", ja: "メールアドレスを入力してください。", zh: "请输入邮箱地址。" })}</p>
    </div>
    <form className="au-view" noValidate onSubmit={onSubmit}>
      <AuthEmailField session={session} />
      <AuthErrorCard error={error} />
      <AuthPrimaryButton className="au-btn-primary" label={session.submitting ? label : t({ en: "Request a reset", ja: "再設定を申し込む", zh: "申请重置密码" })} submitting={session.submitting} />
    </form>
  </div>;
}
