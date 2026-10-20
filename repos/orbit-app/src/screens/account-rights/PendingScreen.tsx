import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { AccountDeletionRequestContract } from "../../api/contract/account";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { syncLifecycle } from "../../data/sync/sync-lifecycle";
import { createAccountRightsApi, RightsApiError } from "./api";
import { clearNativeAccountRightsData } from "./local-cleanup-runtime";

export function PendingScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const api = useMemo(() => createAccountRightsApi({ baseUrl: server.baseUrl, cookieHeader: auth.cookieHeader, client }), [server.baseUrl, auth.cookieHeader, client]);
  const [request, setRequest] = useState<AccountDeletionRequestContract | null>(null);
  const [needsLogin, setNeedsLogin] = useState(!auth.signedIn);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!auth.signedIn || auth.offline) { setNeedsLogin(true); return; }
    void api.deletion().then(value => {
      setNeedsLogin(false); setRequest(value);
      if (!value || value.status === "cancelled") router.replace("/account");
    }).catch(error => {
      if (error instanceof RightsApiError && error.status === 401) setNeedsLogin(true);
      else setProblem(t("account.rights.error"));
    });
  }, [api, auth.signedIn, auth.offline, router, t]);
  useEffect(() => {
    if (!auth.accountId) return;
    void clearNativeAccountRightsData({ baseUrl: server.baseUrl, actorId: auth.accountId }).then(ok => {
      if (!ok) setProblem(t("account.rights.localCleanup"));
    });
  }, [auth.accountId, server.baseUrl, t]);
  const cancel = async () => {
    if (busy || !request || needsLogin) return;
    setBusy(true); setProblem(null);
    try {
      await api.cancelDeletion();
      if (auth.accountId && !await syncLifecycle.setScope({ baseUrl: server.baseUrl, actorId: auth.accountId })) setProblem(t("account.rights.localCleanup"));
      router.replace("/account");
    }
    catch (error) { setProblem(t(error instanceof RightsApiError && error.reason === "DELETION_TOO_LATE" ? "account.rights.tooLate" : "account.rights.error")); }
    finally { setBusy(false); }
  };
  const purgeDate = request?.purgeAfter ? new Intl.DateTimeFormat(language, { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(request.purgeAfter)) : null;
  return <AppScreen inset="kit" showBack={false} title={t("account.rights.pending")}>
    <View style={styles.stack}>
      <Card><UiText style={styles.heading}>{t("account.rights.pending")}</UiText><UiText style={styles.body}>{t("account.rights.pendingBody")}</UiText>
        {purgeDate ? <UiText style={styles.note}>{purgeDate}</UiText> : null}</Card>
      {problem ? <UiText accessibilityRole="alert" style={styles.error}>{problem}</UiText> : null}
      {needsLogin ? <Button label={t("auth.loginPrimary")} variant="primary" onPress={() => router.replace("/account/login?next=/account/pending")} /> :
        request?.status === "pending" ? <Button label={t("account.rights.cancel")} variant="primary" loading={busy} onPress={() => void cancel()} /> : null}
      <Button label={t("account.signOut")} variant="ghost" onPress={() => void auth.signOut()} />
    </View>
  </AppScreen>;
}

export function DeletedScreen() {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  return <AppScreen inset="kit" showBack={false} title={t("account.rights.deleted")}>
    <Card><UiText style={styles.heading}>{t("account.rights.deleted")}</UiText><UiText style={styles.body}>{t("account.rights.deletedBody")}</UiText></Card>
  </AppScreen>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  stack: { gap: spacing.md },
  heading: { fontSize: typography.cardTitle, fontWeight: "700", color: colors.ink, marginBottom: spacing.sm },
  body: { fontSize: typography.body, color: colors.ink, lineHeight: 22 },
  note: { fontSize: typography.bodySm, color: colors.ink2, marginTop: spacing.md },
  error: { fontSize: typography.bodySm, color: colors.coralText, backgroundColor: colors.coralSoft, padding: spacing.md, borderRadius: 12 },
}));
