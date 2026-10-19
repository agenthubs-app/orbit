"use client";

/**
 * 找回（重置密码申请）屏（Orbit_0918）：设计 docs/designs/Orbit_0918/Orbit 首页.dc.html 394–420 行逐元素。
 * 真实行为来自 `useAccountAuth`（mode="forgot" + defaultNext；`POST /api/auth/password-reset/request` 在 hook）。
 * 成功态（设计 400–405）隐藏表单：✦ 重置链接已发送 / 请查看 {email} 的收件箱。链接 30 分钟内有效。
 * 受理 ≠ 送达（旧 notice 语义）→ 卡内第三行补 t()「如果该邮箱支持密码恢复，链接会很快送达。」（记偏差）；
 * 审阅修订 10：成功卡下加一行「未收到？可在一分钟后 重新申请」（点击回到表单态、清成功卡：hook 的 `resetSent`
 * 只在下次提交时复位，故用本地 `dismissed`；链接 href = 本路由（无 JS 时刷新即回表单态），有 JS 时 preventDefault）；
 * 终审修正：`dismissed` 只在校验通过、hook 真正被调用时清（`useAuthSubmit` 的 `onDelegate`）——校验失败的提交
 * 不能把上一次的成功卡重新亮出来。
 * 「← 返回登录」带 `?next=`。设计 `emailShown` 的「你的邮箱」空值回退不可达（邮箱必填 + 本地校验）。
 */
import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { AuthBackToLogin, AuthEmailField, AuthErrorCard, AuthPrimaryButton, useAuthSubmit } from "./auth-form";
import { authRoutePath, authTitleId } from "./auth-model";
import { useAccountAuth } from "./use-account-auth";

export function AuthForgot({ defaultNext }: { defaultNext: string }) {
  const { t } = useOrbitLanguage();
  const session = useAccountAuth({ ...getOrbitAccountAuthViewModel("forgot"), defaultNext });
  const [dismissed, setDismissed] = useState(false);
  const { error, label, onSubmit } = useAuthSubmit(session, "forgot", () => setDismissed(false));
  const next = session.query.next;
  const sent = session.resetSent && !dismissed;

  return (
    <div className="au-view">
      <div className="au-head">
        <h2 className="au-h2" id={authTitleId("forgot")}>{t({ en: "Reset password", ja: "パスワードを再設定", zh: "重置密码" })}</h2>
        <p className="au-sub">{t({ en: "Enter your email to request a reset link.", ja: "メールアドレスを入力して、再設定リンクを申請してください。", zh: "输入邮箱以申请重置链接。" })}</p>
      </div>
      {sent ? (
        <>
          <div className="au-success" role="status">
            <strong className="au-success-title">{t({ en: "✦ Request accepted", ja: "✦ 申請を受け付けました", zh: "✦ 申请已受理" })}</strong>
            <span>{t({ en: `If ${session.email} has an account, check its inbox. A link is valid for 30 minutes after delivery.`, ja: `${session.email} にアカウントがある場合は、受信箱をご確認ください。リンクの有効期限は30分です。`, zh: `如果 ${session.email} 对应账号，请查看收件箱。链接有效期为 30 分钟。` })}</span>
          </div>
          <p className="au-back">
            {t({ en: "Need another link? ", ja: "リンクが必要ですか？ ", zh: "需要新链接？" })}
            <a
              className="au-back-link"
              href={authRoutePath("forgot", next)}
              onClick={(event) => {
                event.preventDefault();
                setDismissed(true);
              }}
            >
              {t({ en: "Request again", ja: "再申請", zh: "重新申请" })}
            </a>
          </p>
        </>
      ) : (
        <form className="au-view" noValidate onSubmit={onSubmit}>
          <AuthEmailField session={session} />
          <AuthErrorCard error={error} />
          <AuthPrimaryButton className="au-btn-primary" label={label} submitting={session.submitting} />
          <span className="au-hint">{t({ en: "Reset links are valid for 30 minutes.", ja: "再設定リンクの有効期限は30分です。", zh: "重置链接有效期为 30 分钟。" })}</span>
        </form>
      )}
      <AuthBackToLogin next={next} />
    </div>
  );
}
