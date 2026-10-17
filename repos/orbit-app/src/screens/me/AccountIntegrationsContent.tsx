import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Icon, ListRow, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { integrationState, type AccountIntegration } from "./settings-api";
export function AccountIntegrationsContent({ t, records, busy, onConnect, onDisconnect }: { t: OrbitTranslator; records: AccountIntegration[]; busy: boolean; onConnect: (provider: "gmail" | "google_calendar") => void; onDisconnect: (provider: "gmail" | "google_calendar") => void }) {
  const { styles } = useStyles();
  return <View style={styles.stack}>{(["gmail", "google_calendar"] as const).map(provider => {
    const record = records.find(row => row.provider === provider); const state = integrationState(record);
    return <Card key={provider} style={styles.stack}>
      <ListRow title={provider === "gmail" ? "Gmail" : t("me.googleCalendar")} leading={<Icon name={provider === "gmail" ? "mail" : "calendar"} size={24} />} trailing={<Chip label={t(state === "connected" ? "me.connected" : state === "preparing" ? "me.preparing" : state === "action_required" ? "me.reconnect" : "me.notAsked")} tone={state === "connected" ? "ok" : "neutral"} />} />
      <UiText style={styles.detail}>{t(provider === "gmail" ? "me.gmailReads" : "me.calendarReads")}</UiText>
      {state === "connected" ?
      <Button variant="danger" label={t("me.disconnect")} disabled={busy} onPress={() => onDisconnect(provider)} /> : state !== "preparing" ?
      <Button label={t(state === "action_required" ? "me.reconnect" : "me.connect")} disabled={busy} onPress={() => onConnect(provider)} /> : null}
    </Card>;
  })}<Card>
      <ListRow title={t("me.googleContacts")} leading={<Icon name="users" size={24} />} trailing={<Chip label={t("me.preparing")} />} /></Card></View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, detail: { color: colors.ink3, fontSize: typography.bodySm, lineHeight: typography.bodySm * 1.6 } }));
