import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { EventSummary } from "../../view-models/events";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";

export function NoteEventPicker({ disabled = false, events, selectedIds, onToggle }: {
  disabled?: boolean;
  events: readonly EventSummary[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { styles, colors } = useStyles();
  const selected = new Set(selectedIds);
  return <View style={styles.group}>
    <View style={styles.header}><View><Text style={styles.label}>相关活动</Text><Text style={styles.hint}>可选，关联到一场真实活动</Text></View><Pressable accessibilityRole="button" accessibilityLabel="添加相关活动" disabled={disabled} onPress={() => setOpen((value) => !value)} style={styles.add}><Ionicons color={colors.accent} name={open ? "close" : "add"} size={23} /></Pressable></View>
    {selectedIds.length ? <View style={styles.chips}>{selectedIds.map((id) => <View key={id} style={styles.chip}><Ionicons color={colors.accent} name="calendar-outline" size={15} /><Text numberOfLines={1} style={styles.chipText}>{events.find((event) => event.id === id)?.title ?? id.replace(/^event:/, "")}</Text><Pressable accessibilityRole="button" accessibilityLabel={`移除相关活动 ${id}`} onPress={() => onToggle(id)}><Ionicons color={colors.text3} name="close-circle" size={18} /></Pressable></View>)}</View> : null}
    {open ? <View style={styles.panel}>{events.length ? events.slice(0, 20).map((event) => <Pressable key={event.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(event.id), disabled }} disabled={disabled} onPress={() => onToggle(event.id)} style={styles.row}><View style={styles.copy}><Text style={styles.name}>{event.title}</Text><Text numberOfLines={1} style={styles.meta}>{[event.startsAt, event.location].filter(Boolean).join(" · ")}</Text></View><Ionicons color={selected.has(event.id) ? colors.accent : colors.borderStrong} name={selected.has(event.id) ? "checkmark-circle" : "ellipse-outline"} size={23} /></Pressable>) : <Text style={styles.empty}>当前没有可关联的活动</Text>}</View> : null}
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  group: { gap: spacing.md }, header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: "700" }, hint: { color: colors.text3, fontSize: typography.caption, marginTop: 2 },
  add: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, chip: { alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.pill, flexDirection: "row", gap: 6, maxWidth: 250, minHeight: 36, paddingHorizontal: spacing.md }, chipText: { color: colors.text, flexShrink: 1, fontSize: typography.small, fontWeight: "600" },
  panel: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden", paddingHorizontal: spacing.md }, row: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, minHeight: 62, paddingVertical: spacing.sm }, copy: { flex: 1 }, name: { color: colors.ink, fontSize: typography.small, fontWeight: "700" }, meta: { color: colors.text3, fontSize: typography.caption, marginTop: 3 }, empty: { color: colors.text3, fontSize: typography.small, padding: spacing.lg, textAlign: "center" },
}));
