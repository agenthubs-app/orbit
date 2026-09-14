import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { AiSessionGroupContract } from "../../api/contract/ai-sessions";
import { createThemedStyles } from "../../design/theme";

export interface AiSessionOrganizationItem {
  groupId: string | null;
  id: string;
  pinned: boolean;
  source: "conversation" | "session";
  title: string;
}

export function AiSessionOrganizationPanel({
  busy,
  error,
  groups,
  item,
  onClose,
  onCreateGroup,
  onDeleteGroup,
  onDeleteSession,
  onMoveSession,
  onOpenGroup,
  onRenameGroup,
  onRenameSession,
  onStartGroupChat,
  onTogglePin,
  visible,
}: {
  busy: boolean;
  error: string | null;
  groups: readonly AiSessionGroupContract[];
  item: AiSessionOrganizationItem | null;
  onClose: () => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (group: AiSessionGroupContract) => void;
  onDeleteSession: (item: AiSessionOrganizationItem) => void;
  onMoveSession: (item: AiSessionOrganizationItem, groupId: string | null) => void;
  onOpenGroup: (group: AiSessionGroupContract) => void;
  onRenameGroup: (group: AiSessionGroupContract, name: string) => void;
  onRenameSession: (item: AiSessionOrganizationItem, title: string) => void;
  onStartGroupChat: (group: AiSessionGroupContract) => void;
  onTogglePin: (item: AiSessionOrganizationItem) => void;
  visible: boolean;
}) {
  const { colors, styles } = useStyles();
  const [groupName, setGroupName] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSessionTitle(item?.title ?? "");
  }, [item?.id, item?.title, visible]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="关闭会话整理" onPress={onClose} style={styles.scrim} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{item ? "整理会话" : "管理分组"}</Text>
            <Pressable accessibilityLabel="关闭会话整理" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={colors.text2} name="close" size={20} />
            </Pressable>
          </View>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {item?.source === "session" ? <View style={styles.section}>
            <Text style={styles.label}>会话名称</Text>
            <View style={styles.inline}>
              <TextInput accessibilityLabel="会话名称" editable={!busy} onChangeText={setSessionTitle} style={styles.input} value={sessionTitle} />
              <Pressable accessibilityLabel="保存会话名称" accessibilityRole="button" disabled={busy || !sessionTitle.trim()} onPress={() => onRenameSession(item, sessionTitle)} style={styles.action}><Text style={styles.actionText}>保存</Text></Pressable>
            </View>
            <Pressable accessibilityLabel={item.pinned ? "取消置顶会话" : "置顶会话"} accessibilityRole="button" disabled={busy} onPress={() => onTogglePin(item)} style={styles.row}>
              <Ionicons color={colors.accent} name="pin-outline" size={18} /><Text style={styles.rowText}>{item.pinned ? "取消置顶" : "置顶"}</Text>
            </Pressable>
            <Text style={styles.label}>移动到</Text>
            <Pressable accessibilityLabel="移出分组" accessibilityRole="button" disabled={busy || item.groupId === null} onPress={() => onMoveSession(item, null)} style={styles.row}><Text style={styles.rowText}>未分组</Text></Pressable>
            {groups.map(group => <Pressable accessibilityLabel={`移动到分组：${group.name}`} accessibilityRole="button" disabled={busy || item.groupId === group.id} key={group.id} onPress={() => onMoveSession(item, group.id)} style={styles.row}><Text style={styles.rowText}>{group.name}</Text>{item.groupId === group.id ? <Ionicons color={colors.accent} name="checkmark" size={18} /> : null}</Pressable>)}
            <Pressable accessibilityLabel="删除这个会话" accessibilityRole="button" disabled={busy} onPress={() => onDeleteSession(item)} style={styles.dangerRow}><Text style={styles.dangerText}>删除会话</Text></Pressable>
          </View> : null}
          <ScrollView contentContainerStyle={styles.section}>
            <Text style={styles.label}>分组</Text>
            <View style={styles.inline}>
              <TextInput accessibilityLabel="新分组名称" editable={!busy} onChangeText={setGroupName} placeholder="新分组名称" style={styles.input} value={groupName} />
              <Pressable accessibilityLabel="创建分组" accessibilityRole="button" disabled={busy || !groupName.trim()} onPress={() => { onCreateGroup(groupName); setGroupName(""); }} style={styles.action}><Text style={styles.actionText}>创建</Text></Pressable>
            </View>
            {groups.map(group => <View key={group.id} style={styles.groupBox}>
              <TextInput accessibilityLabel={`分组名称：${group.name}`} editable={!busy} onChangeText={value => setRenames(current => ({ ...current, [group.id]: value }))} style={styles.input} value={renames[group.id] ?? group.name} />
              <View style={styles.inline}>
                <Pressable accessibilityLabel={`打开分组：${group.name}`} accessibilityRole="button" disabled={busy} onPress={() => onOpenGroup(group)} style={styles.action}><Text style={styles.actionText}>查看</Text></Pressable>
                <Pressable accessibilityLabel={`在分组中新建：${group.name}`} accessibilityRole="button" disabled={busy} onPress={() => onStartGroupChat(group)} style={styles.action}><Text style={styles.actionText}>新建</Text></Pressable>
                <Pressable accessibilityLabel={`保存分组名称：${group.name}`} accessibilityRole="button" disabled={busy || !(renames[group.id] ?? group.name).trim()} onPress={() => onRenameGroup(group, renames[group.id] ?? group.name)} style={styles.action}><Text style={styles.actionText}>改名</Text></Pressable>
                {pendingDeleteGroupId === group.id ? <>
                  <Pressable accessibilityLabel={`取消删除分组：${group.name}`} accessibilityRole="button" disabled={busy} onPress={() => setPendingDeleteGroupId(null)} style={styles.action}><Text style={styles.actionText}>取消</Text></Pressable>
                  <Pressable accessibilityLabel={`确认删除分组：${group.name}`} accessibilityRole="button" disabled={busy} onPress={() => { setPendingDeleteGroupId(null); onDeleteGroup(group); }} style={styles.dangerAction}><Text style={styles.dangerText}>确认删组</Text></Pressable>
                </> : <Pressable accessibilityLabel={`删除分组：${group.name}`} accessibilityRole="button" disabled={busy} onPress={() => setPendingDeleteGroupId(group.id)} style={styles.dangerAction}><Text style={styles.dangerText}>删组</Text></Pressable>}
              </View>
            </View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  action: { alignItems: "center", backgroundColor: colors.accentSofter, borderRadius: 8, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  dangerAction: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  dangerRow: { borderTopColor: colors.border, borderTopWidth: 1, minHeight: 48, justifyContent: "center", marginTop: 8 },
  dangerText: { color: colors.rose, fontSize: 13, fontWeight: "700" },
  error: { color: colors.rose, paddingHorizontal: 18, paddingTop: 10 },
  groupBox: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, gap: 8, padding: 10 },
  header: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 56, paddingHorizontal: 18 },
  iconButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  inline: { alignItems: "center", flexDirection: "row", gap: 8 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, flex: 1, minHeight: 44, paddingHorizontal: 12 },
  label: { color: colors.text3, fontSize: 12, fontWeight: "700", marginTop: 4 },
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, bottom: 0, left: 0, maxHeight: "88%", position: "absolute", right: 0 },
  root: { flex: 1 },
  row: { alignItems: "center", borderBottomColor: colors.hairline, borderBottomWidth: 1, flexDirection: "row", gap: 10, justifyContent: "space-between", minHeight: 48 },
  rowText: { color: colors.ink, flex: 1, fontSize: 14 },
  scrim: { backgroundColor: "rgba(22,22,26,0.34)", flex: 1 },
  section: { gap: 10, padding: 18 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800" },
}));
