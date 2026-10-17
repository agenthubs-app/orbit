import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, Icon, IconButton, RingChart, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import type { MessageKey, OrbitTranslator } from "../../i18n/messages";
import { accountCardCompleteness } from "./account-model";
import { AccountRow } from "./parts/AccountRow";

import type { AccountProfileData } from "./account-response";
export type { AccountProfileData } from "./account-response";
const fieldLabels: Record<string, MessageKey> = { companyRole: "me.companyRole", offering: "me.offeringField", seeking: "me.seeking", intro: "me.intro" };

export function MyPageContent({ data, t, candidates, unread, going, hostEntry, onOpen, onCandidate }: {
  data: AccountProfileData; t: OrbitTranslator; candidates: readonly string[];
  unread: number | null; going: number | null; hostEntry: ReactNode;
  onOpen: (path: string) => void; onCandidate: (candidate: string, accept: boolean) => void;
}) {
  const { colors, styles } = useStyles();
  const profile = data.profile;
  if (!profile) return null;
  const completion = accountCardCompleteness(data.completeness);
  const missing = completion.items.filter(item => !item.done);
  return <View style={styles.stack}>
    <UiPressable accessibilityRole="button" accessibilityLabel={t("me.edit")} onPress={() => onOpen("/profile/edit")}>
      <Card style={styles.business}>
        <View style={styles.row}><Icon name="user" size={16} /><UiText style={styles.small}>{t("me.cardTitle")}</UiText><View style={styles.spacer} />
      <IconButton icon="share" accessibilityLabel={t("me.share")} onPress={() => onOpen("/contacts/new/invite")} /></View>
        <View style={[styles.row, styles.identity]}><Avatar name={profile.displayName} size="lg" /><View style={styles.spacer}><UiText style={styles.name}>{profile.displayName}</UiText>{profile.organization || profile.role ? <UiText style={styles.sub}>{[profile.organization, profile.role].filter(Boolean).join(" · ")}</UiText> : null}</View></View>
        {profile.handles?.email ? <View style={styles.row}><Icon name="mail" size={16} /><UiText style={styles.small}>{profile.handles.email}</UiText></View> : null}
      </Card>
    </UiPressable>
    <Card>
      <View style={styles.row}>
        <RingChart size={84} stroke={9} segments={[{ value: completion.score, color: colors.plum700 }, { value: 100 - completion.score, color: colors.surface3 }]} center={completion.score + "%"} accessibilityLabel={t("me.completion", { score: completion.score })} />
        <View style={styles.spacer}><UiText style={styles.small}>{t("me.completeness")}</UiText><UiText style={[styles.title, completion.score === 100 && { color: colors.okText }]}>{completion.score === 100 ? t("me.complete") : t("me.missing", { count: missing.length })}</UiText></View>
      </View>
      {missing.map(item =>
      <UiPressable key={item.key} style={styles.missing} accessibilityRole="button" onPress={() => onOpen(item.key === "offering" || item.key === "seeking" ? "/profile/tags?kind=" + item.key : "/profile/edit")}>
        <Icon name="plus" size={16} /><UiText style={styles.label}>{fieldLabels[item.key] ? t(fieldLabels[item.key]!) : item.key}</UiText><View style={styles.spacer} /><UiText style={styles.small}>{t("me.weight", { weight: item.weight })}</UiText>
      </UiPressable>)}
    </Card>
    <Card>
      <TagGroup title={t("me.offering")} values={profile.offering ?? []} hint={t("me.newOfferHint")} tone="lav" onOpen={() => onOpen("/profile/tags?kind=offering")} t={t} />
      <View style={styles.section}><TagGroup title={t("me.seeking")} values={profile.seeking ?? []} hint={t("me.newSeekHint")} tone="pink" onOpen={() => onOpen("/profile/tags?kind=seeking")} t={t} /></View>
      {candidates.length ? <View style={styles.section}><UiText style={styles.small}>{t("me.aiCandidates")}</UiText><View style={styles.tags}>{candidates.map(candidate => <View style={styles.candidate} key={candidate}><UiText style={styles.label}>{candidate}</UiText>
      <IconButton icon="x" accessibilityLabel={t("me.dismissCandidate", { label: candidate })} onPress={() => onCandidate(candidate, false)} />
      <IconButton icon="check" accessibilityLabel={t("me.acceptCandidate", { label: candidate })} onPress={() => onCandidate(candidate, true)} /></View>)}</View></View> : null}
    </Card>
    <Card style={styles.group}>
      <AccountRow icon="user" title={t("me.preview")} detail={t("me.previewHint")} onPress={() => onOpen("/profile/preview")} /></Card>
    <Card style={styles.group}>
      {unread !== null ?
      <AccountRow icon="inbox" title={t("me.inbox")} trailing={unread > 0 ? <Chip label={String(unread)} tone="coral" /> : null} onPress={() => onOpen("/inbox")} /> : null}
      <AccountRow icon="link" title={t("me.invite")} detail={t("me.inviteHint")} onPress={() => onOpen("/contacts/new/invite")} />
      {hostEntry}
      {going !== null && going > 0 ?
      <AccountRow icon="calendar" title={t("me.going")} detail={t("me.upcomingCount", { count: going })} onPress={() => onOpen("/events?tab=going")} /> : null}
      <AccountRow icon="settings" title={t("me.settings")} detail={t("me.settingsHint")} onPress={() => onOpen("/settings")} />
    </Card>
  </View>;
}

function TagGroup({ title, values, hint, tone, onOpen, t }: { title: string; values: readonly string[]; hint: string; tone: "lav" | "pink"; onOpen: () => void; t: OrbitTranslator }) {
  const { styles } = useStyles();
  return <View><View style={styles.row}><UiText style={styles.small}>{title}</UiText><View style={styles.spacer} />
      <Button label={t("me.add")} variant="ghost" size="sm" onPress={onOpen} /></View><View style={styles.tags}>{values.length ? values.map(value => <Chip key={value} label={value} tone={tone} />) :
      <UiPressable accessibilityRole="button" onPress={onOpen}><UiText style={styles.hint}>{hint}</UiText></UiPressable>}</View></View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  stack: { gap: spacing.md + spacing.xxs }, row: { flexDirection: "row", alignItems: "center", gap: spacing.md }, spacer: { flex: 1, minWidth: 0 },
  business: { minHeight: 200, justifyContent: "space-between", paddingHorizontal: spacing.lg + spacing.xxs,
    experimental_backgroundImage: [{ type: "linear-gradient", direction: "135deg", colorStops: [{ color: colors.macLav }, { color: colors.surface, positions: ["62%"] }] }] },
  identity: { marginVertical: spacing.lg }, name: { color: colors.ink, fontSize: typography.emojiMd, fontWeight: "800" },
  title: { color: colors.ink, fontSize: typography.cardTitle, fontWeight: "700", marginTop: spacing.xxs },
  sub: { color: colors.ink2, fontSize: typography.bodySm, marginTop: spacing.xxs }, small: { color: colors.ink3, fontSize: typography.label },
  label: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" }, section: { marginTop: spacing.md + spacing.xxs },
  tags: { flexDirection: "row", gap: spacing.xs + spacing.xxs, flexWrap: "wrap", marginTop: spacing.xs + spacing.xxs },
  hint: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3, borderRadius: radius.sm, padding: spacing.sm, color: colors.ink3, fontSize: typography.caption },
  missing: { flexDirection: "row", alignItems: "center", gap: spacing.sm + spacing.xxs, paddingVertical: spacing.sm + 1, borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.xs },
  candidate: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, borderRadius: radius.chip, paddingLeft: spacing.sm },
  group: { paddingVertical: spacing.xxs, paddingHorizontal: spacing.lg },
}));
