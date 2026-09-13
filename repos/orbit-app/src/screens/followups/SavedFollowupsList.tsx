import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useId, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { EmptyState } from "../../components/EmptyState";
import { createThemedStyles } from "../../design/theme";
import { contactAvatarFor } from "../../view-models/contacts";
import { type FollowupsPageView, type SavedFollowupRow } from "../../view-models/followups-page";

export function SavedFollowupsList({ view, onToggle, updatingId, error }: {
  view: FollowupsPageView | null;
  onToggle: (row: SavedFollowupRow) => void;
  updatingId: string | null;
  error: string | null;
}) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const [mode, setMode] = useState<"open" | "completed">("open");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const groups = !view ? [] : mode === "completed" ? [{ label: "已完成", rows: view.completed }] : [
    { label: "已逾期", rows: view.open.filter(row => row.dateKey && row.dateKey < today) },
    { label: "今天", rows: view.open.filter(row => row.dateKey === today) },
    { label: "之后", rows: view.open.filter(row => row.dateKey && row.dateKey > today) },
    { label: "未安排", rows: view.open.filter(row => !row.dateKey) },
  ];
  return <View style={styles.content}>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {(["open", "completed"] as const).map(value => {
        const label = value === "open" ? "待跟进" : "已完成";
        const count = view?.[value].length;
        return <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`${label}${count === undefined ? "" : ` ${count}`}`} aria-selected={mode === value} accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={[styles.tab, mode === value && styles.activeTab]}>
          <Text style={[styles.tabText, mode === value && styles.activeText]}>{label}</Text>
          {count !== undefined ? <Text style={[styles.tabText, mode === value && styles.blueCount]}>{count}</Text> : null}
        </Pressable>;
      })}
    </View>
    {view && view[mode].length === 0 ? <EmptyState title={mode === "open" ? "暂无待跟进事项" : "暂无完成记录"} message={mode === "open" ? "已保存的人脉待办会显示在这里，建议需先复核。" : "完成跟进后，这里会留下记录。"} /> : null}
    {groups.filter(group => group.rows.length > 0).map(group => <View key={group.label}>
      <View accessibilityRole="header" accessibilityLabel={`${group.label} ${group.rows.length}`} style={styles.groupHeading}>
        <Text style={styles.groupTitle}>{group.label}</Text>
        <Text style={[styles.groupCount, group.label === "今天" && styles.blueCount, group.label === "已逾期" && styles.error]}>{group.rows.length}</Text>
      </View>
      {group.rows.map(row => <SavedFollowupItem key={row.id} row={row} onToggle={onToggle} updatingId={updatingId} />)}
    </View>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {view && view.otherTaskCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`查看其他待办 ${view.otherTaskCount}`} onPress={() => router.push("/tasks" as Href)} style={styles.otherTasks}>
      <Text style={styles.otherText}>其他待办 {view.otherTaskCount}</Text><Ionicons color={colors.text4} name="chevron-forward" size={17} />
    </Pressable> : null}
  </View>;
}

function SavedFollowupItem({ row, onToggle, updatingId }: {
  row: SavedFollowupRow;
  onToggle: (row: SavedFollowupRow) => void;
  updatingId: string | null;
}) {
  const { colors, styles } = useStyles();
  const { baseUrl } = useOrbitApiBaseUrl();
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const avatar = row.contact ? contactAvatarFor(row.contact) : null;
  const avatarId = useId().replace(/:/gu, "");
  const [failedImage, setFailedImage] = useState<string | null>(null);
  // Same identity treatment as the primary contact list; the real ID chooses
  // the tone, never the example person's position in the reference image.
  const tones = { sky: ["#7FB3FF", "#3B82F6"], emerald: ["#5EEAD4", "#0EA5E9"], amber: ["#FCD34D", "#F59E0B"], violet: ["#A78BFA", "#6366F1"], rose: ["#FDA4AF", "#F472B6"] } as const;
  const avatarColors = { sky: colors.sky, emerald: colors.live, amber: colors.amber, violet: colors.accent, rose: colors.rose };
  const completed = row.status === "completed";
  const imageUrl = row.contact?.imageUrl;
  const imageUri = imageUrl ? /^https?:\/\//iu.test(imageUrl) ? imageUrl : `${baseUrl.replace(/\/+$/u, "")}/${imageUrl.replace(/^\/+/, "")}` : null;
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={row.contact ? `查看人脉：${row.contact.name}` : row.contactId ? "查看关联人脉" : `查看待办信息：${row.title}`} onPress={() => router.push((row.contactId ? `/contacts/${encodeURIComponent(row.contactId)}` : `/tasks/${encodeURIComponent(row.id)}`) as Href)} style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}>
      <View style={[styles.avatar, { backgroundColor: avatar ? avatarColors[avatar.tone] : colors.surface2 }]}>
        {imageUri && failedImage !== imageUri ? <Image source={{ uri: imageUri }} onError={() => setFailedImage(imageUri)} resizeMode="cover" style={styles.avatarImage} /> : avatar ? <>
          <Svg accessible={false} style={StyleSheet.absoluteFill} width={40} height={40} viewBox="0 0 40 40">
            <Defs><LinearGradient id={avatarId} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0%" stopColor={tones[avatar.tone][0]} /><Stop offset="100%" stopColor={tones[avatar.tone][1]} /></LinearGradient></Defs>
            <Circle cx={20} cy={20} r={20} fill={"url(#" + avatarId + ")"} />
          </Svg>
          <Text style={styles.initial} maxFontSizeMultiplier={1.3}>{avatar.initial}</Text>
        </> : <Ionicons name="person-outline" color={colors.text3} size={20} />}
      </View>
      <View style={styles.contactBody}>
        <Text style={styles.name}>{row.contact?.name ?? (row.contactId ? "关联人脉" : "人脉待办")}</Text>
        {row.contact ? <Text style={styles.metadata}>{[row.contact.role, row.contact.organization].filter(Boolean).join(" · ")}</Text> : <Text style={styles.metadata}>{row.contactId ? "查看人脉详情" : "尚未关联人脉"}</Text>}
      </View>
      <Ionicons color={colors.text4} name="chevron-forward" size={17} />
    </Pressable>
    <View style={styles.taskRow}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${completed ? "恢复" : "完成"}：${row.title}`} aria-checked={completed} accessibilityState={{ checked: completed, disabled: updatingId !== null, busy: updatingId === row.id }} disabled={updatingId !== null} onPress={() => onToggle(row)} style={styles.checkButton}>
        <View style={[styles.checkbox, completed && styles.completedCheck]}>{completed ? <Ionicons color={colors.onAccent} name="checkmark" size={15} /> : null}</View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看待办：${row.title}`} onPress={() => router.push(`/tasks/${encodeURIComponent(row.id)}` as Href)} style={({ pressed }) => [styles.taskBody, fontScale > 1.3 && styles.taskBodyLarge, pressed && styles.pressed]}>
        <Text style={[styles.taskTitle, completed && styles.completedTitle]}>{row.title}</Text>
        <Text style={[styles.time, row.timeLabel.startsWith("今天") && !completed && styles.blueCount]}>{row.timeLabel}</Text>
      </Pressable>
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  content: { gap: 20 },
  tabs: { flexDirection: "row", gap: 22, borderBottomColor: colors.border, borderBottomWidth: 1 },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1, flexShrink: 1 },
  activeTab: { borderBottomColor: colors.ink },
  tabText: { color: colors.text3, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  activeText: { color: colors.ink, fontWeight: "800" },
  blueCount: { color: colors.accent, fontWeight: "800" },
  groupHeading: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingBottom: 4 },
  groupTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  groupCount: { color: colors.text3, fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.44 },
  row: { paddingTop: 10, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 40, height: 40 },
  initial: { color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "700" },
  contactBody: { flex: 1, minWidth: 0, gap: 1 },
  name: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  metadata: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  taskRow: { marginLeft: 52, flexDirection: "row", alignItems: "center" },
  checkButton: { width: 44, minHeight: 44, alignItems: "flex-start", justifyContent: "center" },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
  completedCheck: { backgroundColor: colors.accent, borderColor: colors.accent },
  taskBody: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  taskBodyLarge: { flexDirection: "column", alignItems: "stretch", gap: 3 },
  taskTitle: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  completedTitle: { color: colors.text3, textDecorationLine: "line-through" },
  time: { color: colors.text3, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  error: { color: colors.rose, fontSize: 13, lineHeight: 20 },
  otherTasks: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  otherText: { color: colors.accent, fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.65 },
}));
