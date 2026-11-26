// R17 イベント運営（App）的页头「⋯」与活动级操作（b13 HM-T3；同 Web HostConsole hostMenuItems / StatusBanner /
// PublishEventConfirm / CancelEventConfirm）：共同運営者 · 基本情報を編集 · 参加コードを再発行 · 申込ページを開く · アーカイブ ·
// イベントを中止（珊瑚色，只给 owner = event.cancel）；下書き / 中止 / アーカイブ 的横幅；公開と中止的确认（底部弹层）。
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { HostEventView } from "../../api/contract/host-events";
import { BottomSheet, Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { addDesignMock } from "../add/add-design-mock";
import { hostDateLong, hostDateShort, type HostT } from "./host-model";
import { Btn, Emo, useHostStyles } from "./host-ui";

export type HostMenuAction = "cohosts" | "edit" | "reissue" | "open" | "archive" | "cancel";

/** 页头「⋯」里出现哪些项（同 Web hostMenuItems；共同運営者 一直在）。 */
export function hostMenuActions(event: HostEventView): HostMenuAction[] {
  const open = event.status === "upcoming" || event.status === "live";
  const canEdit = event.myRole === "owner" || event.myRole === "manager" || event.capabilities.includes("event.edit");
  return [
    "cohosts" as const,
    ...(canEdit && event.status !== "cancelled" && event.status !== "archived" ? ["edit" as const] : []),
    ...(canEdit && open && event.participationCode ? ["reissue" as const] : []),
    ...(event.publicSlug && (open || event.status === "ended") ? ["open" as const] : []),
    ...(canEdit && event.status === "ended" ? ["archive" as const] : []),
    ...(open && event.capabilities.includes("event.cancel") ? ["cancel" as const] : []),
  ];
}
export const MENU_LABEL: Record<HostMenuAction, string> = { archive: "hmArchive", cancel: "hmCancel", cohosts: "cohostsBtn", edit: "hmEdit", open: "hmOpenPage", reissue: "hmReissue" };

/** 下書き / 中止 / アーカイブ 的横幅（b12 #440 / #442 / #444）。下書き：基本情報を編集 + 公開する（不再引导去电脑）。 */
export function StatusBanner({ event, t, busy, onEdit, onPublish, onArchive }: { event: HostEventView; t: HostT; busy: boolean; onEdit: () => void; onPublish: () => void; onArchive: (archived: boolean) => void }) {
  const { styles: h } = useHostStyles();
  const { styles } = useManageStyles();
  if (event.status === "draft") {
    return (
      <View style={[h.card, styles.banner, styles.draft]} testID="host-banner-draft">
        <View style={[h.row, { gap: 12 }]}><Emo emoji="📝" tone="apricot" /><View style={h.grow}><UiText style={h.h3}>{t("bDraft")}</UiText><UiText style={h.lbl}>{t("bDraftSub")}</UiText></View></View>
        <View style={[h.row, { gap: 8, marginTop: 12 }]}>
          <Btn label={t("editBasics")} onPress={onEdit} style={styles.half} />
          <Btn label={t("aPublish")} variant="primary" onPress={onPublish} style={[styles.half, busy ? styles.off : null]} testID="host-publish-event" />
        </View>
      </View>
    );
  }
  if (event.status === "cancelled" || event.status === "archived") {
    const cancelled = event.status === "cancelled";
    return (
      <View style={[h.card, styles.banner]} testID={`host-banner-${event.status}`}>
        <View style={[h.row, { gap: 12 }]}>
          <Emo emoji={cancelled ? "⛔" : "🗄️"} tone="lav" />
          <View style={h.grow}>
            <UiText style={h.h3}>{cancelled ? t("bCancelled", { d: hostDateShort(event.cancelledAt, t) }) : t("bArchived")}</UiText>
            <UiText style={h.lbl}>{cancelled ? t("bCancelledSub", { n: event.appliedCount }) : t("bArchivedSub")}</UiText>
          </View>
        </View>
        <Btn label={t(cancelled ? "archive" : "unarchive")} onPress={() => onArchive(cancelled)} style={[{ marginTop: 12 }, busy ? styles.off : null]} testID="host-archive-toggle" />
      </View>
    );
  }
  return null;
}

/** 公開確認（b12 #400）：开催日・定員・申込締切 三行 + 关注者通知一句。 */
export function PublishEventSheet({ event, t, language, busy, visible, onCancel, onPublish }: { event: HostEventView; t: HostT; language: string; busy: boolean; visible: boolean; onCancel: () => void; onPublish: () => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useManageStyles();
  const cap = event.capacity == null ? t("cfCapNone") : t(event.admissionMode === "review" ? "cfCapReview" : "cfCapFirst", { n: event.capacity });
  const rows: [string, string][] = [[t("cfWhen"), hostDateLong(event.startsAt, language, t)], [t("cfCapacity"), cap], [t("cfDeadline"), event.registrationClosesAt ? hostDateLong(event.registrationClosesAt, language, t) : t("cfDeadlineNone")]];
  return (
    <BottomSheet visible={visible} onClose={onCancel} accessibilityLabel={t("cfPubTitle")}>
      <View style={styles.sheet} testID="host-publish-sheet">
        <Emo emoji="📣" tone="lav" />
        <UiText style={styles.title}>{t("cfPubTitle")}</UiText>
        <UiText style={h.sub}>{event.organizerName ? t("cfPubSub", { n: event.followerCount, org: event.organizerName }) : t("cfPubSubNoOrg")}</UiText>
        <View style={styles.list}>
          {rows.map(([label, value]) => (
            <View key={label} style={[h.row, styles.setrow]}>
              <View style={styles.ok}><Icon name="check" size={16} color={colors.macTealInk} /></View>
              <UiText style={styles.rowLabel}>{label}</UiText>
              <UiText style={[h.lbl, h.grow, { textAlign: "right" }]}>{value}</UiText>
            </View>
          ))}
        </View>
        <View style={[h.row, { gap: 8 }]}>
          <Btn label={t("cancel")} onPress={onCancel} style={styles.half} height={44} />
          <Btn label={t("aPublish")} variant="primary" onPress={() => { if (!busy) onPublish(); }} style={styles.half} height={44} testID="host-publish-confirm" />
        </View>
      </View>
    </BottomSheet>
  );
}

const NOTE_MAX = 140;
const LINK = /(https?:\/\/|www\.)/iu;
/** 中止のひとこと：任意、140 字以内、不能带链接（同服务端 hostNoteText）。 */
export function noteProblem(note: string): boolean {
  const text = note.trim();
  return Boolean(text) && ([...text].length > NOTE_MAX || LINK.test(text));
}

/** イベントを中止 的确认（b12 #402）：后果四行 + 给报名者的一句话（任意）。 */
export function CancelEventSheet({ event, t, busy, visible, onKeep, onCancelEvent }: { event: HostEventView; t: HostT; busy: boolean; visible: boolean; onKeep: () => void; onCancelEvent: (note: string | null) => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useManageStyles();
  const noKeyboard = addDesignMock("no-keyboard");
  const [note, setNote] = useState("");
  const invalid = noteProblem(note);
  const lines: [Parameters<typeof Icon>[0]["name"], string][] = [
    ["bell", t("cfCancelNotify", { n: event.appliedCount, w: event.waitlistedCount })],
    ["ticket", t("cfCancelCode")],
    ["alert", t("cfCancelRefund")],
    ...(event.cohostCount > 0 ? [["users", t("cfCancelCohosts", { n: event.cohostCount })] as [Parameters<typeof Icon>[0]["name"], string]] : []),
  ];
  return (
    <BottomSheet visible={visible} onClose={onKeep} accessibilityLabel={t("cfCancelTitle", { title: event.title })}>
      <View style={styles.sheet} testID="host-cancel-sheet">
        <UiText style={styles.title}>{t("cfCancelTitle", { title: event.title })}</UiText>
        <UiText style={h.sub}>{t("cfCancelSub", { n: event.appliedCount })}</UiText>
        <View style={styles.conseq}>{lines.map(([icon, text]) => <View key={text} style={[h.row, { alignItems: "flex-start" }]}><Icon name={icon} size={16} color={colors.ink2} /><UiText style={[h.sub, h.grow]}>{text}</UiText></View>)}</View>
        <UiText style={h.lbl}>{t("cfNoteLabel")}</UiText>
        <View style={[styles.ta, invalid ? styles.taBad : null]}>
          <TextInput value={note} onChangeText={setNote} multiline placeholder={t("cfNotePh")} placeholderTextColor={colors.ink3} accessibilityLabel={t("cfNoteLabel")} showSoftInputOnFocus={!noKeyboard} style={styles.taInput} testID="host-cancel-note" />
          <UiText style={[h.lbl, { textAlign: "right" }, invalid ? { color: colors.coralText } : null]}>{t("cfNoteCounter", { n: [...note.trim()].length })}</UiText>
        </View>
        {invalid ? <UiText accessibilityRole="alert" style={[h.lbl, { color: colors.coralText }]}>{t("cfNoteInvalid")}</UiText> : null}
        <View style={[h.row, { gap: 8 }]}>
          <Btn label={t("cfKeep")} onPress={onKeep} style={styles.half} height={44} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("cfDoCancel")} accessibilityState={{ disabled: busy || invalid }} disabled={busy || invalid} onPress={() => onCancelEvent(note.trim() || null)} style={[h.btn, styles.half, styles.danger, busy || invalid ? styles.off : null]} testID="host-cancel-confirm">
            <UiText style={[h.btnText, { color: colors.onAccent }]}>{t("cfDoCancel")}</UiText>
          </UiPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const useManageStyles = createThemedStyles((colors) => StyleSheet.create({
  banner: { marginBottom: 12 },
  draft: { borderColor: colors.macApricot, borderWidth: 1.5 },
  half: { flex: 1 },
  off: { opacity: 0.45 },
  sheet: { gap: 12, paddingBottom: 12 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 28 },
  list: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 2, padding: 6 },
  setrow: { gap: 10, minHeight: 44, paddingHorizontal: 8 },
  ok: { alignItems: "center", backgroundColor: colors.macTeal, borderRadius: 12, height: 24, justifyContent: "center", width: 24 },
  rowLabel: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  conseq: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 8, padding: 12 },
  ta: { backgroundColor: colors.surface2, borderColor: "transparent", borderRadius: radius.tile, borderWidth: 1.5, padding: 12 },
  taBad: { borderColor: colors.coral },
  taInput: { color: colors.ink, fontSize: 16, lineHeight: 24, minHeight: 72, textAlignVertical: "top" },
  // Same pair as Button variant "danger" (contrast list RD-05).
  danger: { backgroundColor: colors.coralText, height: 44 },
}));
