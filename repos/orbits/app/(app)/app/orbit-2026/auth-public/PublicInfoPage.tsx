"use client";

import { useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { supportEmail } from "../../../../../shared/config/support";
import { publicCopy, publicFaqSearchKeywords } from "../copy/public";
import { pickCopy } from "../copy/types";
import { Icon, Orbit2026Scope } from "../ui";
import { filterPublicFaq } from "./public-faq-search";
import s from "./PublicInfoPage.module.css";

export type PublicInfoKind = "help" | "terms" | "privacy";

const faqKeys = [
  { id: "send", question: "sendQuestion", answer: "sendAnswer" },
  { id: "gmail", question: "gmailQuestion", answer: "gmailAnswer" },
  { id: "card", question: "cardQuestion", answer: "cardAnswer" },
] as const;

/**
 * The help center's search, FAQ and contact. The public /help page stacks them in one column; 設定 › ヘルプ
 * (b7 #57) lays them out in its grid — search across, よくある質問 7 and お問い合わせ 5 — inside the shell.
 */
export function HelpCenterBody({ language, contactEmail = supportEmail, layout = "public" }: {
  language: OrbitLanguage;
  contactEmail?: string | null;
  layout?: "public" | "settings";
}) {
  const [query, setQuery] = useState("");
  const t = (key: keyof typeof publicCopy) => pickCopy(publicCopy[key], language);
  const faq = filterPublicFaq(faqKeys.map(({ id, question, answer }) => ({
    id,
    question: t(question),
    answer: t(answer),
    searchKeywords: Object.values(publicFaqSearchKeywords[id]),
  })), query);
  const content = <>
    <label className={s.search}>
      <Icon name="search" size={16} />
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
    </label>
    {faq.length ? <section className={s.faqCard} aria-label={t("faqTitle")}>
      <h2>{t("faqTitle")}</h2>
      {faq.map((item) => <details key={item.id} className={s.faqItem}>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>)}
    </section> : <section className={s.faqCard} aria-live="polite">
      <strong>{query.trim() ? `「${query.trim()}」` : ""}{t("noResults")}</strong>
      <p>{t("tryAnother")}</p>
    </section>}
    <section className={s.contactCard}>
      <h2>{t("contactTitle")}</h2>
      {contactEmail ? <a href={`mailto:${contactEmail}`}>{t("contactEmail")}</a> : <p>{t("contactUnavailable")}</p>}
    </section>
  </>;
  return layout === "settings" ? <div className={s.settingsGrid}>{content}</div> : content;
}

export function PublicInfoPage({ kind, language, signedIn, contactEmail = supportEmail }: {
  kind: PublicInfoKind;
  language: OrbitLanguage;
  signedIn: boolean;
  contactEmail?: string | null;
}) {
  const t = (key: keyof typeof publicCopy) => pickCopy(publicCopy[key], language);
  const help = kind === "help";
  const title = t(kind === "help" ? "helpTitle" : kind === "terms" ? "termsTitle" : "privacyTitle");

  return <Orbit2026Scope language={language} className={s.page}>
    <header className={s.header}>
      <a className={s.brand} href="/" aria-label="Orbit"><span className={s.logo}>O</span><strong>Orbit</strong></a>
      <nav className={s.nav} aria-label={t("publicPage")}>
        <a href="/help" aria-current={help ? "page" : undefined}>{t("helpNav")}</a>
        <a href="/terms" aria-current={kind === "terms" ? "page" : undefined}>{t("termsNav")}</a>
        <a href="/privacy" aria-current={kind === "privacy" ? "page" : undefined}>{t("privacyNav")}</a>
      </nav>
      <a className={s.accountAction} href={signedIn ? "/app/settings" : "/app/account/login"}>{t(signedIn ? "settings" : "login")}</a>
    </header>
    <main className={s.body}>
      <div className={s.eyebrow}>{t("publicPage")}</div>
      <h1>{title}</h1>
      {help ? <>
        <p className={s.intro}>{t("helpIntro")}</p>
        <HelpCenterBody language={language} contactEmail={contactEmail} />
      </> : <section className={s.legalCard}>
        <span className={s.badge}>{t("legalPlaceholder")}</span>
        <p>{t("legalBody")}</p>
      </section>}
      <div className={s.actions}>
        <a className={`${s.action} ${s.primary}`} href="/">{t("home")}</a>
        {!help ? <a className={s.action} href="/help">{t("seeHelp")}</a> : null}
      </div>
    </main>
  </Orbit2026Scope>;
}
