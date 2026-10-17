import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, EmptyState, Icon, ListRow, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import type { MessageKey, OrbitTranslator } from "../../i18n/messages";
import { suggestionSourceCounts, type AccountSuggestionCard, type AccountSuggestionSource } from "./suggestions-model";
const sourceKeys: Record<AccountSuggestionSource, MessageKey> = { "business-card": "me.newCard", resume: "me.resume", conversation: "me.sourceConversation", chat: "me.sourceConversation", activity: "profile.signalSourceActivity", contact: "profile.signalSourceContact" };
const labels: Record<string, MessageKey> = { role: "me.role", organization: "me.company", displayName: "profile.name", headline: "profile.headline", bio: "me.intro", offering: "me.offering", seeking: "me.seeking", homeMarket: "me.location", relationshipGoal: "profile.relationshipGoal", preferredFollowUpWindow: "profile.followUpWindow", preferredIntroChannels: "profile.introChannels", targetRelationshipTypes: "profile.targetRelationshipTypes" };
export function AccountSuggestionsContent({ cards, t, selected, filter, busy, onFilter, onSelect, onDismiss, onAll, onApply, onEntry }: {
  cards: readonly AccountSuggestionCard[]; t: OrbitTranslator; selected: ReadonlySet<string>; filter: AccountSuggestionSource | "all"; busy: boolean;
  onFilter: (source: AccountSuggestionSource | "all") => void; onSelect: (id: string) => void; onDismiss: (id: string) => void; onAll: (cardId: string) => void; onApply: () => void; onEntry: (kind: "business-card" | "resume" | "chat") => void;
}) {
  const { styles } = useStyles(); const counts = suggestionSourceCounts(cards);
  if (!cards.length) return <View style={styles.stack}><EmptyState title={t("me.suggestionsEmpty")} message={t("me.suggestionsHint")} action={{ label: t("me.scanCard"), onPress: () => onEntry("business-card") }} />
    <Card>
      <Button label={t("me.readResume")} variant="secondary" onPress={() => onEntry("resume")} />
      <Button label={t("me.talkUpdate")} variant="ghost" onPress={() => onEntry("chat")} /></Card>
    <Card style={styles.sample}><Chip label={t("me.sample")} /><UiText style={styles.secondary}>{t("me.companyRole")}</UiText><UiText style={styles.secondary}>— → —</UiText></Card>
  </View>;
  return <View style={styles.stack}>
    <View style={styles.wrap}>
      <Button label={`${t("me.all")} ${cards.length}`} size="sm" variant={filter === "all" ? "primary" : "secondary"} onPress={() => onFilter("all")} />{Object.entries(counts).map(([source, count]) =>
      <Button key={source} label={`${t(sourceKeys[source as AccountSuggestionSource])} ${count}`} size="sm" variant={filter === source ? "primary" : "secondary"} onPress={() => onFilter(source as AccountSuggestionSource)} />)}</View>
    <UiText style={styles.secondary}>{t("me.selectedOnly")}</UiText>
    {cards.filter(card => filter === "all" || filter === card.source).map(card => <View key={card.id} testID="account-suggestion-card"><Card style={styles.stack}>
      <ListRow title={card.name} subtitle={card.company} leading={<Avatar name={card.name} size="sm" />} trailing={
      <Button label={t("me.acceptAll")} size="sm" variant="ghost" disabled={busy} onPress={() => onAll(card.id)} />} />
      <View style={styles.wrap}><Chip label={t(sourceKeys[card.source])} tone="blue" /><UiText style={styles.secondary}>{card.createdAt.slice(0, 10)}</UiText></View>
      {card.fields.map(field => { const label = labels[field.key]; const title = label ? t(label) : field.label; return <View key={field.id} style={[styles.field, selected.has(field.id) && styles.selected]}>
        <UiText style={styles.heading}>{title}</UiText><View style={styles.diff}><UiText style={styles.before}>{field.current || "—"}</UiText><Icon name="right" size={16} /><UiText style={styles.after}>{field.proposed}</UiText></View>
        {field.live?.rationale ? <UiText style={styles.secondary}>{field.live.rationale}</UiText> : null}
        <View style={styles.wrap}>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("me.acceptCandidate", { label: title })} accessibilityState={{ selected: selected.has(field.id), disabled: busy }} disabled={busy} onPress={() => onSelect(field.id)} style={styles.choice}><Icon name="check" size={16} /></UiPressable>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("me.dismissCandidate", { label: title })} disabled={busy} onPress={() => onDismiss(field.id)} style={styles.choice}><Icon name="x" size={16} /></UiPressable></View>
      </View>; })}
    </Card></View>)}
    <Button label={t("me.applySelected")} disabled={busy || !selected.size} onPress={onApply} />
    <Button label={t("me.scanCard")} variant="ghost" onPress={() => onEntry("business-card")} />
      <Button label={t("me.readResume")} variant="ghost" onPress={() => onEntry("resume")} />
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }, sample: { opacity: 0.45, gap: spacing.md }, secondary: { color: colors.ink3, fontSize: typography.label }, heading: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" }, field: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.sm }, selected: { opacity: 0.65 }, diff: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm }, before: { color: colors.ink3, textDecorationLine: "line-through", flex: 1, fontSize: typography.bodySm }, after: { color: colors.ink, flex: 1, fontWeight: "700", fontSize: typography.bodySm }, choice: { backgroundColor: colors.surface2, borderRadius: radius.sm, minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" } }));
