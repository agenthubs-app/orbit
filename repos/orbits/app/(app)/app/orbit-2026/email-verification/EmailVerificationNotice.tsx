"use client";

import { usePathname } from "next/navigation";

import { useOrbitLanguage } from "../../orbit-language-context";
import { sendVerificationMail, useEmailVerification, useEmailVerificationWatch, type EmailSendState } from "../../email-verification-state";
import { emailVerificationCopy as copy } from "../copy/email-verification";
import { pickCopy, type OrbitCopyEntry } from "../copy/types";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Icon, Orbit2026Scope } from "../ui";
import s from "./EmailVerification.module.css";

// 受付端末（来场者在摸）、登录框、管理台不显示；其余登录后的页面都有。
const HIDDEN_PREFIXES = ["/app/account", "/app/admin", "/app/login-admin"];
const KIOSK = /^\/app\/events\/[^/]+\/operations\/check-in(?:\/|$)/u;

export function showsEmailNotice(pathname: string): boolean {
  return !KIOSK.test(pathname) && !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** 发送结果的一行字；没点过时返回 null。 */
export function sendResultText(send: EmailSendState, email: string, language: OrbitLanguage): string | null {
  const t = (entry: OrbitCopyEntry) => pickCopy(entry, language);
  if (send.kind === "sent") return t(copy.sent).replace("{email}", email);
  if (send.kind === "wait") return t(copy.wait).replace("{n}", String(send.seconds));
  return send.kind === "limit" ? t(copy.limit) : send.kind === "fail" ? t(copy.fail) : null;
}

/** V4–V6: one line at the very top of every signed-in page while the address is unverified. Cannot be closed, scrolls with the page. */
export function EmailVerificationNotice() {
  const { language } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const state = useEmailVerification();
  const open = Boolean(state && !state.verified);
  useEmailVerificationWatch(open && state ? state.userId : null);
  if (!state || state.verified || !showsEmailNotice(pathname)) return null;
  const sent = state.send.kind === "sent";
  return <Orbit2026Scope language={language}><div className={s.bar} data-email-notice="">
    <span className={s.text} role="status"><Icon name={sent ? "check" : "mail"} size={16} />{sendResultText(state.send, state.email, language) ?? pickCopy(copy.notice, language)}</span>
    {sent ? null : <button type="button" className={`btn ${s.button}`} disabled={state.send.kind === "sending"} onClick={() => void sendVerificationMail(language)}>{pickCopy(state.mailed ? copy.resend : copy.first, language)}</button>}
  </div></Orbit2026Scope>;
}
