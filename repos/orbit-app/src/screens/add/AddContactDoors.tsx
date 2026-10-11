// R12 人脈を追加 · the doors (DESIGN §2.1, app.html 「＋」sheet, b11 A): 名刺をスキャン,
// 招待コード, 手入力, その他 (連絡先 / LinkedIn), 確認待ちの下書き N件 (only when there
// are drafts, §2.9) and the density legend. One component for the page
// (`contacts/new`) and for `AddContactSheet` (R11 opens it from 人脈 「＋」).
// 招待コード opened with R15; その他 waits for R16: hidden, not greyed (§9 #4).
import { View } from "react-native";

import { Card, Icon, ListRow, MacTile } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { Caption, DensityLegend, SectionTitle, useAddColors, useAddStyles } from "./add-ui";

/** R15: the 招待コード door (`contacts/new/invite`) is open. */
export const ADD_INVITE_DOOR_ENABLED = true;
/** R16 turns this on (連絡先 / LinkedIn, `contacts/new/import`). */
export const ADD_OTHER_DOORS_ENABLED = false;

export const ADD_DOOR_HREFS = {
  scan: "/contacts/new/scan",
  invite: "/contacts/new/invite",
  manual: "/contacts/new/manual",
  contacts: "/contacts/new/import?kind=contacts",
  linkedin: "/contacts/new/import?kind=linkedin",
  drafts: "/contacts/new/drafts",
} as const;

export function AddContactDoors({ draftCount, onOpen }: { draftCount: number; onOpen: (href: string) => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const colors = useAddColors();
  const chevron = <Icon name="right" size={16} color={colors.ink3} />;
  const door = (key: keyof typeof ADD_DOOR_HREFS, emoji: string, title: string, subtitle: string, tone: "lav" | "teal" | "apricot" | "blue" | "pink") => (
    <View key={key} testID={`add-door-${key}`}>
      <ListRow title={title} subtitle={subtitle} leading={<MacTile emoji={emoji} tone={tone} size="sm" />} trailing={chevron} onPress={() => onOpen(ADD_DOOR_HREFS[key])} />
    </View>
  );
  return (
    <View style={styles.stack} testID="add-doors">
      <Caption>{t("add.doors.lead")}</Caption>
      <Card>
        {door("scan", "📇", t("add.doors.scanTitle"), t("add.doors.scanBody"), "lav")}
        {ADD_INVITE_DOOR_ENABLED ? door("invite", "🤝", t("add.doors.inviteTitle"), t("add.doors.inviteBody"), "teal") : null}
        {door("manual", "✍️", t("add.doors.manualTitle"), t("add.doors.manualBody"), "apricot")}
      </Card>
      {ADD_OTHER_DOORS_ENABLED ? (
        <>
          <SectionTitle>{t("add.doors.otherTitle")}</SectionTitle>
          <Card>
            {door("contacts", "📱", t("add.doors.otherContacts"), t("add.doors.otherContactsBody"), "blue")}
            {door("linkedin", "🔗", t("add.doors.otherLinkedIn"), t("add.doors.otherLinkedInBody"), "blue")}
          </Card>
        </>
      ) : null}
      {draftCount > 0 ? (
        <Card variant="flat">
          {door("drafts", "🗂️", t("add.doors.drafts", { n: draftCount }), t("add.doors.draftsBody"), "pink")}
        </Card>
      ) : null}
      <DensityLegend />
    </View>
  );
}
