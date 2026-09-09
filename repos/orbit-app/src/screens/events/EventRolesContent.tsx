import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { radius, spacing, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import type { EventRoleMemberView, EventRolesView } from "../../view-models/event-roles";

export type EventRolesContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "empty" }
  | { kind: "offline"; message: string }
  | { kind: "failure"; message: string };

export function EventRolesContent({
  notice,
  onEdit,
  onOpenGrant,
  roles,
  state
}: {
  notice?: string | null;
  onEdit: (member: EventRoleMemberView) => void;
  onOpenGrant: () => void;
  roles: EventRolesView;
  state: EventRolesContentState;
}) {
  const { colors, styles } = useStyles();
  if (state.kind === "loading") {
    return <DataCard title="正在读取当前角色"><Text style={styles.stateText}>正在确认负责人和有效委派。</Text></DataCard>;
  }
  if (state.kind === "offline" || state.kind === "failure") {
    return <ErrorState message={state.message} />;
  }
  if (state.kind === "empty") {
    return <EmptyState message="请先确认活动负责人数据。" title="尚无活动角色" />;
  }

  return (
    <View style={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text numberOfLines={2} style={styles.eventTitle}>{roles.title}</Text>
          <Text style={styles.memberCount}>{roles.members.length} 位有效成员</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onOpenGrant} style={({ pressed }) => [styles.grantButton, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.onAccent} name="person-add-outline" size={17} />
          <Text style={styles.grantButtonText}>授予角色</Text>
        </Pressable>
      </View>
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <View style={styles.members}>
        {roles.members.map((member) => (
          <View key={member.subjectActorId} style={styles.member}>
            <View style={[styles.roleIcon, member.role === "owner" ? styles.ownerIcon : null]}>
              <Ionicons color={member.role === "owner" ? colors.live : colors.accent} name={member.role === "owner" ? "key-outline" : "person-outline"} size={19} />
            </View>
            <View style={styles.memberCopy}>
              <View style={styles.memberTopline}>
                <Text numberOfLines={1} style={styles.actorId}>{member.subjectActorId}</Text>
                <Text style={[styles.roleLabel, member.role === "owner" ? styles.ownerLabel : null]}>{member.roleLabel}</Text>
              </View>
              <Text numberOfLines={2} style={styles.reason}>{member.reason ?? (member.role === "owner" ? "来自 Event Core" : "未记录原因")}</Text>
              <Text style={styles.revision}>版本 {member.revision}{member.assignedLabel ? ` · ${member.assignedLabel}` : ""}</Text>
            </View>
            {member.role !== "owner" ? (
              <Pressable accessibilityLabel={`管理 ${member.subjectActorId} 的角色`} accessibilityRole="button" onPress={() => onEdit(member)} style={({ pressed }) => [styles.manageButton, pressed ? styles.pressed : null]}>
                <Text style={styles.manageButtonText}>管理</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actorId: { color: colors.ink, flex: 1, fontSize: typography.small, fontWeight: "800" },
  content: { gap: spacing.md },
  eventTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800", lineHeight: 23 },
  grantButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, flexDirection: "row", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.md },
  grantButtonText: { color: colors.onAccent, fontSize: typography.caption, fontWeight: "800" },
  headingCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  manageButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 54 },
  manageButtonText: { color: colors.accent, fontSize: typography.caption, fontWeight: "800" },
  member: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 86, padding: spacing.md },
  memberCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  memberCount: { color: colors.text3, fontSize: typography.caption },
  members: { borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, overflow: "hidden" },
  memberTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  notice: { backgroundColor: colors.liveSoft, borderRadius: radius.control, color: colors.live, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  ownerIcon: { backgroundColor: colors.liveSoft },
  ownerLabel: { backgroundColor: colors.liveSoft, color: colors.live },
  pressed: { opacity: 0.68 },
  reason: { color: colors.text2, fontSize: typography.caption, lineHeight: 17 },
  revision: { color: colors.text4, fontSize: 10 },
  roleIcon: { alignItems: "center", backgroundColor: colors.accentSofter, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  roleLabel: { backgroundColor: colors.accentSofter, borderRadius: radius.pill, color: colors.accent, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  stateText: { color: colors.text2, fontSize: typography.small, lineHeight: 20 }
}));
