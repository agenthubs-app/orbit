import { StyleSheet, View } from "react-native";
import type { ManualProfileContract } from "../../api/contract/profile";
import { Avatar, Card, Chip, Icon, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { projectPublicProfile } from "../profile/profile-page-model";

export function AccountPreviewContent({ profile, t }: { profile: ManualProfileContract; t: OrbitTranslator }) {
  const { styles } = useStyles();
  const view = projectPublicProfile(profile);
  return <View style={styles.stack}><Card style={styles.stack}>
    <Avatar name={view.displayName} size="lg" /><UiText style={styles.name}>{view.displayName}</UiText>
    {view.organization || view.role ? <UiText style={styles.body}>{[view.organization, view.role].filter(Boolean).join(" · ")}</UiText> : null}
    {view.homeMarket ? <View style={styles.row}><Icon name="pin" size={16} /><UiText style={styles.secondary}>{view.homeMarket}</UiText></View> : null}
    {view.bio ? <UiText style={styles.body}>{view.bio}</UiText> : null}
    {view.offering?.length ? <View><UiText style={styles.heading}>{t("me.offering")}</UiText><View style={styles.row}>{view.offering.map(value => <Chip label={value} key={value} tone="lav" />)}</View></View> : null}
    {view.seeking?.length ? <View><UiText style={styles.heading}>{t("me.seeking")}</UiText><View style={styles.row}>{view.seeking.map(value => <Chip label={value} key={value} tone="pink" />)}</View></View> : null}
    <View style={styles.row}><Icon name="lock" size={16} /><UiText style={styles.secondary}>{t("me.contact")} · {t("me.exchangeOnly")}</UiText></View>
  </Card></View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.lg }, row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }, name: { color: colors.ink, fontSize: typography.titleSm, fontWeight: "800" }, heading: { color: colors.ink, fontSize: typography.label, fontWeight: "700", marginBottom: spacing.sm }, body: { color: colors.ink2, fontSize: typography.body, lineHeight: typography.body * 1.6 }, secondary: { color: colors.ink3, fontSize: typography.label } }));
