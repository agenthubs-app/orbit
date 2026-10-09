import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { createThemedStyles } from "../design/theme";
import { radius } from "../design/tokens";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import type { OutboxRelationshipMessage } from "../view-models/relationship-outbox";

/**
 * Sprint 0135 (offline-write design step 7): the existing amber banner and
 * one line of amber or red text under a message — no new component styles or
 * colours. Copying opens the system share sheet (it has 「拷贝」), so the text
 * can be kept without adding a native clipboard module.
 */
function formatTime(lastSyncedAt: string | null, language: string): string | null {
  return lastSyncedAt && Number.isFinite(Date.parse(lastSyncedAt))
    ? new Date(lastSyncedAt).toLocaleString(language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
}

/** 「无法连接 · 显示截至 14:02；消息会在联网后发送」 */
export function MessagesOfflineNotice({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const time = formatTime(lastSyncedAt, locale.language);
  return <Text accessibilityRole="alert" style={styles.notice}>{locale.t(time ? "inbox.offlineQueuedSnapshot" : "inbox.offlineQueuedNoSnapshot", time ? { time } : undefined)}</Text>;
}

export function copyMessageText(text: string): void {
  void Share.share({ message: text }).catch(() => undefined);
}

/** A message written offline, after the server's messages: 「待发送」, or 「未发送 · 重试 · 复制 · 放弃」 (a refused message would otherwise hold back the ones written after it). */
export function OutboxMessageBubble({ message, senderLabel, onRetry, onDiscard }: { message: OutboxRelationshipMessage; senderLabel: string; onRetry: (mutationId: string) => void; onDiscard: (mutationId: string) => void }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  return (
    <View accessibilityLabel={`${senderLabel} · ${locale.t(message.status === "pending" ? "inbox.messagePending" : "inbox.messageUnsent")}`} style={styles.bubble}>
      <Text style={styles.sender}>{senderLabel}</Text>
      <Text selectable style={styles.body}>{message.body}</Text>
      {message.status === "pending" ? (
        <Text style={styles.pending}>{locale.t("inbox.messagePending")}</Text>
      ) : (
        <View style={styles.row}>
          <Text style={styles.failed}>{locale.t("inbox.messageUnsent")}</Text>
          <Text style={styles.failed}> · </Text>
          <Pressable accessibilityRole="button" onPress={() => onRetry(message.mutationId)}><Text style={styles.link}>{locale.t("common.retry")}</Text></Pressable>
          <Text style={styles.failed}> · </Text>
          <Pressable accessibilityRole="button" onPress={() => copyMessageText(message.body)}><Text style={styles.link}>{locale.t("inbox.copyMessage")}</Text></Pressable>
          <Text style={styles.failed}> · </Text>
          <Pressable accessibilityRole="button" onPress={() => onDiscard(message.mutationId)}><Text style={styles.link}>{locale.t("inbox.discardUnsent")}</Text></Pressable>
        </View>
      )}
    </View>
  );
}

/** Inbox top line: 「N 条消息未能发送：这段关系已结束 · 复制内容 · 放弃」. */
export function UnsentEndedNotice({ messages, onDiscard }: { messages: readonly OutboxRelationshipMessage[]; onDiscard: (mutationIds: readonly string[]) => void }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  if (messages.length === 0) return null;
  return (
    <View accessibilityRole="alert" style={styles.endedRow}>
      <Text style={styles.failed}>{locale.t("inbox.unsentEnded", { count: messages.length })}</Text>
      <Text style={styles.failed}> · </Text>
      <Pressable accessibilityRole="button" onPress={() => copyMessageText(messages.map(message => message.body).join("\n\n"))}><Text style={styles.link}>{locale.t("inbox.copyContent")}</Text></Pressable>
      <Text style={styles.failed}> · </Text>
      <Pressable accessibilityRole="button" onPress={() => onDiscard(messages.map(message => message.mutationId))}><Text style={styles.link}>{locale.t("inbox.discardUnsent")}</Text></Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  notice: { color: colors.macApricotText, backgroundColor: colors.macApricot, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, lineHeight: 21 },
  bubble: { gap: 4, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  sender: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  pending: { color: colors.macApricotText, fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  endedRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  failed: { color: colors.coralText, fontSize: 13 },
  link: { color: colors.accentText, fontSize: 13, fontWeight: "600" },
}));
