import { StyleSheet, View } from "react-native";
import { Avatar, Card, ListRow, Segmented, UiPressable, UiText } from "../../components/ui";
import type { AppearanceChoice } from "../../design/appearance";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { AccountRow } from "./parts/AccountRow";
import type { AccountPermissionStatus } from "./permission-action";

export type AccountPermissionRow = { key: "camera" | "calendar" | "notification"; status: AccountPermissionStatus; onPress: () => void };
export function AccountSettingsContent({ t, name, email, accountName, accountEmail, language, appearance, development, permissions, onOpen, onLanguage, onAppearance, onSignOut }: {
  t: OrbitTranslator; name: string; email: string; accountName?: string; accountEmail?: string; language: "ja" | "en" | "zh"; appearance: AppearanceChoice; development: boolean; permissions: AccountPermissionRow[];
  onOpen: (path: string) => void; onLanguage: (language: "ja" | "en" | "zh") => void; onAppearance: (choice: AppearanceChoice) => void; onSignOut: () => void;
}) {
  const { styles } = useStyles();
  const rowName = name.trim() || accountName?.trim() || t("settings.account");
  const rowEmail = accountEmail?.trim() || email.trim();
  return <View style={styles.stack}>
    <Card>
      <ListRow title={rowName} subtitle={rowEmail} leading={<Avatar name={rowName} />} onPress={() => onOpen("/account")} /></Card>
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
    {/* iOS Settings: data, help and the legal page as one group near the end; 退出登录 alone as a full-width row. */}
    <UiText style={styles.label}>{t("settings.dataHelp")}</UiText>
    <Card style={styles.group}>
      <AccountRow icon="share" title={t("me.export")} onPress={() => onOpen("/account/exports")} />
      <AccountRow icon="book" title={t("me.help")} onPress={() => onOpen("/settings/help")} />
      <AccountRow icon="shield" title={t("me.terms")} onPress={() => onOpen("/settings/terms")} />
      {development ? <AccountRow icon="settings" title={t("settings.server")} onPress={() => onOpen("/settings/api")} /> : null}
    </Card>
    <Card style={styles.signOutCard}>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("me.logout")} onPress={onSignOut} style={styles.signOut}>
        <UiText style={styles.signOutText}>{t("me.logout")}</UiText>
      </UiPressable>
    </Card>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, group: { paddingVertical: spacing.xxs }, label: { color: colors.ink3, fontSize: typography.label, fontWeight: "700", paddingLeft: spacing.sm, marginTop: spacing.sm },
  signOutCard: { paddingVertical: 0, marginTop: spacing.sm }, signOut: { minHeight: 52, alignItems: "center", justifyContent: "center" }, signOutText: { color: colors.coralText, fontSize: typography.row, fontWeight: "700" } }));
