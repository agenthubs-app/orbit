import { StyleSheet, View } from "react-native";
import { Button, Card, ListRow, TextField, Toggle, UiText } from "../../components/ui";
import { profileBioLimit, profileBioWithinLimit, profileVisibleLength } from "../../api/schema/profile-bio";
import type { AgentMemoryEntryContract } from "../../api/contract/agent-v1";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { AccountMemorySection } from "./AccountMemorySection";
import type { AccountMemoryList, MemorySaveInput } from "./settings-api";

// AG14 (approved draft board 6): the memory part is three cards with two switches, groups and a bottom-sheet editor
// (AccountMemorySection); the rest of the page is unchanged.
export function AccountIorbitContent({ t, language = "ja", goal, bio, memories, semanticAvailable, semanticOn, busy, offline = false, aiAvailable = true, canSave = true, openMemoryId = null, onGoal, onBio, onGenerate, onSave, onSemantic, onMemorySwitch = () => {}, onMemorySave = async () => false, onMemoryRemove = async () => false }: {
  t: OrbitTranslator; language?: "zh" | "ja" | "en"; goal: string | null | undefined; bio: string; memories: AccountMemoryList | null; semanticAvailable: boolean; semanticOn: boolean; busy: boolean; offline?: boolean; aiAvailable?: boolean; canSave?: boolean; openMemoryId?: string | null;
  onGoal: () => void; onBio: (value: string) => void; onGenerate: () => void; onSave: () => void; onSemantic: (value: boolean) => void;
  onMemorySwitch?: (key: "enabled" | "allowConversationLearning", on: boolean) => void; onMemorySave?: (input: MemorySaveInput, memoryId: string | null) => Promise<boolean>; onMemoryRemove?: (entry: AgentMemoryEntryContract) => Promise<boolean>;
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
    {memories !== null ? <AccountMemorySection list={memories} language={language} offline={offline} busy={busy} openMemoryId={openMemoryId} onSwitch={onMemorySwitch} onSave={onMemorySave} onRemove={onMemoryRemove} /> : null}
    {/* QA-D: the note wraps; as a ListRow subtitle it was cut to one line. */}
    {semanticAvailable ? <Card><View style={styles.row}><View style={styles.grow}><UiText style={styles.heading}>{t("me.semantic")}</UiText><UiText style={styles.detail}>{t("me.semanticNote")}</UiText></View>
      <Toggle value={semanticOn} onValueChange={onSemantic} accessibilityLabel={t("me.semantic")} disabled={busy} /></View></Card> : null}
    <UiText style={styles.detail}>{t("me.privacyHint")}</UiText>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, heading: { color: colors.ink, fontSize: typography.cardTitle, fontWeight: "700" }, detail: { color: colors.ink3, fontSize: typography.label }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, grow: { flex: 1, gap: 2 } }));
