import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, type OrbitColors } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useContactPipelinePages } from "../../hooks/useContactPipelinePages";
import {
  contactPipelinePageToView,
  type ContactPipelineActionDueTone,
  type ContactPipelineActionView,
  type ContactPipelineContactView,
  type ContactPipelineStageId,
  type ContactPipelineStageView
} from "../../view-models/contact-pipeline-pages";
import {
  contactAvatarFor,
  type ContactAvatarTone
} from "../../view-models/contacts";

export function ContactPipelineScreen() {
  const { colors } = useOrbitTheme();
  const [mode, setMode] = useState<"actions" | "stages">("actions");
  const [selectedStageId, setSelectedStageId] = useState<ContactPipelineStageId>("to_contact");
  const pipeline = useContactPipelinePages(selectedStageId);
  const view = pipeline.data ? contactPipelinePageToView(pipeline.data.page) : null;

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={pipeline.state.refresh}
          refreshing={pipeline.state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="关系进展"
    >
      {pipeline.state.kind === "loading" ? <LoadingState /> : null}
      {pipeline.state.kind === "offline" ? <ErrorState message={pipeline.state.error.message} title="服务器连不上" /> : null}
      {pipeline.state.kind === "failure" ? <ErrorState message={pipeline.state.error.message} /> : null}
      {pipeline.state.kind === "empty" ? <EmptyState message="先添加联系人，再记录关系所处的阶段。" title="暂无关系进展" /> : null}
      {view && pipeline.data ? (
        <PipelineContent
          actions={view.actions}
          contacts={view.contacts}
          loadingMore={pipeline.loadingMore}
          moreError={pipeline.moreError}
          hasMore={pipeline.data.page.hasMore}
          loadMore={pipeline.loadMore}
          mode={mode}
          onModeChange={setMode}
          onStageChange={setSelectedStageId}
          selectedStageId={selectedStageId}
          stages={view.stages}
        />
      ) : null}
    </AppScreen>
  );
}

function PipelineContent({
  actions,
  contacts,
  hasMore,
  loadingMore,
  loadMore,
  moreError,
  mode,
  onModeChange,
  onStageChange,
  selectedStageId,
  stages
}: {
  actions: ContactPipelineActionView[];
  contacts: ContactPipelineContactView[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  moreError: string | null;
  mode: "actions" | "stages";
  onModeChange: (mode: "actions" | "stages") => void;
  onStageChange: (stageId: ContactPipelineStageId) => void;
  selectedStageId: ContactPipelineStageId;
  stages: ContactPipelineStageView[];
}) {
  const { styles } = useStyles();
  const router = useRouter();
  const selectedStage = stages.find(stage => stage.id === selectedStageId) ?? stages[0];

  return (
    <>
      <View accessibilityRole="tablist" style={styles.modeControl}>
        <ModeButton
          active={mode === "actions"}
          label="待处理"
          onPress={() => onModeChange("actions")}
        />
        <ModeButton
          active={mode === "stages"}
          label="按阶段"
          onPress={() => onModeChange("stages")}
        />
      </View>

      {mode === "actions" ? (
        <>
          <ActionPanel
            onContactPress={(contactId) =>
              router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
            }
            onViewAll={() => router.push("/tasks?scope=relationship" as Href)}
            tasks={actions}
          />
          <StageSnapshot onSelect={(stageId) => { onStageChange(stageId); onModeChange("stages"); }} stages={stages} />
        </>
      ) : selectedStage ? (
        <StagePanel
          contacts={contacts}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMore={loadMore}
          moreError={moreError}
          onContactPress={(contactId) =>
            router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
          }
          selectedStageId={selectedStageId}
          onStageChange={onStageChange}
          stages={stages}
        />
      ) : null}

    </>
  );
}

function ModeButton({ active, label, onPress }: {
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
        styles.modeButton,
        active ? styles.modeButtonActive : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionPanel({ onContactPress, onViewAll, tasks }: {
  onContactPress: (contactId: string) => void;
  onViewAll: () => void;
  tasks: ContactPipelineActionView[];
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.surface}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>今天需要处理</Text>
          <Text style={styles.sectionDetail}>按时间顺序，只看已经安排的事项</Text>
        </View>
        {tasks.length > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{tasks.length}</Text>
          </View>
        ) : null}
      </View>

      {tasks.length === 0 ? (
        <Text style={styles.emptyText}>暂时没有已安排日期的关系待办。</Text>
      ) : null}
      {tasks.map((task, index) => (
        <ActionRow
          isFirst={index === 0}
          key={task.taskId}
          onPress={() => onContactPress(task.contactId)}
          task={task}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={onViewAll}
        style={({ pressed }) => [styles.viewAllButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.viewAllText}>查看全部待办</Text>
        <Ionicons color={colors.accent} name="chevron-forward" size={17} />
      </Pressable>
    </View>
  );
}

function ActionRow({ isFirst, onPress, task }: {
  isFirst: boolean;
  onPress: () => void;
  task: ContactPipelineActionView;
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityLabel={`${task.contactName}，${task.title}，${task.dueLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        isFirst ? styles.actionRowFirst : null,
        pressed ? styles.pressed : null
      ]}
    >
      <ContactAvatar
        id={task.contactId}
        name={task.contactName}
      />
      <View style={styles.actionTextBlock}>
        <View style={styles.nameLine}>
          <Text numberOfLines={1} style={styles.contactName}>
            {task.contactName}
          </Text>
          <DueBadge label={task.dueLabel} tone={task.dueTone} />
        </View>
        <Text numberOfLines={1} style={styles.contactDetail}>
          {task.detail}
        </Text>
        <Text numberOfLines={1} style={styles.actionTitle}>
          {task.title}
        </Text>
      </View>
    </Pressable>
  );
}

function DueBadge({ label, tone }: {
  label: string;
  tone: ContactPipelineActionDueTone;
}) {
  const { styles } = useStyles();
  return (
    <View
      style={[
        styles.dueBadge,
        tone === "overdue"
          ? styles.dueBadgeOverdue
          : tone === "today"
            ? styles.dueBadgeToday
            : styles.dueBadgeUpcoming
      ]}
    >
      <Text
        style={[
          styles.dueBadgeText,
          tone === "overdue"
            ? styles.dueTextOverdue
            : tone === "today"
              ? styles.dueTextToday
              : styles.dueTextUpcoming
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function StageSnapshot({ onSelect, stages }: {
  onSelect: (stageId: ContactPipelineStageId) => void;
  stages: ContactPipelineStageView[];
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.snapshotSection}>
      <View style={styles.snapshotHeader}>
        <Text style={styles.sectionTitle}>关系阶段</Text>
        <Text style={styles.sectionDetail}>查看联系人分布</Text>
      </View>
      <View style={styles.snapshotGrid}>
        {stages.map((stage, index) => (
          <Pressable
            accessibilityLabel={`${stage.label}，${stage.count} 人`}
            accessibilityRole="button"
            key={stage.id}
            onPress={() => onSelect(stage.id)}
            style={({ pressed }) => [
              styles.snapshotCell,
              index > 0 ? styles.snapshotCellBorder : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.snapshotValue}>{stage.count}</Text>
            <Text numberOfLines={1} style={styles.snapshotLabel}>
              {stage.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function StagePanel({
  contacts,
  hasMore,
  loadingMore,
  loadMore,
  moreError,
  onContactPress,
  selectedStageId,
  onStageChange,
  stages
}: {
  contacts: ContactPipelineContactView[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  moreError: string | null;
  onContactPress: (contactId: string) => void;
  selectedStageId: ContactPipelineStageId;
  onStageChange: (stageId: ContactPipelineStageId) => void;
  stages: ContactPipelineStageView[];
}) {
  const selectedStage = stages.find(stage => stage.id === selectedStageId) ?? stages[0];
  const { styles } = useStyles();
  if (!selectedStage) return null;
  return (
    <>
      <View style={styles.stageTabs}>
        {stages.map((stage) => {
          const selected = stage.id === selectedStageId;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={stage.id}
              onPress={() => onStageChange(stage.id)}
              style={({ pressed }) => [
                styles.stageTab,
                selected ? styles.stageTabSelected : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.stageTabLabel,
                  selected ? styles.stageTabLabelSelected : null
                ]}
              >
                {stage.label}
              </Text>
              <Text
                style={[
                  styles.stageTabCount,
                  selected ? styles.stageTabCountSelected : null
                ]}
              >
                {stage.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.surface}>
        <View style={styles.sectionHeader}>
          <View style={styles.stageHeadingCopy}>
            <Text style={styles.sectionTitle}>{selectedStage.label}</Text>
            <Text style={styles.sectionDetail}>{selectedStage.detail}</Text>
          </View>
        </View>
        {selectedStage.count === 0 ? (
          <Text style={styles.emptyText}>这一阶段暂时没有联系人。</Text>
        ) : null}
        {contacts.map((contact, index) => (
          <StageContactRow
            contact={contact}
            isFirst={index === 0}
            key={contact.id}
            onPress={() => onContactPress(contact.id)}
          />
        ))}
        {moreError ? <Text style={styles.errorText}>{moreError}</Text> : null}
        {hasMore || moreError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={moreError ? "重试加载更多联系人" : loadingMore ? "正在加载更多联系人" : "加载更多联系人"}
            disabled={loadingMore}
            onPress={loadMore}
            style={({ pressed }) => [styles.moreButton, pressed ? styles.pressed : null, loadingMore ? styles.disabled : null]}
          >
            <Text style={styles.sectionDetail}>{loadingMore ? "正在加载…" : moreError ? "重试加载更多" : "加载更多"}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

function StageContactRow({
  contact,
  isFirst,
  onPress
}: {
  contact: ContactPipelineContactView;
  isFirst: boolean;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={[styles.stageContactRow, isFirst ? styles.actionRowFirst : null]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.stageContactMain, pressed ? styles.pressed : null]}
      >
        <ContactAvatar
          id={contact.id}
          name={contact.name}
        />
        <View style={styles.stageContactCopy}>
          <Text numberOfLines={1} style={styles.contactName}>
            {contact.name}
          </Text>
          <Text numberOfLines={1} style={styles.contactDetail}>
            {contact.detail}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const avatarToneStyles = (colors: OrbitColors): Record<
  ContactAvatarTone,
  { backgroundColor: string; color: string }
> => ({
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  emerald: { backgroundColor: colors.liveSoft, color: colors.live },
  rose: { backgroundColor: colors.roseSoft, color: colors.rose },
  sky: { backgroundColor: colors.skySoft, color: colors.sky },
  violet: { backgroundColor: colors.accentSoft, color: colors.accent }
});

function ContactAvatar({ id, name }: {
  id: string;
  name: string;
}) {
  const { colors, styles } = useStyles();
  const avatar = contactAvatarFor({ id, name });
  const visual = avatarToneStyles(colors)[avatar.tone];

  return (
    <View style={[styles.avatar, { backgroundColor: visual.backgroundColor }]}>
      <Text style={[styles.avatarText, { color: visual.color }]}>
        {avatar.initial}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 76,
    paddingVertical: spacing.md
  },
  actionRowFirst: { borderTopWidth: 0 },
  actionTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  actionTitle: {
    ...textStyles.body,
    color: colors.text,
    fontWeight: "600"
  },
  avatar: {
    alignItems: "center",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    width: 42
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarText: {
    ...textStyles.body,
    fontWeight: "600"
  },
  contactDetail: {
    ...textStyles.caption,
    color: colors.text3
  },
  contactName: {
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  countBadge: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: "center",
    minWidth: 28,
    paddingHorizontal: spacing.sm
  },
  countBadgeText: {
    ...textStyles.small,
    color: colors.accent,
    fontWeight: "600"
  },
  disabled: { opacity: 0.45 },
  dueBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  dueBadgeOverdue: { backgroundColor: colors.roseSoft },
  dueBadgeToday: { backgroundColor: colors.accentSoft },
  dueBadgeUpcoming: { backgroundColor: colors.surface3 },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  dueTextOverdue: { color: colors.rose },
  dueTextToday: { color: colors.accent },
  dueTextUpcoming: { color: colors.text2 },
  emptyText: {
    ...textStyles.small,
    color: colors.text3,
    paddingVertical: spacing.xl,
    textAlign: "center"
  },
  errorText: {
    ...textStyles.small,
    color: colors.rose
  },
  feedbackText: {
    ...textStyles.small,
    color: colors.live,
    fontWeight: "600"
  },
  modeButton: {
    ...createControlStyles(colors).chip,
    backgroundColor: "transparent",
    flex: 1
  },
  modeButtonActive: { ...createControlStyles(colors).selectedChip },
  modeButtonText: { ...createControlStyles(colors).chipText },
  modeButtonTextActive: { ...createControlStyles(colors).selectedChipText },
  modeControl: {
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs
  },
  moreButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  nameLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  pressed: { opacity: 0.68 },
  sectionDetail: {
    ...textStyles.caption,
    color: colors.text3,
    marginTop: 3
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.md
  },
  sectionTitle: {
    ...textStyles.section,
    color: colors.ink
  },
  snapshotCell: {
    alignItems: "center",
    flex: 1,
    minWidth: 64,
    justifyContent: "center",
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  snapshotCellBorder: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1
  },
  snapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  snapshotHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  snapshotLabel: {
    ...textStyles.caption,
    color: colors.text3,
    textAlign: "center"
  },
  snapshotSection: { gap: spacing.sm },
  snapshotValue: {
    ...textStyles.title,
    color: colors.ink
  },
  stageContactCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  stageContactMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0
  },
  stageContactRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 68,
    paddingVertical: spacing.sm
  },
  stageHeadingCopy: { flex: 1 },
  stageTab: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flex: 1,
    minWidth: 76,
    gap: spacing.xxs,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.sm
  },
  stageTabCount: {
    ...textStyles.caption,
    color: colors.text3
  },
  stageTabCountSelected: { color: colors.accent },
  stageTabLabel: {
    ...textStyles.caption,
    color: colors.text3,
    textAlign: "center"
  },
  stageTabLabelSelected: {
    color: colors.accent,
    fontWeight: "700"
  },
  stageTabSelected: { borderBottomColor: colors.accent },
  stageTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  surface: { gap: spacing.xs },
  viewAllButton: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 48
  },
  viewAllText: {
    ...textStyles.small,
    color: colors.accent,
    fontWeight: "600"
  }
}));
