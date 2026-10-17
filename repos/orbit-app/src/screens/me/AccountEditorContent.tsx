import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, ListRow, TextField, Toggle, UiText } from "../../components/ui";
import { profileBioLimit, profileVisibleLength } from "../../api/schema/profile-bio";
import type { ProfileEditDraft } from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";

export function AccountEditorContent({ draft, t, patch, onTags }: { draft: ProfileEditDraft; t: OrbitTranslator; patch: (fields: Partial<ProfileEditDraft>) => void; onTags: (field: "offering" | "seeking") => void }) {
  const { styles } = useStyles();
  const visibility = draft.publicFields ?? { companyRole: true, offeringSeeking: true, intro: true };
  return <View style={styles.stack}>
    <View style={styles.avatar}><Avatar name={draft.displayName} size="lg" /></View>
    <Card style={styles.stack}>
      <TextField label={t("profile.name")} value={draft.displayName} onChangeText={value => patch({ displayName: value })} />
      <TextField label={t("me.company")} value={draft.organization} onChangeText={value => patch({ organization: value })} />
      <TextField label={t("me.role")} value={draft.role} onChangeText={value => patch({ role: value })} />
      <TextField label={t("me.industry")} value={draft.industry ?? ""} onChangeText={value => patch({ industry: value })} />
      <TextField label={t("me.location")} value={draft.homeMarket} onChangeText={value => patch({ homeMarket: value })} />
    </Card>
    <Card style={styles.stack}>
      <TextField label={t("me.intro")} multiline value={draft.bio} placeholder={t("me.bioHint")} onChangeText={value => patch({ bio: value })} />
      <UiText style={styles.secondary}>{t("me.introLimit", { count: profileVisibleLength(draft.bio), limit: profileBioLimit(draft.bio) })}</UiText>
    </Card>
    <Card>{(["offering", "seeking"] as const).map(field => <View key={field} style={styles.tags}>
      <ListRow title={t(field === "offering" ? "me.offering" : "me.seeking")} trailing={
      <Button label={t("me.edit")} variant="ghost" size="sm" onPress={() => onTags(field)} />} />
      <View style={styles.wrap}>{draft[field].map(value => <Chip key={value} label={value} tone={field === "offering" ? "lav" : "pink"} />)}</View>
    </View>)}</Card>
    <Card><UiText style={styles.heading}>{t("me.publicFields")}</UiText>
      {(["companyRole", "offeringSeeking", "intro"] as const).map((field, index) => {
        const title = t((["me.publicCompany", "me.publicTags", "me.publicIntro"] as const)[index]!);
        return <ListRow key={field} title={title} trailing={
      <Toggle accessibilityLabel={title} value={visibility[field]} onValueChange={value => patch({ publicFields: { ...visibility, [field]: value } })} />} />;
      })}
      <ListRow title={t("me.contact")} subtitle={t("me.exchangeOnly")} />
    </Card>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, avatar: { alignItems: "center", padding: spacing.md }, secondary: { color: colors.ink3, fontSize: typography.label }, heading: { color: colors.ink, fontSize: typography.cardTitle, fontWeight: "700" }, tags: { paddingBottom: spacing.md }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs } }));
