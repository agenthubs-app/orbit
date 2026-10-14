// R12 人脈を追加 · the doors (app.html 人脈「＋」, b12 N08; D19: a sheet over 人脈): 名刺をスキャン
// (apricot wash), 招待コード, 手入力, その他 (連絡先 / LinkedIn), 確認待ち 下書き N件 (only when
// there are drafts, DESIGN §2.9) and the density legend. Kit values: `.addp` 13 / 14 padding,
// radius 18, `.addo` cells radius 14 with a hairline, `.emo` 40 / 32.
// 招待コード opened with R15; その他 (連絡先 / LinkedIn) with R16.
import { StyleSheet, View } from "react-native";

import type { ContactDensityLevel } from "../../api/compute/contact-density";
import { Icon, IconButton, MacTile, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { KitGradient } from "../plan/plan-kit";
import { DensityDots } from "./add-ui";

/** R15: the 招待コード door (`contacts/new/invite`) is open. */
export const ADD_INVITE_DOOR_ENABLED = true;
/** R16: 連絡先 / LinkedIn (`contacts/new/import`). */
export const ADD_OTHER_DOORS_ENABLED = true;

export const ADD_DOOR_HREFS = {
  scan: "/contacts/new/scan",
  invite: "/contacts/new/invite",
  manual: "/contacts/new/manual",
  contacts: "/contacts/new/import?kind=contacts",
  linkedin: "/contacts/new/import?kind=linkedin",
  drafts: "/contacts/new/drafts",
} as const;

type DoorKey = keyof typeof ADD_DOOR_HREFS;
type Tone = "pink" | "apricot" | "blue" | "teal" | "lav";

export function AddContactDoors({ draftCount, onOpen, onClose, header = true }: { draftCount: number; onOpen: (href: string) => void; onClose?: () => void; /** The page (`contacts/new`) has the title in its top bar. */ header?: boolean }) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const door = (key: DoorKey, emoji: string, tone: Tone, title: string, body: string, density?: ContactDensityLevel, main = false) => (
    <UiPressable key={key} testID={`add-door-${key}`} accessibilityRole="button" accessibilityLabel={`${title}、${body}`} onPress={() => onOpen(ADD_DOOR_HREFS[key])}
      style={[styles.door, key === "drafts" ? styles.draftsDoor : null]}>
      {main ? <KitGradient id="add-door-main" from={colors.macApricot} to={colors.surface2} stop={0.75} /> : null}
      {key === "drafts" ? <View style={styles.draftsTile}><UiText style={styles.emoji}>{emoji}</UiText></View> : <MacTile emoji={emoji} tone={tone} />}
      <View style={styles.doorText}>
        <UiText style={styles.doorTitle}>{title}</UiText>
        <UiText style={styles.doorBody}>{body}</UiText>
      </View>
      {density ? <DensityDots level={density} /> : null}
      <Icon name="right" size={16} color={colors.ink4} />
    </UiPressable>
  );
  const other = (key: DoorKey, emoji: string, tone: Tone, title: string, body: string) => (
    <UiPressable key={key} testID={`add-door-${key}`} accessibilityRole="button" accessibilityLabel={title} onPress={() => onOpen(ADD_DOOR_HREFS[key])} style={styles.other}>
      <MacTile emoji={emoji} tone={tone} size="sm" />
      <View style={styles.otherText}>
        <UiText style={styles.otherTitle}>{title}</UiText>
        <UiText style={styles.otherBody}>{body}</UiText>
      </View>
    </UiPressable>
  );
  return (
    <View testID="add-doors">
      {header ? <View style={styles.head}>
        <View style={styles.headText}>
          <UiText accessibilityRole="header" style={styles.title}>{t("add.doors.title")}</UiText>
          <UiText style={styles.lead}>{t("add.doors.lead")}</UiText>
        </View>
        {onClose ? <IconButton icon="x" size={34} accessibilityLabel={t("add.doors.close")} onPress={onClose} /> : null}
      </View> : <UiText style={styles.lead}>{t("add.doors.lead")}</UiText>}
      <View style={styles.doors}>
        {door("scan", "📇", "apricot", t("add.doors.scanTitle"), t("add.doors.scanBody"), 2, true)}
        {ADD_INVITE_DOOR_ENABLED ? door("invite", "🤝", "pink", t("add.doors.inviteTitle"), t("add.doors.inviteBody"), 3) : null}
        {door("manual", "✍️", "lav", t("add.doors.manualTitle"), t("add.doors.manualBody"), 1)}
      </View>
      {ADD_OTHER_DOORS_ENABLED ? (
        <>
          <UiText style={styles.group}>{t("add.doors.otherTitle")}</UiText>
          <View style={styles.others}>
            {other("contacts", "📱", "blue", t("add.doors.otherContacts"), t("add.doors.otherContactsBody"))}
            {other("linkedin", "🔗", "teal", t("add.doors.otherLinkedIn"), t("add.doors.otherLinkedInBody"))}
          </View>
        </>
      ) : null}
      {draftCount > 0 ? (
        <>
          <UiText style={styles.group}>{t("add.doors.pendingTitle")}</UiText>
          {door("drafts", "🗂️", "pink", t("add.doors.drafts", { n: draftCount }), t("add.doors.draftsBody"))}
        </>
      ) : null}
      <View style={styles.legend} testID="add-density-legend">
        {([1, 2, 3] as const).map((level) => (
          <View key={level} style={styles.legendItem} accessible accessibilityLabel={t(`add.doors.density${level}`)}>
            <DensityDots level={level} />
            <UiText style={styles.legendText}>{t(`add.doors.density${level}`)}</UiText>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: "700", color: colors.ink, lineHeight: 25.5 },
  lead: { fontSize: 11.5, fontWeight: "500", color: colors.ink3, lineHeight: 17.25 },
  doors: { marginTop: 14, gap: 8 },
  door: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface2, overflow: "hidden" },
  draftsDoor: { backgroundColor: colors.macPink },
  draftsTile: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  emoji: { fontSize: 21 },
  doorText: { flex: 1, minWidth: 0 },
  doorTitle: { fontSize: 14.5, fontWeight: "700", color: colors.ink, lineHeight: 21.75 },
  doorBody: { marginTop: 1, fontSize: 11.5, color: colors.ink2, lineHeight: 17.25 },
  group: { marginTop: 14, marginBottom: 8, fontSize: 11.5, fontWeight: "800", color: colors.ink2, lineHeight: 17.25 },
  others: { flexDirection: "row", gap: 8 },
  other: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 3, borderColor: colors.line, backgroundColor: colors.surface },
  otherText: { flex: 1, minWidth: 0 },
  otherTitle: { fontSize: 12.5, fontWeight: "700", color: colors.ink, lineHeight: 18.75 },
  otherBody: { fontSize: 10, fontWeight: "600", color: colors.ink3, lineHeight: 15 },
  legend: { marginTop: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendText: { fontSize: 11, color: colors.ink3, lineHeight: 16.5 },
}));
