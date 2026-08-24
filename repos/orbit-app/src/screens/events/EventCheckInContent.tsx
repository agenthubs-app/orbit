import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  filterEventCheckInParticipants,
  type EventCheckInRosterView,
  type EventCheckInSegment
} from "../../view-models/event-check-in";

export type EventCheckInContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "empty" }
  | { kind: "offline"; message: string }
  | { kind: "failure"; message: string };

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, active ? styles.segmentActive : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function EventCheckInContent({
  notice,
  onCheckIn,
  onQueryChange,
  onSegmentChange,
  pendingParticipantId,
  query,
  roster,
  segment,
  state
}: {
  notice?: string | null;
  onCheckIn: (participantId: string) => void;
  onQueryChange: (query: string) => void;
  onSegmentChange: (segment: EventCheckInSegment) => void;
  pendingParticipantId: string | null;
  query: string;
  roster: EventCheckInRosterView;
  segment: EventCheckInSegment;
  state: EventCheckInContentState;
}) {
  if (state.kind === "loading") {
    return (
      <DataCard title="正在读取签到名单">
        <Text style={styles.stateText}>正在同步最新到场状态。</Text>
      </DataCard>
    );
  }
  if (state.kind === "offline" || state.kind === "failure") {
    return <ErrorState message={state.message} />;
  }
  if (state.kind === "empty") {
    return <EmptyState message="报名确认后，参会者会出现在这里。" title="签到名单还是空的" />;
  }

  const visible = filterEventCheckInParticipants(roster.participants, segment, query);
  const pendingCount = roster.totalCount - roster.checkedCount;

  return (
    <View style={styles.content}>
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryEyebrow}>到场进度</Text>
          <Text style={styles.summaryValue}>已签到 {roster.checkedCount} / {roster.totalCount}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressValue,
              { width: `${roster.totalCount ? (roster.checkedCount / roster.totalCount) * 100 : 0}%` }
            ]}
          />
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons color={colors.text3} name="search" size={18} />
        <TextInput
          accessibilityLabel="按姓名搜索参会者"
          autoCapitalize="none"
          onChangeText={onQueryChange}
          placeholder="搜索姓名或编号"
          placeholderTextColor={colors.text4}
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel="清空搜索" accessibilityRole="button" onPress={() => onQueryChange("")} style={styles.clearButton}>
            <Ionicons color={colors.text3} name="close-circle" size={20} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.segments}>
        <Segment active={segment === "all"} label={`全部 ${roster.totalCount}`} onPress={() => onSegmentChange("all")} />
        <Segment active={segment === "pending"} label={`未签到 ${pendingCount}`} onPress={() => onSegmentChange("pending")} />
        <Segment active={segment === "done"} label={`已签到 ${roster.checkedCount}`} onPress={() => onSegmentChange("done")} />
      </View>

      {visible.length === 0 ? (
        <Text accessibilityRole="summary" style={styles.noResults}>没有匹配的参会者。</Text>
      ) : (
        <View accessibilityLabel="活动签到名单" style={styles.roster}>
          {visible.map((participant) => {
            const busy = pendingParticipantId === participant.participantId;
            return (
              <View key={participant.participantId} style={styles.participant}>
                <View style={[styles.statusDot, participant.checkedIn ? styles.statusDotDone : null]} />
                <View style={styles.participantCopy}>
                  <Text numberOfLines={1} style={styles.participantName}>{participant.displayName}</Text>
                  <Text style={styles.participantMeta}>
                    #{participant.shortId} · {participant.checkedInLabel ?? participant.statusLabel}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={participant.checkedIn ? `${participant.displayName} 已签到` : `将 ${participant.displayName} 标记为已签到`}
                  accessibilityRole="button"
                  disabled={participant.checkedIn || busy}
                  onPress={() => onCheckIn(participant.participantId)}
                  style={({ pressed }) => [
                    styles.checkInButton,
                    participant.checkedIn ? styles.checkInButtonDone : null,
                    pressed ? styles.pressed : null,
                    busy ? styles.disabled : null
                  ]}
                >
                  <Ionicons color={participant.checkedIn ? colors.live : colors.onAccent} name={participant.checkedIn ? "checkmark-circle" : "checkmark"} size={17} />
                  <Text style={[styles.checkInButtonText, participant.checkedIn ? styles.checkInButtonTextDone : null]}>
                    {participant.checkedIn ? "已签到" : busy ? "记录中" : "标记已到场"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  checkInButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  checkInButtonDone: { backgroundColor: colors.liveSoft },
  checkInButtonText: { color: colors.onAccent, fontSize: typography.caption, fontWeight: "800" },
  checkInButtonTextDone: { color: colors.live },
  clearButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  content: { gap: spacing.md },
  disabled: { opacity: 0.55 },
  noResults: { color: colors.text3, fontSize: typography.small, paddingVertical: spacing.xl, textAlign: "center" },
  notice: { backgroundColor: colors.liveSoft, borderRadius: radius.control, color: colors.live, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  participant: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 72, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  participantCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  participantMeta: { color: colors.text3, fontSize: typography.caption },
  participantName: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  progressTrack: { backgroundColor: colors.surface3, borderRadius: radius.pill, height: 6, overflow: "hidden" },
  progressValue: { backgroundColor: colors.live, borderRadius: radius.pill, height: 6 },
  roster: { borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, overflow: "hidden" },
  searchBox: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", minHeight: 48, paddingLeft: spacing.md },
  searchInput: { color: colors.ink, flex: 1, fontSize: typography.body, minHeight: 46, paddingHorizontal: spacing.sm },
  segment: { alignItems: "center", borderRadius: radius.xs, flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.xs },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.text3, fontSize: 11, fontWeight: "700" },
  segmentTextActive: { color: colors.ink },
  segments: { backgroundColor: colors.surface3, borderRadius: radius.control, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  stateText: { color: colors.text2, fontSize: typography.small, lineHeight: 20 },
  statusDot: { backgroundColor: colors.amber, borderRadius: radius.pill, height: 9, width: 9 },
  statusDotDone: { backgroundColor: colors.live },
  summary: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  summaryEyebrow: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  summaryValue: { color: colors.ink, fontSize: typography.title, fontWeight: "800", marginTop: spacing.xs }
});
