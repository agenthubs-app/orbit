"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { adminText } from "../orbit-2026/copy/admin";
import { Button, Card, Orbit2026Scope, ToastProvider } from "../orbit-2026/ui";
import styles from "./Admin.module.css";

export function OrbitRealAdminLogin() {
  const { language } = useOrbitLanguage();
  const destination = "/app/admin";
  const signInHref = `/app/account/login?next=${encodeURIComponent(destination)}`;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <main className={styles.login} data-orbit-route="app-admin-login-route">
          <Card className={styles.loginCard}>
            <p className={styles.eyebrow}>Orbit · {adminText("workspace", language)}</p>
            <h1 className={styles.title}>{adminText("loginHeading", language)}</h1>
            <p className={styles.body}>{adminText("loginDescription", language)}</p>
            <Button label={adminText("loginAction", language)} variant="primary" block onClick={() => window.location.assign(signInHref)} />
          </Card>
        </main>
      </ToastProvider>
    </Orbit2026Scope>
  );
}
