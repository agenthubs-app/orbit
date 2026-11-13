// 主催者の連絡先（App；与 Web orbit-2026/events/HostContact.tsx 同规则、同文案）：申込済みの人だけにサーバーが返す
// （EventOverviewResponse.hostContact / EventJoinResult.hostContact）。微信 / LINE 各一行 + 复制（expo-clipboard → toast「已复制」），
// 有说明就显示说明；没有 ID 就「暂无」。审核中且有 ID 时加一句「请联系主办方（完成付款），主办方确认后会通过审核」。
import * as Clipboard from "expo-clipboard";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { canSeeHostContact, hostContactHasId } from "../../../api/compute/host-contact";
import type { EventOverviewRegistrationStatus, EventOverviewResponse } from "../../../api/contract/event-overview";
import type { HostEventContact } from "../../../api/contract/host-events";
import { BottomSheet, Button, Icon, UiPressable, UiText, useToast } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import type { JourneyT } from "./journey-model";

type Row = { key: "wechat" | "line"; label: string; value: string };
type Toast = ReturnType<typeof useToast>;

export function hostContactRows(contact: HostEventContact | null | undefined, t: JourneyT): Row[] {
  const rows: Row[] = [];
  if (contact?.wechatId) rows.push({ key: "wechat", label: t("contactWechat"), value: contact.wechatId });
  if (contact?.lineId) rows.push({ key: "line", label: t("contactLine"), value: contact.lineId });
  return rows;
}

/** 審査中で連絡先（ID）があるとき：主催者に連絡 → 確認後に承認、の一文（参加費があれば支払いにも触れる）。Web contactReviewLine と同じ。 */
export function contactReviewLine(contact: HostEventContact | null | undefined, priceYen: number | null | undefined, t: JourneyT): string | null {
  if (!hostContactHasId(contact)) return null;
  return t(priceYen && priceYen > 0 ? "reviewWaitContact" : "reviewWaitContactFree");
}

/** イベント詳細のカード：サーバーが返したとき（申込済み）だけ。取り消し直後など手元の状態が変わったら隠す（Web showHostContact と同じ）。 */
export const showHostContact = (data: EventOverviewResponse): boolean => !data.signedOut && data.hostContact !== undefined && canSeeHostContact(data.registration.status);

/** 申込完了直後に連絡先を自動で開くか：ID（微信 / LINE）があるときだけ（説明だけでは開かない）。 */
export const shouldOpenHostContact = (contact: HostEventContact | null | undefined): boolean => hostContactHasId(contact);

function IdRow({ row, t, toast }: { row: Row; t: JourneyT; toast: Toast }) {
  const { styles, colors } = useStyles();
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(row.value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("contactCopyFailed"));
    }
  };
  const label = t("contactCopyAria", { label: row.label });
  return (
    <View style={styles.row} testID={`host-contact-row-${row.key}`}>
      <UiText style={styles.label}>{row.label}</UiText>
      <UiText selectable style={styles.value}>{row.value}</UiText>
      <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={() => void copy()} style={styles.copy} testID={`host-contact-copy-${row.key}`}>
        <Icon name="copy" size={16} color={colors.ink2} />
      </UiPressable>
    </View>
  );
}

function ContactBody({ contact, t, reviewLine }: { contact: HostEventContact | null | undefined; t: JourneyT; reviewLine?: string | null | undefined }) {
  const { styles } = useStyles();
  const toast = useToast();
  const rows = hostContactRows(contact, t);
  return (
    <>
      {reviewLine ? <UiText style={[styles.sub, styles.review]} testID="host-contact-review">{reviewLine}</UiText> : null}
      {rows.length
        ? <View style={styles.rows}>{rows.map((row) => <IdRow key={row.key} row={row} t={t} toast={toast} />)}</View>
        : <UiText style={[styles.lbl, styles.none]} testID="host-contact-none">{t("contactNone")}</UiText>}
      {contact?.note ? <UiText style={[styles.sub, styles.note]} testID="host-contact-note">{contact.note}</UiText> : null}
    </>
  );
}

/** 申込済みのイベント詳細・申込完了ページの小さなカード。`status` が審査中なら連絡→承認の一文を足す。 */
export function HostContactCard({ contact, t, status, priceYen, style }: { contact: HostEventContact | null | undefined; t: JourneyT; status?: EventOverviewRegistrationStatus | null | undefined; priceYen?: number | null | undefined; style?: StyleProp<ViewStyle> }) {
  const { styles } = useStyles();
  const reviewLine = status === "pending_review" ? contactReviewLine(contact, priceYen, t) : null;
  return (
    <View style={[styles.card, style]} testID={hostContactHasId(contact) ? "host-contact" : "host-contact-empty"}>
      <UiText style={styles.title}>{t("contactTitle")}</UiText>
      <ContactBody contact={contact} t={t} reviewLine={reviewLine} />
    </View>
  );
}

/** 申込完了直後のシート（ID があるときだけ開く）。閉じたあとは完了ページのカードに同じ内容が残る。 */
export function HostContactSheet({ visible, contact, t, reviewLine, onClose }: { visible: boolean; contact: HostEventContact | null | undefined; t: JourneyT; reviewLine?: string | null | undefined; onClose: () => void }) {
  const { styles } = useStyles();
  if (!visible || !hostContactHasId(contact)) return null;
  return (
    <BottomSheet visible onClose={onClose} accessibilityLabel={t("contactTitle")}>
      <View testID="host-contact-sheet">
        <UiText accessibilityRole="header" style={styles.sheetTitle}>{t("contactTitle")}</UiText>
        <ContactBody contact={contact} t={t} reviewLine={reviewLine} />
        <View style={styles.sheetButtons}><Button block label={t("close")} variant="primary" onPress={onClose} /></View>
      </View>
    </BottomSheet>
  );
}

// Web contact.module.css：card 16 · title fs-body heavy · rows gap 6 mt 10 · row min 40 r-md surface-2 4/4/4/12 · label 64 bold · copy 32 pill surface。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 22 },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 25 },
  sheetButtons: { marginTop: 16 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  review: { marginTop: 6 },
  rows: { gap: 6, marginTop: 10 },
  row: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.md, flexDirection: "row", gap: 10, minHeight: 40, paddingLeft: 12, paddingRight: 4, paddingVertical: 4 },
  label: { color: colors.ink3, fontSize: 13, fontWeight: "700", lineHeight: 20, width: 64 },
  value: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 21, minWidth: 0 },
  copy: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, height: 32, justifyContent: "center", width: 32 },
  none: { marginTop: 8 },
  note: { marginTop: 10 },
}));
