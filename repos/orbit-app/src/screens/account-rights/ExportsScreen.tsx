import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { AccountExportContract } from "../../api/contract/account";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Checkbox, Segmented, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { MessageKey } from "../../i18n/messages";
import { createAccountRightsApi, RightsApiError } from "./api";

type Choice = "contacts" | "notes" | "plans" | "events";
const CHOICES: Choice[] = ["contacts", "notes", "plans", "events"];
const statusKey: Record<AccountExportContract["status"], MessageKey> = {
  queued: "account.rights.queued", running: "account.rights.running", ready: "account.rights.ready",
  failed: "account.rights.failed", expired: "account.rights.expired",
};

export function ExportsScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const { t, language } = useOrbitLocale();
  const { styles } = useStyles();
  const api = useMemo(() => createAccountRightsApi({ baseUrl: server.baseUrl, cookieHeader: auth.cookieHeader, client }), [server.baseUrl, auth.cookieHeader, client]);
  const [selected, setSelected] = useState<Choice[]>(["contacts", "notes", "plans"]);
  const [all, setAll] = useState(false);
  const [format, setFormat] = useState<"csv" | "vcard">("csv");
  const [history, setHistory] = useState<AccountExportContract[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const load = useCallback(async () => {
    try { setHistory(await api.exports()); setProblem(null); }
    catch { setProblem(t("account.rights.error")); }
  }, [api, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!history.some(item => item.status === "queued" || item.status === "running")) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [history, load]);
  const active = history.some(item => item.status === "queued" || item.status === "running");
  const choose = (choice: Choice, checked: boolean) => {
    key.current = null; setAll(false);
    setSelected(current => checked ? [...new Set([...current, choice])] : current.filter(item => item !== choice));
  };
  const start = async () => {
    if (busy || auth.offline || active || !all && !selected.length) return;
    setBusy(true); setProblem(null);
    key.current ??= `app-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scope = all ? ["contacts", "notes", "plans", "tasks", "events"] : selected.flatMap(choice => choice === "plans" ? ["plans", "tasks"] : [choice]);
    try { await api.createExport({ scope, mode: all ? "all-json" : "selected", ...(!all ? { contactsFormat: format } : {}), idempotencyKey: key.current }); key.current = null; await load(); }
    catch (error) {
      const reason = error instanceof RightsApiError ? error.reason : "UNAVAILABLE";
      setProblem(t(reason === "DAILY_EXPORT_LIMIT" ? "account.rights.quota" : reason === "EXPORT_IN_PROGRESS" ? "account.rights.active" :
        reason === "RECENT_LOGIN_REQUIRED" ? "account.rights.fresh" : "account.rights.error"));
    } finally { setBusy(false); }
  };
  const download = async (item: AccountExportContract) => {
    if (busy || auth.offline) return;
    setBusy(true); setProblem(null);
    try { await api.shareExport(item); }
    catch { setProblem(t("account.rights.error")); await load(); }
    finally { setBusy(false); }
  };
  const date = (value: string) => new Intl.DateTimeFormat(language, { timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
  return <AppScreen inset="kit" title={t("account.rights.export")} onBack={() => router.replace("/account")}>
    <View style={styles.stack}>
      <UiText style={styles.note}>{t("account.rights.exportIntro")}</UiText>
      <Card><UiText style={styles.heading}>{t("account.rights.select")}</UiText>
        {CHOICES.map(choice => <View style={styles.choice} key={choice}>
          <Checkbox checked={!all && selected.includes(choice)} accessibilityLabel={t(`account.rights.${choice}`)} onChange={value => choose(choice, value)} />
          <UiText style={styles.choiceText}>{t(`account.rights.${choice}`)}</UiText>
        </View>)}
        <View style={styles.choice}><Checkbox checked={all} accessibilityLabel={t("account.rights.all")} onChange={value => { key.current = null; setAll(value); }} /><UiText style={styles.choiceText}>{t("account.rights.all")}</UiText></View>
        {!all && selected.includes("contacts") ? <><UiText style={styles.label}>{t("account.rights.format")}</UiText><Segmented segments={[{ key: "csv", label: "CSV" }, { key: "vcard", label: "vCard" }]} value={format} onChange={setFormat} accessibilityLabel={t("account.rights.format")} /></> : null}
        <UiText style={styles.note}>{t("account.rights.limit")}</UiText>
        <Button label={t("account.rights.start")} variant="primary" block loading={busy} disabled={auth.offline || active || !all && !selected.length} onPress={() => void start()} />
      </Card>
      {problem ? <UiText accessibilityRole="alert" style={styles.error}>{problem}</UiText> : null}
      <Card><View style={styles.row}><UiText style={styles.heading}>{t("account.rights.history")}</UiText><Button label={t("account.rights.retry")} size="sm" variant="ghost" onPress={() => void load()} /></View>
        {history.length === 0 ? <UiText style={styles.note}>{t("account.rights.empty")}</UiText> : history.map(item => <View key={item.id} style={styles.history}>
          <UiText style={styles.choiceText}>{t(statusKey[item.status])}</UiText><UiText style={styles.note}>{date(item.requestedAt)}</UiText>
          {item.status === "queued" || item.status === "running" ? <UiText style={styles.note}>{t("account.rights.progress", { done: item.completedItems ?? 0, total: item.totalItems ?? item.scope.length })}</UiText> : null}
          {item.status === "ready" && item.downloadUrl ? <Button label={t("account.rights.download")} variant="secondary" disabled={auth.offline} onPress={() => void download(item)} /> : null}
        </View>)}
      </Card>
    </View>
  </AppScreen>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  stack: { gap: spacing.md },
  heading: { fontSize: typography.body, fontWeight: "700", color: colors.ink, marginBottom: spacing.sm },
  label: { fontSize: typography.label, fontWeight: "700", color: colors.ink2, marginTop: spacing.md, marginBottom: spacing.sm },
  note: { fontSize: typography.label, color: colors.ink2, lineHeight: 19, marginVertical: spacing.xs },
  choice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md },
  choiceText: { fontSize: typography.body, color: colors.ink, fontWeight: "600", flexShrink: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  history: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md, gap: spacing.xs },
  error: { color: colors.coralText, backgroundColor: colors.coralSoft, padding: spacing.md, borderRadius: 12 },
}));
