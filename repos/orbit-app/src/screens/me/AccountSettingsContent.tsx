import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, ListRow, Segmented, UiText } from "../../components/ui";
import type { AppearanceChoice } from "../../design/appearance";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { AccountRow } from "./parts/AccountRow";
import type { AccountPermissionStatus } from "./permission-action";

export type AccountPermissionRow = { key: "camera" | "calendar" | "notification"; status: AccountPermissionStatus; onPress: () => void };
export function AccountSettingsContent({ t, name, email, language, appearance, development, permissions, onOpen, onLanguage, onAppearance, onSignOut }: {
  t: OrbitTranslator; name: string; email: string; language: "ja" | "en" | "zh"; appearance: AppearanceChoice; development: boolean; permissions: AccountPermissionRow[];
  onOpen: (path: string) => void; onLanguage: (language: "ja" | "en" | "zh") => void; onAppearance: (choice: AppearanceChoice) => void; onSignOut: () => void;
}) {
  const { styles } = useStyles();
  return <View style={styles.stack}>
    <Card>
      <ListRow title={name} subtitle={email} leading={<Avatar name={name} />} onPress={() => onOpen("/account")} /></Card>
    <UiText style={styles.label}>{t("me.help")}</UiText>
    <Card style={styles.group}>
      <AccountRow icon="share" title={t("me.export")} onPress={() => onOpen("/settings/export")} />
      <AccountRow icon="book" title={t("me.help")} onPress={() => onOpen("/settings/help")} />
    </Card>
    <Card style={styles.group}>
      <AccountRow icon="target" title={t("me.iorbit")} onPress={() => onOpen("/settings/iorbit")} />
      <AccountRow icon="link" title={t("me.integrations")} onPress={() => onOpen("/settings/integrations")} />
      <AccountRow icon="bell" title={t("me.notification")} onPress={() => onOpen("/settings/notifications")} />
    </Card>
    <UiText style={styles.label}>{t("settings.language")}</UiText><Card>
      <Segmented accessibilityLabel={t("settings.language")} segments={[{ key: "ja", label: t("settings.languageJa") }, { key: "en", label: t("settings.languageEn") }, { key: "zh", label: t("settings.languageZh") }]} value={language} onChange={onLanguage} /></Card>
    <UiText style={styles.label}>{t("settings.appearance")}</UiText><Card>
      <Segmented accessibilityLabel={t("settings.appearance")} segments={[{ key: "light", label: t("settings.appearanceLight") }, { key: "dark", label: t("settings.appearanceDark") }, { key: "system", label: t("settings.appearanceSystem") }]} value={appearance} onChange={onAppearance} /></Card>
    {permissions.length ? <><UiText style={styles.label}>{t("settings.permissions")}</UiText><Card style={styles.group}>{permissions.map(row =>
      <AccountRow key={row.key} icon={row.key === "camera" ? "scan" : row.key === "calendar" ? "calendar" : "bell"} title={t(row.key === "camera" ? "me.camera" : row.key === "calendar" ? "me.calendar" : "me.notification")} detail={t(row.status === "granted" ? "me.permitted" : row.status === "denied" ? "me.denied" : "me.notAsked")} onPress={row.onPress} />)}</Card></> : null}
    <Button label={t("me.logout")} variant="danger" onPress={onSignOut} />
    <Button label={t("me.terms")} variant="ghost" onPress={() => onOpen("/settings/terms")} />
    {development ?
      <Button label={t("settings.server")} variant="ghost" onPress={() => onOpen("/settings/api")} /> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, group: { paddingVertical: spacing.xxs }, label: { color: colors.ink3, fontSize: typography.label, fontWeight: "700", paddingLeft: spacing.sm, marginTop: spacing.sm } }));
