import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { radius, spacing, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import type {
  EventAdmissionApplicationView,
  EventAdmissionDecision,
  EventAdmissionReviewListView,
  EventAdmissionReviewViewName
} from "../../view-models/event-admission-review";

export type EventAdmissionReviewContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "empty" }
  | { kind: "offline"; message: string }
  | { kind: "failure"; message: string };

function Segment({
  active,
  label,
  onPress
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        active ? styles.segmentActive : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ApplicationDetail({
  application,
  busy,
  onBack,
  onDecision
}: {
  application: EventAdmissionApplicationView;
  busy: boolean;
  onBack: () => void;
  onDecision: (decision: EventAdmissionDecision) => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.detail}>
      <Pressable
        accessibilityLabel="返回报名队列"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backToList, pressed ? styles.pressed : null]}
      >
        <Ionicons color={colors.text2} name="arrow-back" size={18} />
        <Text style={styles.backToListText}>返回队列</Text>
      </Pressable>

      <View style={styles.detailHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{application.displayName.slice(0, 1)}</Text>
        </View>
        <View style={styles.detailHeading}>
          <Text numberOfLines={2} style={styles.detailName}>{application.displayName}</Text>
          <Text style={styles.detailMeta}>提交于 {application.submittedLabel}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{application.statusLabel}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>完整报名画像</Text>
        <View style={styles.profileList}>
          {application.profileFields.map((field) => (
            <View key={field.key} style={styles.profileRow}>
              <Text style={styles.profileLabel}>{field.label}</Text>
              <Text style={styles.profileValue}>{field.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {application.interviewResponses.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>补充访谈</Text>
          {application.interviewResponses.map((response) => (
            <View key={response.responseId} style={styles.interviewRow}>
              <Text style={styles.interviewPrompt}>{response.prompt}</Text>
              <Text style={styles.interviewAnswer}>{response.answer}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {application.status === "pending_review" ? (
        <View style={styles.decisionRow}>
          <Pressable
            accessibilityLabel={`拒绝 ${application.displayName} 的报名`}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onDecision("reject")}
            style={({ pressed }) => [
              styles.decisionButton,
              styles.rejectButton,
              pressed ? styles.pressed : null,
              busy ? styles.disabled : null
            ]}
          >
            <Text style={styles.rejectButtonText}>拒绝报名</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`批准 ${application.displayName} 的报名`}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onDecision("approve")}
            style={({ pressed }) => [
              styles.decisionButton,
              styles.approveButton,
              pressed ? styles.pressed : null,
              busy ? styles.disabled : null
            ]}
          >
            <Ionicons color={colors.onAccent} name="checkmark" size={18} />
            <Text style={styles.approveButtonText}>{busy ? "处理中" : "批准报名"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.readonlyDecision}>
          <Ionicons color={colors.live} name="checkmark-circle-outline" size={18} />
          <Text style={styles.readonlyDecisionText}>
            此申请已处理{application.decidedLabel ? ` · ${application.decidedLabel}` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

export function EventAdmissionReviewContent({
  busy,
  detail,
  detailLoading,
  list,
  notice,
  onBackToList = () => undefined,
  onChangeView,
  onDecision,
  onLoadMore,
  onSelectApplicant,
  state
}: {
  busy: boolean;
  detail: EventAdmissionApplicationView | null;
  detailLoading: boolean;
  list: EventAdmissionReviewListView;
  notice?: string | null;
  onBackToList?: () => void;
  onChangeView: (view: EventAdmissionReviewViewName) => void;
  onDecision: (decision: EventAdmissionDecision) => void;
  onLoadMore: () => void;
  onSelectApplicant: (actorId: string) => void;
  state: EventAdmissionReviewContentState;
}) {
  const { colors, styles } = useStyles();
  if (detailLoading) {
    return (
      <DataCard title="正在读取完整申请">
        <Text style={styles.stateText}>正在同步报名画像与补充访谈。</Text>
      </DataCard>
    );
  }

  if (detail) {
    return (
      <View style={styles.queue}>
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        <ApplicationDetail
          application={detail}
          busy={busy}
          onBack={onBackToList}
          onDecision={onDecision}
        />
      </View>
    );
  }

  return (
    <View style={styles.queue}>
      <View accessibilityRole="tablist" style={styles.segments}>
        <Segment active={list.view === "pending"} label="待审核" onPress={() => onChangeView("pending")} />
        <Segment active={list.view === "processed"} label="已处理" onPress={() => onChangeView("processed")} />
      </View>

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {state.kind === "loading" ? (
        <DataCard title="正在读取报名队列">
          <Text style={styles.stateText}>正在确认最新申请状态。</Text>
        </DataCard>
      ) : null}
      {state.kind === "offline" || state.kind === "failure" ? (
        <ErrorState message={state.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message={list.view === "pending" ? "当前没有待审核报名。" : "还没有已处理的报名。"}
          title={list.view === "pending" ? "队列已清空" : "暂无处理记录"}
        />
      ) : null}

      {state.kind === "success" ? (
        <>
          <View style={styles.queueSummary}>
            <Text style={styles.queueTitle}>{list.view === "pending" ? "等待决定" : "处理记录"}</Text>
            <Text style={styles.queueCount}>共 {list.total} 份</Text>
          </View>
          {list.items.map((item) => (
            <Pressable
              accessibilityLabel={`查看 ${item.displayName} 的申请`}
              accessibilityRole="button"
              key={item.actorId}
              onPress={() => onSelectApplicant(item.actorId)}
              style={({ pressed }) => [styles.applicant, pressed ? styles.pressed : null]}
            >
              <View style={styles.applicantAvatar}>
                <Text style={styles.applicantAvatarText}>{item.displayName.slice(0, 1)}</Text>
              </View>
              <View style={styles.applicantCopy}>
                <Text numberOfLines={1} style={styles.applicantName}>{item.displayName}</Text>
                <Text style={styles.applicantMeta}>{item.statusLabel} · {item.submittedLabel}</Text>
              </View>
              <Text style={styles.openLabel}>查看申请</Text>
              <Ionicons color={colors.text3} name="chevron-forward" size={18} />
            </Pressable>
          ))}
          {list.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onLoadMore}
              style={({ pressed }) => [styles.loadMore, pressed ? styles.pressed : null]}
            >
              <Text style={styles.loadMoreText}>{busy ? "正在加载" : "加载更多"}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  applicant: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 72, padding: spacing.md },
  applicantAvatar: { alignItems: "center", backgroundColor: colors.accentSofter, borderRadius: radius.pill, height: 42, justifyContent: "center", width: 42 },
  applicantAvatarText: { color: colors.accent, fontSize: typography.section, fontWeight: "800" },
  applicantCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  applicantMeta: { color: colors.text3, fontSize: typography.caption, lineHeight: 17 },
  applicantName: { color: colors.ink, fontSize: typography.body, fontWeight: "800", lineHeight: 20 },
  approveButton: { backgroundColor: colors.accent },
  approveButtonText: { color: colors.onAccent, fontSize: typography.small, fontWeight: "800" },
  avatar: { alignItems: "center", backgroundColor: colors.accentSofter, borderRadius: radius.control, height: 52, justifyContent: "center", width: 52 },
  avatarText: { color: colors.accent, fontSize: typography.title, fontWeight: "800" },
  backToList: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: spacing.sm, minHeight: 44 },
  backToListText: { color: colors.text2, fontSize: typography.small, fontWeight: "700" },
  decisionButton: { alignItems: "center", borderRadius: radius.control, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.md },
  decisionRow: { flexDirection: "row", gap: spacing.md },
  detail: { gap: spacing.xl },
  detailHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  detailHeading: { flex: 1, gap: spacing.xs, minWidth: 0 },
  detailMeta: { color: colors.text3, fontSize: typography.caption },
  detailName: { color: colors.ink, fontSize: typography.title, fontWeight: "800", lineHeight: 25 },
  disabled: { opacity: 0.5 },
  interviewAnswer: { color: colors.text2, fontSize: typography.small, lineHeight: 20 },
  interviewPrompt: { color: colors.ink, fontSize: typography.small, fontWeight: "700", lineHeight: 19 },
  interviewRow: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.sm, paddingVertical: spacing.md },
  loadMore: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  loadMoreText: { color: colors.accent, fontSize: typography.small, fontWeight: "800" },
  notice: { backgroundColor: colors.liveSoft, borderRadius: radius.control, color: colors.live, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  openLabel: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  pressed: { opacity: 0.68 },
  profileLabel: { color: colors.text3, fontSize: typography.caption, fontWeight: "700", lineHeight: 17, width: 78 },
  profileList: { borderTopColor: colors.border, borderTopWidth: 1 },
  profileRow: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md },
  profileValue: { color: colors.text, flex: 1, fontSize: typography.small, lineHeight: 20 },
  queue: { gap: spacing.md },
  queueCount: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  queueSummary: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xs },
  queueTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800" },
  readonlyDecision: { alignItems: "center", backgroundColor: colors.liveSoft, borderRadius: radius.control, flexDirection: "row", gap: spacing.sm, minHeight: 48, padding: spacing.md },
  readonlyDecisionText: { color: colors.live, flex: 1, fontSize: typography.small, fontWeight: "700" },
  rejectButton: { borderColor: colors.rose, borderWidth: 1 },
  rejectButtonText: { color: colors.rose, fontSize: typography.small, fontWeight: "800" },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800" },
  segment: { alignItems: "center", borderRadius: radius.xs, flex: 1, justifyContent: "center", minHeight: 44 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.text3, fontSize: typography.small, fontWeight: "700" },
  segmentTextActive: { color: colors.ink },
  segments: { backgroundColor: colors.surface3, borderRadius: radius.control, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  stateText: { color: colors.text2, fontSize: typography.small, lineHeight: 20 },
  statusBadge: { backgroundColor: colors.amberSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusBadgeText: { color: colors.amber, fontSize: 11, fontWeight: "800" }
}));
