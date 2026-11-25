"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { sendVerificationMail, useEmailVerification } from "../../email-verification-state";
import { emailVerificationCopy as copy } from "../copy/email-verification";
import { pickCopy } from "../copy/types";
import { Chip } from "../ui";
import { sendResultText } from "./EmailVerificationNotice";
import s from "./EmailVerification.module.css";

/** V7: the line under ログイン情報 on 設定 › アカウント. */
export function EmailVerificationRow() {
  const { language } = useOrbitLanguage();
  const state = useEmailVerification();
  if (!state) return null;
  const result = state.verified ? null : sendResultText(state.send, state.email, language);
  return <div className={s.row} data-email-verification-row="">
    <div className={s.rowText}><b>{pickCopy(copy.rowTitle, language)}</b>{result ? <span role="status">{result}</span> : null}</div>
    <Chip label={pickCopy(state.verified ? copy.verified : copy.unverified, language)} tone={state.verified ? "teal" : "apricot"} />
    {state.verified || state.send.kind === "sent" ? null : <button type="button" className={`btn ${s.rowButton}`} disabled={state.send.kind === "sending"} onClick={() => void sendVerificationMail(language)}>{pickCopy(state.mailed ? copy.resend : copy.first, language)}</button>}
  </div>;
}
