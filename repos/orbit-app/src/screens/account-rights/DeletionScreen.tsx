import { useRouter } from "expo-router";
import { markDeletionRequested } from "../../api/deletion-handoff";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Checkbox, TextField, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { createAccountRightsApi, RightsApiError } from "./api";
import { clearNativeAccountRightsData, discardNativeAccountRightsWrites } from "./local-cleanup-runtime";

export function DeletionScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const api = useMemo(() => createAccountRightsApi({ baseUrl: server.baseUrl, cookieHeader: auth.cookieHeader, client }), [server.baseUrl, auth.cookieHeader, client]);
  const [step, setStep] = useState<"overview" | "verify">("overview");
  const [method, setMethod] = useState<"credentials" | "google" | null>(null);
  const [password, setPassword] = useState("");
  const [googleChallenge, setGoogleChallenge] = useState<string | null>(null);
  const [googleReceipt, setGoogleReceipt] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (auth.offline) return;
    void Promise.all([api.deletion(), auth.readPendingWritesOnDevice()]).then(([request, count]) => {
      if (request?.status === "pending" || request?.status === "purging") router.replace("/account/pending");
      setPendingWrites(count === null || count > 0);
    }).catch(() => setProblem(t("account.rights.error")));
  }, [api, auth.offline, auth.readPendingWritesOnDevice, router, t]);
  useEffect(() => {
    if (!googleChallenge) return;
    setGoogleChallenge(null);
    void api.reauthGoogle(googleChallenge).then(setGoogleReceipt).catch(() => setProblem(t("account.rights.error")));
  }, [api, googleChallenge, t]);
  const next = async () => {
    setBusy(true); setProblem(null);
    try { setMethod(await api.method()); setStep("verify"); }
    catch { setProblem(t("account.rights.error")); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (busy || !confirmed || !auth.accountId || method === "credentials" && !password || method === "google" && !googleReceipt || !method) return;
    setBusy(true); setProblem(null);
    try {
      const receipt = method === "google" ? googleReceipt! : await api.reauthPassword(password);
      await api.requestDeletion(receipt);
      markDeletionRequested();
      setPassword("");
      const scope = { baseUrl: server.baseUrl, actorId: auth.accountId };
      if (!await discardNativeAccountRightsWrites(scope)) {
        setProblem(t("account.rights.localCleanup"));
        await clearNativeAccountRightsData(scope);
        router.replace("/account/pending");
        return;
      }
      // QA-D: leave this private page first; signing out here let the sign-in guard send the user to 登录
      // before 「已受理删除申请」 could show.
      router.replace("/account/pending");
      const signedOut = await auth.signOut();
      if (!signedOut.success) {
        const cleared = await clearNativeAccountRightsData(scope);
        if (!cleared) setProblem(t("account.rights.localCleanup"));
      }
    } catch (error) {
      const reason = error instanceof RightsApiError ? error.reason : "UNAVAILABLE";
      setProblem(t(reason === "invalid_credentials" ? "account.rights.wrongPassword" : reason === "rate_limited" ? "account.rights.rateLimit" :
        reason === "HOST_EVENT_HAS_REGISTRATIONS" ? "account.rights.hostBlocked" : "account.rights.error"));
    } finally { setBusy(false); }
  };
  const startGoogle = async () => {
    if (busy || auth.offline) return;
    setBusy(true); setProblem(null); setGoogleReceipt(null);
    try {
      // 主会话代定 §R18c-3: the broker requests fresh Google auth_time for this purpose.
      const challenge = await api.reauthGoogleStart();
      const result = await auth.signInWithGoogle("/account/deletion", "deletion-request");
      if (!result.success) { setProblem(result.message ?? t("account.rights.error")); return; }
      setGoogleChallenge(challenge);
    } catch { setProblem(t("account.rights.error")); }
    finally { setBusy(false); }
  };
  return <AppScreen inset="kit" title={t("account.rights.delete")} onBack={() => router.replace("/account")}>
    <View style={styles.stack}>
      {step === "overview" ? <>
        <Card><UiText style={styles.body}>{t("account.rights.deletionIntro")}</UiText>
          <UiText style={styles.body}>{t("account.rights.deletionItems")}</UiText>
          <UiText style={styles.note}>{t("account.rights.exportFirst")}</UiText>
          <Button label={t("account.rights.export")} variant="secondary" onPress={() => router.push("/account/exports")} />
        </Card>
        {pendingWrites ? <UiText accessibilityRole="alert" style={styles.warning}>{t("account.rights.unsynced")}</UiText> : null}
        <Button label={t("account.rights.continue")} variant="dangerGhost" block disabled={auth.offline} loading={busy} onPress={() => void next()} />
      </> : <Card><UiText style={styles.heading}>{t("account.rights.verify")}</UiText>
        {method === "credentials" ? <TextField label={t("account.rights.password")} secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} /> :
          <Button label={t("account.rights.verify")} variant="secondary" loading={busy} onPress={() => void startGoogle()} />}
        <View style={styles.confirm}><Checkbox checked={confirmed} accessibilityLabel={t("account.rights.confirm")} onChange={setConfirmed} />
          <UiText style={[styles.body, styles.confirmText]} onPress={() => setConfirmed(value => !value)}>{t("account.rights.confirm")}</UiText></View>
        <Button label={t("account.rights.request")} variant="danger" loading={busy}
          disabled={!confirmed || method === "credentials" && !password || method === "google" && !googleReceipt || auth.offline} onPress={() => void submit()} />
      </Card>}
      {problem ? <UiText accessibilityRole="alert" style={styles.error}>{problem}</UiText> : null}
    </View>
  </AppScreen>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  stack: { gap: spacing.md },
  heading: { fontSize: typography.cardTitle, fontWeight: "700", color: colors.ink, marginBottom: spacing.sm },
  body: { fontSize: typography.body, color: colors.ink, lineHeight: 27, marginBottom: spacing.md },
  note: { fontSize: typography.bodySm, color: colors.ink2, lineHeight: 23, marginBottom: spacing.md },
  confirm: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.lg },
  confirmText: { flex: 1, marginBottom: 0 },
  warning: { fontSize: typography.bodySm, color: colors.coralText, backgroundColor: colors.coralSoft, padding: spacing.md, borderRadius: 12 },
  error: { fontSize: typography.bodySm, color: colors.coralText, backgroundColor: colors.coralSoft, padding: spacing.md, borderRadius: 12 },
}));
