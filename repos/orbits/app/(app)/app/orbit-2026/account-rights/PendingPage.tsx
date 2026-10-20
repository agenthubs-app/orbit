"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import type { AccountDeletionRequestContract } from "../../../../../shared/contract/account";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Button, Card, Orbit2026Scope } from "../ui";
import { accountRightsApi, AccountRightsApiError } from "./api";
import { rightsCopy } from "./copy";
import { clearWebAccountRightsData } from "./local-data";
import s from "./rights.module.css";

export function PendingPage() {
  const { language } = useOrbitLanguage();
  const t = useMemo(() => rightsCopy(language), [language]);
  const [request, setRequest] = useState<AccountDeletionRequestContract | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    void clearWebAccountRightsData().then(ok => { if (!ok) setProblem(t("generalError")); });
    void accountRightsApi.getDeletion().then(value => { setRequest(value); if (!value || value.status === "cancelled") window.location.replace("/app/settings/account"); })
      .catch(error => {
        if (error instanceof AccountRightsApiError && error.status === 401) window.location.replace("/app/account/login?next=/app/account/pending");
        else setProblem(t("generalError"));
      });
  }, [t]);
  const cancel = async () => {
    if (busy) return;
    setBusy(true); setProblem("");
    try { await accountRightsApi.cancelDeletion(); window.location.assign("/app/settings/account"); }
    catch (error) { setProblem(error instanceof AccountRightsApiError && error.reason === "DELETION_TOO_LATE" ? t("cancelTooLate") : t("generalError")); setBusy(false); }
  };
  const purgeDate = request?.purgeAfter ? new Intl.DateTimeFormat(language, { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(request.purgeAfter)) : "";
  return <Orbit2026Scope language={language} className={s.standalone}><main className={s.standaloneInner}>
    <h1>{t("pendingTitle")}</h1>
    <Card><p>{t("pendingBody")}</p>{purgeDate ? <p className={s.note}>{purgeDate}</p> : null}</Card>
    {problem ? <p role="alert" className={s.error}>{problem}</p> : null}
    <div className={s.actions}>
      {request?.status === "pending" ? <Button label={t("cancelDeletion")} variant="primary" loading={busy} onClick={() => void cancel()} /> : null}
      <Button label={t("signOut")} variant="secondary" onClick={() => void signOut({ callbackUrl: "/app/account/login?next=/app/account/pending" })} />
    </div>
  </main></Orbit2026Scope>;
}

export function DeletedPage() {
  const { language } = useOrbitLanguage();
  const t = rightsCopy(language);
  return <Orbit2026Scope language={language} className={s.deleted}>
    <header className={s.deletedHeader}><strong>{t("deletedNavBack")}</strong><span>{t("account")}</span></header>
    <main className={s.deletedMain}>
      <h1>{t("deletedTitle")}</h1>
      <p>{t("deletedDetail")}</p>
      <div className={s.deletedCard}>{t("deletedBody")}</div>
      <div className={s.deletedActions}><Button label={t("home")} variant="primary" onClick={() => window.location.assign("/")} /></div>
    </main>
  </Orbit2026Scope>;
}
