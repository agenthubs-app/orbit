"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { AccountLayout } from "../account/AccountLayout";
import { Button, Card, Chip, Icon, MacTile } from "../ui";
import { accountRightsApi, AccountRightsApiError } from "./api";
import { rightsCopy } from "./copy";
import { clearWebAccountRightsData, hasUnsyncedWebDrafts } from "./local-data";
import s from "./rights.module.css";

export function AccountDeletionPage() {
  const { language } = useOrbitLanguage();
  const t = useMemo(() => rightsCopy(language), [language]);
  const [step, setStep] = useState<"overview" | "verify">("overview");
  const [method, setMethod] = useState<"credentials" | "google" | null>(null);
  const [password, setPassword] = useState("");
  const [googleReceipt, setGoogleReceipt] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [unsynced, setUnsynced] = useState(false);
  useEffect(() => {
    setUnsynced(hasUnsyncedWebDrafts());
    void accountRightsApi.getDeletion().then(value => {
      if (value?.status === "pending" || value?.status === "purging") window.location.replace("/app/account/pending");
    }).catch(() => setProblem(t("generalError")));
  }, [t]);
  useEffect(() => {
    if (window.sessionStorage.getItem("orbit-deletion-google-return") !== "1") return;
    window.sessionStorage.removeItem("orbit-deletion-google-return");
    setStep("verify"); setMethod("google");
    void accountRightsApi.reauthGoogle().then(setGoogleReceipt).catch(() => setProblem(t("generalError")));
  }, [t]);
  const next = async () => {
    setBusy(true); setProblem("");
    try { setMethod(await accountRightsApi.method()); setStep("verify"); }
    catch { setProblem(t("unavailable")); }
    finally { setBusy(false); }
  };
  const request = async () => {
    if (!confirmed || busy || method === "credentials" && !password || method === "google" && !googleReceipt || !method) return;
    setBusy(true); setProblem("");
    try {
      const receipt = method === "google" ? googleReceipt! : await accountRightsApi.reauthPassword(password);
      await accountRightsApi.requestDeletion(receipt);
      setPassword("");
      await clearWebAccountRightsData();
      window.location.assign("/app/account/pending");
    } catch (error) {
      const api = error instanceof AccountRightsApiError ? error : null;
      setProblem(api?.reason === "invalid_credentials" ? t("wrongPassword") : api?.reason === "rate_limited" ? t("rateLimited") :
        api?.reason === "HOST_EVENT_HAS_REGISTRATIONS" ? t("hostBlocked") : t("generalError"));
      setBusy(false);
    }
  };
  const startGoogle = async () => {
    if (busy) return;
    setBusy(true); setProblem("");
    try {
      // 主会话代定 §R18c-3. Google documents auth_time as an explicit ID-token claim.
      await accountRightsApi.reauthGoogleStart();
      window.sessionStorage.setItem("orbit-deletion-google-return", "1");
      await signIn("google", { callbackUrl: "/app/settings/account" },
        { prompt: "login", max_age: "0", claims: JSON.stringify({ id_token: { auth_time: { essential: true } } }) });
    } catch { setProblem(t("generalError")); setBusy(false); }
  };
  // b7 #24 退会 1/2: what is deleted (no per-category counts: there is no count source), the export /
  // sign-in / 30-day cards, then やめる and 本人確認へ進む. The purge date is today + 30 days (request time).
  const purge = new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { month: "long", day: "numeric" }).format(new Date(Date.now() + 30 * 86_400_000));
  const rows = [["👥", "lav", "rowPeople", "rowPeopleSub"], ["📝", "apricot", "rowMemo", "rowMemoSub"], ["🧭", "pink", "rowPlan", "rowPlanSub"], ["🔗", "blue", "rowLinks", "rowLinksSub"], ["🎟️", "teal", "rowEvents", "rowEventsSub"]] as const;
  return <AccountLayout active="account" title={step === "overview" ? t("leaveTitle") : t("account")} subtitle={step === "overview" ? t("leaveIntro") : undefined} largeTitle={step !== "overview"}>
    <div className={s.stack}>
      {step === "overview" ? <>
        <div className={s.steps} aria-hidden><i className={s.stepDone} /><i /></div>
        <div className={s.leaveGrid}>
          <section className={s.leaveCard}><div className={s.leaveHead}><h2>{t("deletionList")}</h2><span>{t("purgeOn").replace("{date}", purge)}</span></div>
            {rows.map(([emoji, tone, title, sub]) => <div className={s.xrow} key={title}><MacTile emoji={emoji} tone={tone} size="sm" /><div><b>{t(title)}</b><span>{t(sub)}</span></div><Chip label={t("removeTag")} /></div>)}
          </section>
          <div className={s.leaveSide}>
            <div className={s.exportCard}><div className={s.exportHead}><span aria-hidden>📦</span><div><b>{t("exportCardTitle")}</b><span>{t("exportCardSub")}</span></div></div>
              <a className={`btn ${s.exportGo}`} href="/app/settings/exports"><Icon name="share" size={16} />{t("exportCardGo")}</a></div>
            <div className={s.flatCard}><b>{t("loginTitle")}</b><p>{t("loginBody")}</p></div>
            <div className={s.flatCard}><b>{t("undoTitle")}</b><span>{t("undoBody").replace("{date}", purge)}</span></div>
          </div>
        </div>
        {unsynced ? <p className={s.error}>{t("unsynced")}</p> : null}
        <div className={s.leaveActions}><a className={`btn ${s.stop}`} href="/app/settings">{t("stop")}</a><button type="button" className={`btn ${s.toVerify}`} disabled={busy} onClick={() => void next()}>{t("toVerify")}</button></div>
      </> : <Card title={t("verify")}>
        <p className={s.lead}>{t("deletionIntro")}</p>
        {method === "credentials" ? <label className={s.field}>{t("password")}
          <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
        </label> : <div className={s.actions}><Button label={t("verify")} loading={busy} onClick={() => void startGoogle()} />
          {googleReceipt ? <p className={s.note}>{t("confirmDeletion")}</p> : null}</div>}
        <label className={s.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("confirmDeletion")}</label>
        <div className={s.actions}><Button label={t("requestDeletion")} variant="danger" loading={busy}
          disabled={!confirmed || method === "credentials" && !password || method === "google" && !googleReceipt} onClick={() => void request()} /></div>
      </Card>}
      {problem ? <p role="alert" className={s.error}>{problem}</p> : null}
    </div>
  </AccountLayout>;
}
