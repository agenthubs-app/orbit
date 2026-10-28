"use client";

import Link from "next/link";
import { SessionContext } from "next-auth/react";
import { useContext, useEffect, useMemo, useState } from "react";

import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../account/AccountLayout";
import { useAccountIdentity } from "../account/AppearanceSettings";
import styles from "../account/SettingsSecondary.module.css";
import { Bone, Chip, Icon, MacTile, useStandardCopy } from "../ui";
import { accountRightsApi } from "./api";
import { rightsCopy } from "./copy";
import s from "./rights.module.css";

type Method = "credentials" | "google";
const METHOD_KEY = "settings:login-method";

// The sign-in method is a slow resource in the browser read cache; undefined while the first read is out,
// null when it could not be read (the chip is left out rather than guessed).
function useLoginMethod(): Method | null | undefined {
  const [method, setMethod] = useState<Method | null | undefined>(() => lastAnswer<Method>(METHOD_KEY));
  useEffect(() => {
    if (method && answerFresh(METHOD_KEY, FRESH.slow)) return;
    let alive = true;
    void accountRightsApi.method().then((value) => { rememberAnswer(METHOD_KEY, value); if (alive) setMethod(value); })
      .catch(() => { if (alive) setMethod((current) => current ?? null); });
    return () => { alive = false; };
  }, []); // once per visit
  return method;
}

/**
 * 設定 › アカウント (b12 W-R18c-S11, 2026-10-29): ログイン情報, データ, and at the bottom the アカウントの削除
 * card whose danger-ghost entry opens the deletion flow (/app/settings/account/delete, b7 #24–#27).
 */
export function AccountOverviewPage() {
  const { language } = useOrbitLanguage();
  const t = useMemo(() => rightsCopy(language), [language]);
  const copy = useStandardCopy();
  const identity = useAccountIdentity();
  const method = useLoginMethod();
  // The address this account signs in with when the profile has none of its own (outside a SessionProvider: none).
  const sessionEmail = useContext(SessionContext)?.data?.user?.email;
  const email = identity?.email || sessionEmail || "";
  // ログイン情報 appears with its chip, not before it: both reads are in, or the row stays bones.
  const ready = identity !== undefined && method !== undefined;
  return <AccountLayout active="account" title={t("account")} subtitle={t("overviewIntro")}>
    <div className={styles.appearance}>
      <section className={styles.setCard}>
        <div className={styles.setCardHead}><h2>{t("loginInfo")}</h2></div>
        {ready ? <div className={styles.accountRow}>
          <span className={styles.accountAvatar} aria-hidden>{identity?.name.slice(0, 1) ?? <Icon name="user" size={20} />}</span>
          <div className={styles.accountText}><b>{identity?.name ?? ""}</b>{email ? <span>{email}</span> : null}</div>
          {method ? <Chip label={t(method === "google" ? "loginGoogle" : "loginPassword")} /> : null}
        </div> : <div className={styles.accountRow} role="progressbar" aria-busy="true" aria-label={copy.loading.loading}>
          <Bone width={56} height={56} round /><div className={`${styles.accountText} ${styles.boneCard}`}><Bone width={120} height={16} /><Bone width={180} height={13} /></div>
        </div>}
      </section>
      <section className={styles.setCard}>
        <div className={styles.setCardHead}><h2>{t("dataTitle")}</h2></div>
        <div className={styles.accountRow}>
          <MacTile emoji="📦" tone="apricot" />
          <div className={styles.accountText}><b>{t("export")}</b><span>{t("exportCardSub")}</span></div>
          <Link className={`btn ${styles.accountButton}`} href="/app/settings/exports"><Icon name="share" size={16} />{t("exportGo")}</Link>
        </div>
      </section>
      <section className={styles.setCard} data-account-danger="">
        <div className={styles.setCardHead}><h2 className={s.dangerTitle}>{t("deleteTitle")}</h2></div>
        <div className={styles.accountRow}>
          <p className={`${styles.accountText} ${s.dangerBody}`}>{t("deleteBody")}</p>
          <Link className={`btn ${styles.accountButton} ${styles.accountDanger}`} href="/app/settings/account/delete">{t("deleteGo")}</Link>
        </div>
      </section>
    </div>
  </AccountLayout>;
}
