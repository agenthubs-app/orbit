"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EmailVerificationConfirmResult } from "../../../../../shared/contract/email-verification";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { emailVerificationCopy as copy } from "../copy/email-verification";
import { pickCopy } from "../copy/types";
import { Bone, MacTile, Orbit2026Scope } from "../ui";
import s from "./EmailVerification.module.css";

type View = "checking" | "done" | "expired" | "failed";

/** V2 / V3: where the mailed link lands. Public, no links, never signs in or leads into the product. */
export function VerifyEmailPage({ language }: { language: OrbitLanguage }) {
  const [view, setView] = useState<View>("checking");
  const token = useRef<string | null>(null);
  const started = useRef(false);
  const t = (key: keyof typeof copy) => pickCopy(copy[key], language);

  const confirm = useCallback(async () => {
    setView("checking");
    try {
      const response = await fetch("/api/auth/email-verification/confirm", { body: JSON.stringify({ token: token.current }), credentials: "omit", headers: { "content-type": "application/json" }, method: "POST" });
      const body = await response.json().catch(() => null) as { success?: boolean; data?: EmailVerificationConfirmResult } | null;
      if (!response.ok || !body?.success || !body.data) { setView("failed"); return; }
      setView(body.data.outcome === "expired" ? "expired" : "done");
    } catch {
      setView("failed");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // The token stays out of the address bar and the history; a reload then shows the expired wording at worst.
    if (token.current) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (token.current) void confirm(); else setView("expired");
  }, [confirm]);

  return <Orbit2026Scope language={language} className={s.page}>
    <header className={s.head}><span className={s.logo} aria-hidden="true">O</span><strong>Orbit</strong></header>
    <main className={s.body}>
      <section className={s.card} aria-live="polite" data-verify-email={view}>
        {view === "checking" ? <div className={s.bones} role="progressbar" aria-busy="true" aria-label={t("checking")}><Bone width={64} height={64} /><Bone width={220} height={22} /><Bone width={180} height={13} /></div> : <>
          <span className={s.tile}><MacTile emoji={view === "done" ? "✅" : "⏳"} tone={view === "done" ? "teal" : "apricot"} /></span>
          <h1>{t(view === "done" ? "doneTitle" : view === "expired" ? "expiredTitle" : "failedTitle")}</h1>
          {view === "failed" ? <button type="button" className={`btn ${s.retry}`} onClick={() => void confirm()}>{t("retry")}</button> : <p>{t(view === "done" ? "doneBody" : "expiredBody")}</p>}
        </>}
      </section>
    </main>
  </Orbit2026Scope>;
}
