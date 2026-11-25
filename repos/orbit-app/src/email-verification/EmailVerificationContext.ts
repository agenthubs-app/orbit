import { createContext, useContext } from "react";

import type { EmailSendState } from "../api/email-verification";

/** What the reminder and the account row draw. No provider (tests, showcase) or not known: null, nothing is drawn. */
export interface EmailVerificationView {
  email: string;
  verified: boolean;
  /** A verification mail has gone out to this account before: 「再送する」 instead of 「確認メールを送る」. */
  mailed: boolean;
  send: EmailSendState;
  /** Not on sign-in pages, the admin console and the reception device. */
  noticeVisible: boolean;
  requestMail: () => void;
}

export const EmailVerificationContext = createContext<EmailVerificationView | null>(null);
export const useEmailVerification = (): EmailVerificationView | null => useContext(EmailVerificationContext);
