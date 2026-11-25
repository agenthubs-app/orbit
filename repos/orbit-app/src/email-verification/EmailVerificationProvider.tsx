import { usePathname } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { AppState } from "react-native";

import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { emailVerificationScope, emailVerificationSnapshot, patchEmailVerification, publishEmailVerification, sendVerificationMail, subscribeEmailVerification, type EmailSendState } from "../api/email-verification";
import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { EmailVerificationContext, type EmailVerificationView } from "./EmailVerificationContext";
import { showsEmailNotice } from "./email-notice-route";

const RESEND_MS = 60_000;
const IDLE: EmailSendState = { kind: "idle" };

export function EmailVerificationProvider({ children }: PropsWithChildren) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const { language } = useOrbitLocale();
  const pathname = usePathname();
  const scope = auth.ready && auth.signedIn && !auth.deletionPending && auth.actorId ? emailVerificationScope(server.baseUrl, auth.actorId) : null;
  const known = useSyncExternalStore(subscribeEmailVerification, emailVerificationSnapshot, emailVerificationSnapshot);
  const status = known && known.scope === scope ? known : null;
  const [sending, setSending] = useState<{ scope: string; send: EmailSendState }>({ scope: "", send: IDLE });
  const send = status && sending.scope === status.scope ? sending.send : IDLE;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef(scope);
  current.current = scope;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [scope]);

  // The link is opened in a browser: look once on each return to the App, only while there is something to wait for.
  const waiting = status !== null && !status.verified;
  useEffect(() => {
    if (!waiting) return;
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") return;
      void client.get<unknown>(ORBIT_API_ENDPOINTS.accountMe).then(result => {
        if (result.success && current.current === scope) publishEmailVerification(server.baseUrl, result.data);
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [client, scope, server.baseUrl, waiting]);

  const busy = send.kind === "sending";
  const requestMail = useCallback(() => {
    if (!scope || busy) return;
    const settle = (next: EmailSendState, ms = 0) => {
      if (current.current !== scope) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = ms ? setTimeout(() => setSending({ scope, send: IDLE }), ms) : null;
      setSending({ scope, send: next });
    };
    settle({ kind: "sending" });
    void sendVerificationMail(client, language).then(outcome => {
      if (outcome.kind === "verified") { patchEmailVerification(scope, { verified: true }); settle(IDLE); return; }
      if (outcome.kind === "sent") patchEmailVerification(scope, { sent: true });
      settle(outcome.kind === "wait" ? outcome : { kind: outcome.kind }, outcome.kind === "sent" ? RESEND_MS : outcome.kind === "wait" ? outcome.seconds * 1000 : 0);
    }, () => settle({ kind: "fail" }));
  }, [busy, client, language, scope]);

  const noticeVisible = showsEmailNotice(pathname);
  const value = useMemo<EmailVerificationView | null>(() => status
    ? { email: status.email, verified: status.verified, mailed: status.sent === true, send, noticeVisible, requestMail }
    : null, [noticeVisible, requestMail, send, status]);
  return <EmailVerificationContext.Provider value={value}>{children}</EmailVerificationContext.Provider>;
}
