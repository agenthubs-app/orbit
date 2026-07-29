"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon, Logo } from "../orbit-reference-primitives";

export function OrbitRealAdminLogin() {
  const { t, language } = useOrbitLanguage();
  const dest = "/app/admin";
  const signInHref = `/app/account/login?next=${encodeURIComponent(dest)}`;

  return (
    <main className="orbit-admin-access-page" data-orbit-real-page>
      <section aria-hidden="true" className="orbit-admin-access-art">
        <div className="orbit-admin-access-art-inner">
          <Logo color="var(--on-dark)" size={28} textColor="var(--on-dark)" />
          <div>
            <h1 className="h-display orbit-admin-access-art-title">{t({ en: "Organizer admin", zh: "主办方后台" })}</h1>
            <p className="orbit-admin-access-art-copy">{t({ en: "Review actor-scoped event source records and the authenticated account profile. Registration, attendance, capacity, matching, and team data stay unavailable until dedicated providers are connected.", zh: "查看按账户隔离的活动来源记录和已登录账户资料。在接入专用数据服务前，不展示报名、签到、容量、匹配或团队数据。" })}</p>
          </div>
        </div>
      </section>
      <section className="orbit-admin-access-panel">
        <div className="orbit-admin-access-card card">
          <div className="orbit-admin-access-brand"><Logo size={26} /><div className="orbit-admin-access-brand-sub"><Icon name="lock" size={14} />ADMIN SESSION</div></div>
          <div className="eyebrow orbit-admin-access-eyebrow">ORGANIZER ADMIN / SECURE SIGN IN</div>
          <h1 className="h-display orbit-admin-access-title">{t({ en: "Sign in to admin", zh: "登录后台" })}</h1>
          <p className="orbit-admin-access-copy">{t({ en: "Continue through the secure account sign-in flow. Admin access is granted only after the authenticated session is verified.", zh: "请通过安全账号登录流程继续。只有在验证登录会话后，才能进入后台。" })}</p>
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <a className="btn btn-primary btn-lg btn-block" href={signInHref}>{t({ en: "Continue to secure sign in", zh: "继续安全登录" })}<Icon color="var(--on-dark)" name="arrow" size={17} /></a>
          </div>
          <div className="orbit-admin-access-chips"><span className="badge badge-soon">Admin</span><span className="chip orbit-lang-inline">{language === "zh" ? "ZH" : "EN"}</span></div>
        </div>
      </section>
    </main>
  );
}
