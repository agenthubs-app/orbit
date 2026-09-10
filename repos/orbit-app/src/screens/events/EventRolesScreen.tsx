import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { eventAccessAssignmentPath, eventAccessRolesPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildEventRoleGrantBody,
  buildEventRoleRevokeBody,
  EVENT_ROLE_OPTIONS,
  eventRoleAssignmentToView,
  eventRoleMutationMatches,
  eventRoleMembersToView,
  validateEventRoleDraft,
  type EventDelegatedRole,
  type EventRoleMemberView
} from "../../view-models/event-roles";
import { EventRolesContent, type EventRolesContentState } from "./EventRolesContent";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "event" : value ?? "event";
}

export function EventRolesScreen() {
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id);
  const state = useApiResource<unknown>(
    eventAccessRolesPath(eventId),
    (data) => eventRoleMembersToView(data).members.length === 0
  );
  const client = useOrbitApiClient();
  const roles = state.kind === "success" || state.kind === "empty"
    ? eventRoleMembersToView(state.data)
    : eventRoleMembersToView(null);
  const [editorMode, setEditorMode] = useState<"grant" | "edit" | null>(null);
  const [subjectActorId, setSubjectActorId] = useState("");
  const [role, setRole] = useState<EventDelegatedRole>("operations");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const contentState: EventRolesContentState =
    state.kind === "failure" || state.kind === "offline"
      ? { kind: state.kind, message: state.error.message }
      : { kind: state.kind };

  function openGrant() {
    setEditorMode("grant");
    setSubjectActorId("");
    setRole("operations");
    setReason("");
    setNotice(null);
  }

  function openEdit(member: EventRoleMemberView) {
    if (member.role === "owner") return;
    setEditorMode("edit");
    setSubjectActorId(member.subjectActorId);
    setRole(member.role);
    setReason("");
    setNotice(null);
  }

  async function currentAssignment() {
    const result = await client.get<unknown>(
      eventAccessAssignmentPath(eventId, subjectActorId.trim())
    );
    if (!result.success) {
      setNotice(result.error.message);
      return null;
    }
    const assignment = eventRoleAssignmentToView(result.data);
    if (!assignment) {
      setNotice("角色版本数据暂时无法识别，请刷新后重试。");
    }
    return assignment;
  }

  async function saveRole() {
    const validation = validateEventRoleDraft(subjectActorId, reason);
    if (validation) {
      setNotice(validation);
      return;
    }
    setBusy(true);
    setNotice(null);
    const current = await currentAssignment();
    if (!current) {
      setBusy(false);
      return;
    }
    if (current.owner) {
      setNotice("活动负责人来自 Event Core，不能改为委派角色。");
      setBusy(false);
      return;
    }
    const result = await client.put<unknown>(
      eventAccessAssignmentPath(eventId, subjectActorId.trim()),
      { body: buildEventRoleGrantBody(current.revision, reason, role) }
    );
    if (
      result.success &&
      eventRoleMutationMatches(result.data, {
        role,
        state: "active",
        subjectActorId: subjectActorId.trim()
      })
    ) {
      setNotice(editorMode === "edit" ? "活动角色已更新。" : "活动角色已授予。");
      setEditorMode(null);
      state.refresh();
    } else if (result.success) {
      setNotice("服务器返回的角色数据无法确认，列表已刷新，请核对后再操作。");
      setEditorMode(null);
      state.refresh();
    } else if (result.status === 409) {
      setNotice("角色刚被其他管理员更新，列表已刷新，请确认后重试。");
      setEditorMode(null);
      state.refresh();
    } else {
      setNotice(result.error.message);
    }
    setBusy(false);
  }

  async function revokeRole() {
    const validation = validateEventRoleDraft(subjectActorId, reason);
    if (validation) {
      setNotice(validation);
      return;
    }
    setBusy(true);
    setNotice(null);
    const current = await currentAssignment();
    if (!current) {
      setBusy(false);
      return;
    }
    if (current.state !== "active") {
      setNotice("该角色已变化，列表已刷新。");
      setEditorMode(null);
      state.refresh();
      setBusy(false);
      return;
    }
    const result = await client.delete<unknown>(
      eventAccessAssignmentPath(eventId, subjectActorId.trim()),
      { body: buildEventRoleRevokeBody(current.revision, reason) }
    );
    if (
      result.success &&
      eventRoleMutationMatches(result.data, {
        state: "revoked",
        subjectActorId: subjectActorId.trim()
      })
    ) {
      setNotice("活动角色已撤销。");
      setEditorMode(null);
      state.refresh();
    } else if (result.success) {
      setNotice("服务器返回的撤销数据无法确认，列表已刷新，请核对当前角色。");
      setEditorMode(null);
      state.refresh();
    } else if (result.status === 409) {
      setNotice("角色刚被其他管理员更新，列表已刷新，请确认后重试。");
      setEditorMode(null);
      state.refresh();
    } else {
      setNotice(result.error.message);
    }
    setBusy(false);
  }

  function confirmRevoke() {
    Alert.alert("撤销活动角色", `确认撤销 ${subjectActorId} 的当前角色？`, [
      { style: "cancel", text: "取消" },
      { onPress: () => void revokeRole(), style: "destructive", text: "撤销" }
    ]);
  }

  return (
    <AppScreen
      eyebrow="活动权限"
      refreshControl={<RefreshControl onRefresh={state.refresh} refreshing={state.refreshing} tintColor={colors.accent} />}
      title={editorMode ? (editorMode === "grant" ? "授予活动角色" : "管理活动角色") : "活动角色"}
    >
      {editorMode ? (
        <View style={styles.editor}>
          <Pressable accessibilityRole="button" onPress={() => setEditorMode(null)} style={styles.backButton}>
            <Ionicons color={colors.text2} name="arrow-back" size={18} />
            <Text style={styles.backButtonText}>返回角色列表</Text>
          </Pressable>
          {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>账号 ID</Text>
            <TextInput
              accessibilityLabel="账号 ID"
              autoCapitalize="none"
              editable={editorMode === "grant" && !busy}
              onChangeText={setSubjectActorId}
              placeholder="actor:operations-01"
              placeholderTextColor={colors.text4}
              style={[styles.input, editorMode === "edit" ? styles.inputReadonly : null]}
              value={subjectActorId}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>活动角色</Text>
            <View style={styles.roleOptions}>
              {EVENT_ROLE_OPTIONS.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === option.value }}
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  style={({ pressed }) => [styles.roleOption, role === option.value ? styles.roleOptionActive : null, pressed ? styles.pressed : null]}
                >
                  <Text style={[styles.roleOptionLabel, role === option.value ? styles.roleOptionLabelActive : null]}>{option.label}</Text>
                  <Text style={styles.roleOptionDetail}>{option.description}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>操作原因</Text>
            <TextInput
              accessibilityLabel="授权、变更或撤销原因"
              editable={!busy}
              multiline
              onChangeText={setReason}
              placeholder="例如：负责现场签到和嘉宾接待"
              placeholderTextColor={colors.text4}
              style={[styles.input, styles.reasonInput]}
              value={reason}
            />
          </View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveRole()} style={({ pressed }) => [styles.saveButton, pressed ? styles.pressed : null, busy ? styles.disabled : null]}>
            <Text style={styles.saveButtonText}>{busy ? "正在保存" : editorMode === "grant" ? "授予角色" : "更新角色"}</Text>
          </Pressable>
          {editorMode === "edit" ? (
            <Pressable accessibilityRole="button" disabled={busy} onPress={confirmRevoke} style={({ pressed }) => [styles.revokeButton, pressed ? styles.pressed : null]}>
              <Text style={styles.revokeButtonText}>撤销当前角色</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <EventRolesContent notice={notice} onEdit={openEdit} onOpenGrant={openGrant} roles={roles} state={contentState} />
      )}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  backButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: spacing.sm, minHeight: 44 },
  backButtonText: { color: colors.text2, fontSize: typography.small, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  editor: {
    gap: spacing.lg,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    padding: spacing.md
  },
  fieldGroup: { gap: spacing.sm },
  input: {
    ...createControlStyles(colors).input
  },
  inputReadonly: { backgroundColor: colors.surface3, color: colors.text2 },
  label: { color: colors.text2, fontSize: typography.caption, fontWeight: "800" },
  notice: { backgroundColor: colors.amberSoft, borderRadius: radius.control, color: colors.caution, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  pressed: { opacity: 0.68 },
  reasonInput: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: "top" },
  revokeButton: {
    ...createControlStyles(colors).secondaryButton,
    backgroundColor: colors.roseSoft
  },
  revokeButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.rose
  },
  roleOption: {
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 64,
    padding: spacing.md,
    width: "100%"
  },
  roleOptionActive: { backgroundColor: colors.accentSofter, borderColor: colors.accent },
  roleOptionDetail: {
    color: colors.text3,
    ...textStyles.small
  },
  roleOptionLabel: { color: colors.ink, fontSize: typography.small, fontWeight: "800" },
  roleOptionLabelActive: { color: colors.accent },
  roleOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  saveButton: {
    ...createControlStyles(colors).primaryButton
  },
  saveButtonText: {
    ...createControlStyles(colors).primaryButtonText
  }
}));
