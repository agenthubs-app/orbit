import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, ListRow, TextField, Toggle, UiText } from "../../components/ui";
import { profileBioLimit, profileBioWithinLimit, profileVisibleLength } from "../../api/schema/profile-bio";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import type { AccountMemory } from "./settings-api";
export function AccountIorbitContent({ t, goal, bio, memories, semanticAvailable, semanticOn, busy, offline = false, aiAvailable = true, canSave = true, onGoal, onBio, onGenerate, onSave, onDelete, onSemantic }: {
  t: OrbitTranslator; goal: string | null | undefined; bio: string; memories: AccountMemory[] | null; semanticAvailable: boolean; semanticOn: boolean; busy: boolean; offline?: boolean; aiAvailable?: boolean; canSave?: boolean;
  onGoal: () => void; onBio: (value: string) => void; onGenerate: () => void; onSave: () => void; onDelete: (id: string) => void; onSemantic: (value: boolean) => void;
}) {
  const { styles } = useStyles();
  return <View style={styles.stack}>
    {goal !== undefined ? <Card>
      <ListRow title={t("me.goal")} subtitle={goal ?? t("me.noGoal")} trailing={
      <Button label={t("me.change")} variant="ghost" size="sm" onPress={onGoal} />} /></Card> : null}
    <Card style={styles.stack}>
      <TextField label={t("me.intro")} multiline value={bio} onChangeText={onBio} /><UiText style={styles.detail}>{t("me.introLimit", { count: profileVisibleLength(bio), limit: profileBioLimit(bio) })}</UiText>{aiAvailable ? <>
      <Button label={t("me.aiIntro")} variant="secondary" disabled={busy} onPress={onGenerate} /><UiText style={styles.detail}>{t("me.aiReview")}</UiText></> : null}
      <Button label={t("me.save")} disabled={busy || !canSave || !profileBioWithinLimit(bio)} onPress={onSave} /></Card>
    {memories !== null ? <Card style={styles.stack}><UiText style={styles.heading}>{t("me.memory")}</UiText>{memories.length ? memories.map(memory => <View key={memory.memoryId} style={styles.memory}><UiText style={styles.body}>{memory.content}</UiText><View style={styles.row}><Chip label={t(memory.source === "manual" ? "me.sourceManual" : "me.sourceConversation")} />
      <Button label={t("me.delete")} variant="danger" size="sm" disabled={busy || offline} onPress={() => onDelete(memory.memoryId)} /></View></View>) : <UiText style={styles.detail}>{t("me.noMemories")}</UiText>}</Card> : null}
    {/* QA-D: the note wraps; as a ListRow subtitle it was cut to one line. */}
    {semanticAvailable ? <Card><View style={styles.row}><View style={styles.grow}><UiText style={styles.heading}>{t("me.semantic")}</UiText><UiText style={styles.detail}>{t("me.semanticNote")}</UiText></View>
      <Toggle value={semanticOn} onValueChange={onSemantic} accessibilityLabel={t("me.semantic")} disabled={busy} /></View></Card> : null}
    <UiText style={styles.detail}>{t("me.privacyHint")}</UiText>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, heading: { color: colors.ink, fontSize: typography.cardTitle, fontWeight: "700" }, body: { color: colors.ink2, fontSize: typography.bodySm }, detail: { color: colors.ink3, fontSize: typography.label }, memory: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.sm }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, grow: { flex: 1, gap: 2 } }));
