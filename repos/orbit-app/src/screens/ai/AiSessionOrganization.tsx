import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { AiSessionGroupContract } from "../../api/contract/ai-sessions";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

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
  onDismiss,
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
  onDismiss: () => void;
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
  const locale = useOrbitLocale();
  const [groupName, setGroupName] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSessionTitle(item?.title ?? "");
  }, [item?.id, item?.title, visible]);

  return (
    <Modal animationType="fade" onDismiss={onDismiss} onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.root}>
        <Pressable accessibilityLabel={locale.t("aiOrganization.close")} onPress={onClose} style={styles.scrim} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{item ? locale.t("aiOrganization.organizeSession") : locale.t("aiOrganization.manageGroups")}</Text>
            <Pressable accessibilityLabel={locale.t("aiOrganization.close")} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={colors.text2} name="close" size={20} />
            </Pressable>
          </View>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {item?.source === "session" ? <View style={styles.section}>
            <Text style={styles.label}>{locale.t("aiOrganization.sessionName")}</Text>
            <View style={styles.inline}>
              <TextInput accessibilityLabel={locale.t("aiOrganization.sessionName")} editable={!busy} onChangeText={setSessionTitle} style={styles.input} value={sessionTitle} />
              <Pressable accessibilityLabel={locale.t("aiOrganization.saveSessionName")} accessibilityRole="button" disabled={busy || !sessionTitle.trim()} onPress={() => onRenameSession(item, sessionTitle)} style={styles.action}><Text style={styles.actionText}>{locale.t("common.save")}</Text></Pressable>
            </View>
            <Pressable accessibilityLabel={item.pinned ? locale.t("aiOrganization.unpinSession") : locale.t("aiOrganization.pinSession")} accessibilityRole="button" disabled={busy} onPress={() => onTogglePin(item)} style={styles.row}>
              <Ionicons color={colors.accent} name="pin-outline" size={18} /><Text style={styles.rowText}>{item.pinned ? locale.t("aiOrganization.unpin") : locale.t("aiOrganization.pin")}</Text>
            </Pressable>
            <Text style={styles.label}>{locale.t("aiOrganization.moveTo")}</Text>
            <Pressable accessibilityLabel={locale.t("aiOrganization.removeFromGroup")} accessibilityRole="button" disabled={busy || item.groupId === null} onPress={() => onMoveSession(item, null)} style={styles.row}><Text style={styles.rowText}>{locale.t("aiOrganization.ungrouped")}</Text></Pressable>
            {groups.map(group => <Pressable accessibilityLabel={locale.t("aiOrganization.moveToGroup", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy || item.groupId === group.id} key={group.id} onPress={() => onMoveSession(item, group.id)} style={styles.row}><Text style={styles.rowText}>{group.name}</Text>{item.groupId === group.id ? <Ionicons color={colors.accent} name="checkmark" size={18} /> : null}</Pressable>)}
            <Pressable accessibilityLabel={locale.t("aiOrganization.deleteSession")} accessibilityRole="button" disabled={busy} onPress={() => onDeleteSession(item)} style={styles.dangerRow}><Text style={styles.dangerText}>{locale.t("aiOrganization.deleteSession")}</Text></Pressable>
          </View> : null}
          <ScrollView contentContainerStyle={styles.section}>
            <Text style={styles.label}>{locale.t("aiOrganization.groups")}</Text>
            <View style={styles.inline}>
              <TextInput accessibilityLabel={locale.t("aiOrganization.newGroupName")} editable={!busy} onChangeText={setGroupName} placeholder={locale.t("aiOrganization.newGroupName")} style={styles.input} value={groupName} />
              <Pressable accessibilityLabel={locale.t("aiOrganization.createGroup")} accessibilityRole="button" disabled={busy || !groupName.trim()} onPress={() => { onCreateGroup(groupName); setGroupName(""); }} style={styles.action}><Text style={styles.actionText}>{locale.t("aiOrganization.create")}</Text></Pressable>
            </View>
            {groups.map(group => <View key={group.id} style={styles.groupBox}>
              <TextInput accessibilityLabel={locale.t("aiOrganization.groupName", { name: locale.t.literal(group.name) })} editable={!busy} onChangeText={value => setRenames(current => ({ ...current, [group.id]: value }))} style={styles.input} value={renames[group.id] ?? group.name} />
              <View style={styles.inline}>
                <Pressable accessibilityLabel={locale.t("aiOrganization.openGroup", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy} onPress={() => onOpenGroup(group)} style={styles.action}><Text style={styles.actionText}>{locale.t("aiOrganization.open")}</Text></Pressable>
                <Pressable accessibilityLabel={locale.t("aiOrganization.createInGroup", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy} onPress={() => onStartGroupChat(group)} style={styles.action}><Text style={styles.actionText}>{locale.t("aiOrganization.new")}</Text></Pressable>
                <Pressable accessibilityLabel={locale.t("aiOrganization.saveGroupName", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy || !(renames[group.id] ?? group.name).trim()} onPress={() => onRenameGroup(group, renames[group.id] ?? group.name)} style={styles.action}><Text style={styles.actionText}>{locale.t("aiOrganization.rename")}</Text></Pressable>
                {pendingDeleteGroupId === group.id ? <>
                  <Pressable accessibilityLabel={locale.t("aiOrganization.cancelDeleteGroup", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy} onPress={() => setPendingDeleteGroupId(null)} style={styles.action}><Text style={styles.actionText}>{locale.t("common.cancel")}</Text></Pressable>
                  <Pressable accessibilityLabel={locale.t("aiOrganization.confirmDeleteGroup", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy} onPress={() => { setPendingDeleteGroupId(null); onDeleteGroup(group); }} style={styles.dangerAction}><Text style={styles.dangerText}>{locale.t("aiOrganization.confirmDelete")}</Text></Pressable>
                </> : <Pressable accessibilityLabel={locale.t("aiOrganization.deleteGroup", { name: locale.t.literal(group.name) })} accessibilityRole="button" disabled={busy} onPress={() => setPendingDeleteGroupId(group.id)} style={styles.dangerAction}><Text style={styles.dangerText}>{locale.t("aiOrganization.delete")}</Text></Pressable>}
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
