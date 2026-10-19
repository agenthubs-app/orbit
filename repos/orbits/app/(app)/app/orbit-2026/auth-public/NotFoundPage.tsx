import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { publicCopy } from "../copy/public";
import { pickCopy } from "../copy/types";
import { Orbit2026Scope } from "../ui";
import p from "./PublicInfoPage.module.css";
import s from "./NotFoundPage.module.css";

export function NotFoundPage({ language, signedIn, insideApp }: {
  language: OrbitLanguage;
  signedIn: boolean;
  insideApp: boolean;
}) {
  const t = (key: keyof typeof publicCopy) => pickCopy(publicCopy[key], language);
  const shellVisible = signedIn && insideApp;
  const home = signedIn ? "/app/home" : "/";
  const description = t("notFoundBody");
  const breakPhrase = language === "ja" ? /URL\s\S/u.exec(description) : null;
  const mobileBreakAt = breakPhrase ? breakPhrase.index + breakPhrase[0].length : 0;
  return <Orbit2026Scope language={language} className={shellVisible ? s.inside : s.public}>
    {!shellVisible ? <header className={`${p.header} ${s.publicHeader}`}>
      <a className={p.brand} href="/" aria-label="Orbit"><span className={p.logo}>O</span><strong>Orbit</strong></a>
      <nav className={p.nav} aria-label={t("publicPage")}>
        <a href="/help">{t("helpNav")}</a>
        <a href="/terms">{t("termsNav")}</a>
        <a href="/privacy">{t("privacyNav")}</a>
      </nav>
      <a className={p.accountAction} href={signedIn ? "/app/settings" : "/app/account/login"}>{t(signedIn ? "settings" : "login")}</a>
    </header> : null}
    <main className={s.content}>
      <div className={s.icon} aria-hidden="true">🧭</div>
      <h1>{t("notFoundTitle")}</h1>
      <p className={s.description}>{mobileBreakAt > 0 ? <>{description.slice(0, mobileBreakAt)}<br className={s.mobileBreak} />{description.slice(mobileBreakAt)}</> : description}</p>
      <div className={s.actions}>
        <a className={`${s.action} ${s.primary}`} href={home}>{t("backHome")}</a>
        <a className={s.action} href="/help">{t("seeHelp")}</a>
      </div>
    </main>
  </Orbit2026Scope>;
}
