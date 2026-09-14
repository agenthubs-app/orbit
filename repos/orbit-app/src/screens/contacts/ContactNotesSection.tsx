import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { OrbitApiClient } from "../../api/client";
import { radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { contactNotesToView } from "../../view-models/contact-notes";

export function ContactNotesSection({ colors, contactId, data, openRequest = 0, preview = false, isScopeCurrent }: {
  actorId: string | null;
  client: Pick<OrbitApiClient, "patch">;
  colors: OrbitColors;
  contactId: string;
  data: unknown;
  onRefresh: () => void;
  openRequest?: number;
  preview?: boolean;
  isScopeCurrent?: () => boolean;
}) {
  const router = useRouter();
  const styles = useMemo(() => createNotesStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (openRequest > 0) setExpanded(true); }, [openRequest]);
  const view = contactNotesToView(data, contactId);
  const notes = view.state === "ready" ? view.notes : [];
  const navigate = (href: string) => { if (isScopeCurrent?.() !== false) router.push(href as Href); };

  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel="历史联系人备注" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={[styles.header, preview && styles.previewHeader]}>
      <View style={styles.heading}>
        <Text style={[styles.title, preview && styles.previewTitle]}>历史联系人备注</Text>
        <Text style={styles.caption}>仅自己可见 · 只读{notes.length ? ` · ${notes.length} 条` : ""}</Text>
      </View>
      <Ionicons color={colors.text3} name={expanded ? "chevron-up" : "chevron-down"} size={18} />
    </Pressable>
    {preview && !expanded ? <View style={styles.previewList}>
      {view.state === "unavailable" ? <Text accessibilityRole="alert" style={styles.error}>历史备注暂时读取不了，请刷新后重试。</Text> : null}
      {view.state === "ready" && notes.length === 0 ? <Text style={styles.caption}>没有历史联系人备注。</Text> : null}
      {notes.slice(0, 3).map((note) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel="查看历史联系人备注" onPress={() => setExpanded(true)} style={styles.previewRow}>
        <View style={styles.previewIcon}><Ionicons color={colors.ink} name="document-text-outline" size={16} /></View>
        <Text style={styles.previewBody}>{note.body}</Text><Ionicons color={colors.text3} name="chevron-forward" size={15} />
      </Pressable>)}
    </View> : null}
    {expanded ? <View style={styles.content}>
      {view.state === "unavailable" ? <Text accessibilityRole="alert" style={styles.error}>历史备注暂时读取不了，请刷新后重试。</Text> : null}
      {view.state === "ready" && notes.length === 0 ? <Text style={styles.caption}>没有历史联系人备注。</Text> : null}
      {notes.map((note) => <View key={note.id} style={styles.note}>
        <Text selectable style={styles.body}>{note.body}</Text>
        <Text style={styles.caption}>{Number.isFinite(Date.parse(note.createdAt)) ? new Date(note.createdAt).toLocaleString("zh-CN") : note.createdAt}</Text>
      </View>)}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="查看关联笔记" onPress={() => navigate(`/notes?contactId=${encodeURIComponent(contactId)}`)} style={styles.secondary}>
          <Text style={styles.secondaryText}>查看关联笔记</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="为此人新建笔记" onPress={() => navigate(`/notes/new?contactId=${encodeURIComponent(contactId)}`)} style={styles.primary}>
          <Text style={styles.primaryText}>新建笔记</Text>
        </Pressable>
      </View>
      <Text style={styles.caption}>新笔记在独立笔记页编辑，可关联多个人脉；历史内容不会迁移或删除。</Text>
    </View> : null}
  </View>;
}

function createNotesStyles(colors: OrbitColors) {
  return StyleSheet.create({
    previewHeader: { minHeight: 56, paddingTop: 14, paddingBottom: 8 },
    previewTitle: { fontSize: 15, lineHeight: 22, fontWeight: "800" },
    previewList: { paddingBottom: 12 },
    previewRow: { minHeight: 56, paddingVertical: 11, borderBottomColor: colors.border2, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    previewIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
    previewBody: { flex: 1, minWidth: 0, fontFamily: Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif', ios: "System", default: "sans-serif" }), fontSize: 14, lineHeight: 22, color: colors.ink },
    section: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
    header: { minHeight: 68, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: spacing.md },
    heading: { flex: 1, minWidth: 0, gap: spacing.xs },
    title: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: colors.ink },
    caption: { fontSize: typography.caption, lineHeight: 18, color: colors.text3 },
    content: { paddingBottom: spacing.xl, gap: spacing.lg },
    note: { gap: spacing.sm, paddingBottom: spacing.lg, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
    body: { fontSize: typography.body, lineHeight: 23, color: colors.text, flexShrink: 1 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    secondary: { minHeight: 48, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
    secondaryText: { color: colors.ink, fontSize: typography.body, fontWeight: "600" },
    primary: { minHeight: 48, backgroundColor: colors.accent, borderRadius: radius.sm, justifyContent: "center", paddingHorizontal: spacing.lg },
    primaryText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700" },
    error: { fontSize: typography.small, lineHeight: 20, color: colors.rose },
  });
}
