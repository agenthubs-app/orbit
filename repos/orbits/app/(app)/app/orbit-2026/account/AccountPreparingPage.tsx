"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { accountCopy } from "../copy/account";
import { pickCopy } from "../copy/types";
import type { AccountPreparingSection } from "./account-preparing-sections";
import { AccountLayout } from "./AccountLayout";
import s from "./AccountPreparingPage.module.css";

export { accountPreparingSection, type AccountPreparingSection } from "./account-preparing-sections";

export function AccountPreparingPage({ section }: { section: AccountPreparingSection }) {
  const { language } = useOrbitLanguage();
  const t = (key: keyof typeof accountCopy) => pickCopy(accountCopy[key], language);
  return <AccountLayout active={section} title={t(section)}>
    <section className={s.card}>
      <span className={s.badge}>{t("preparing")}</span>
      <p>{t("preparingBody")}</p>
      <a href="/app/settings">{t("backToSettings")}</a>
    </section>
  </AccountLayout>;
}
