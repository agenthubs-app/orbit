import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActionSheetIOS,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { connectionStagePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, shadows, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  contactsPipelineToView,
  type ContactPipelineActionDueTone,
  type ContactPipelineActionItemView,
  type ContactPipelineCardView,
  type ContactPipelineStageActionView,
  type ContactPipelineStageId,
  type ContactPipelineStageView
} from "../../view-models/contact-pipeline";
import {
  contactAvatarFor,
  type ContactAvatarTone
} from "../../view-models/contacts";

type RelationshipProgressMode = "actions" | "stages";

export function ContactPipelineScreen() {
  const contactsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contacts,
    (data) =>
      contactsPipelineToView({
        connectionsPayload: { connections: [] },
        contactsPayload: data
      }).stages.every((stage) => stage.count === 0)
  );
  const connectionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.connections,
    () => false
  );
  const tasksState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.tasks, () => false);
  const refreshing =
    contactsState.refreshing || connectionsState.refreshing || tasksState.refreshing;
  const refresh = () => {
    contactsState.refresh();
    connectionsState.refresh();
    tasksState.refresh();
  };

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title="关系进展"
    >
      {contactsState.kind === "loading" || connectionsState.kind === "loading" ? (
        <LoadingState />
      ) : null}
      {contactsState.kind === "offline" || connectionsState.kind === "offline" ? (
        <ErrorState
          message={
            contactsState.kind === "offline"
              ? contactsState.error.message
              : connectionsState.kind === "offline"
                ? connectionsState.error.message
                : "请检查服务器连接。"
          }
          title="服务器连不上"
        />
      ) : null}
      {contactsState.kind === "failure" || connectionsState.kind === "failure" ? (
        <ErrorState
          message={
            contactsState.kind === "failure"
              ? contactsState.error.message
              : connectionsState.kind === "failure"
                ? connectionsState.error.message
                : "关系进展暂时无法加载。"
          }
        />
      ) : null}
      {contactsState.kind === "empty" ? (
        <EmptyState
          message="先添加联系人，再记录关系所处的阶段。"
          title="暂无关系进展"
        />
      ) : null}
      {contactsState.kind === "success" && connectionsState.kind === "success" ? (
        <PipelineContent
          connectionsPayload={connectionsState.data}
          contactsPayload={contactsState.data}
          onConnectionsRefresh={connectionsState.refresh}
          tasksLoading={tasksState.kind === "loading"}
          tasksPayload={tasksState.kind === "success" ? tasksState.data : undefined}
          tasksUnavailable={
            tasksState.kind === "failure" || tasksState.kind === "offline"
          }
        />
      ) : null}
    </AppScreen>
  );
}

function stageActionKey(action: ContactPipelineStageActionView) {
  return `${action.connectionId}:${action.nextRelationshipStage}`;
}

function PipelineContent({
  connectionsPayload,
  contactsPayload,
  onConnectionsRefresh,
  tasksLoading,
  tasksPayload,
  tasksUnavailable
}: {
  connectionsPayload: unknown;
  contactsPayload: unknown;
  onConnectionsRefresh: () => void;
  tasksLoading: boolean;
  tasksPayload: unknown;
  tasksUnavailable: boolean;
}) {
  const router = useRouter();
  const client = useOrbitApiClient();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [mode, setMode] = useState<RelationshipProgressMode>("actions");
  const [selectedStageId, setSelectedStageId] =
    useState<ContactPipelineStageId>("to_contact");
  const [pendingStageActionKey, setPendingStageActionKey] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const view = contactsPipelineToView({
    connectionsPayload,
    contactsPayload,
    tasksPayload
  });
  const selectedStage =
    view.stages.find((stage) => stage.id === selectedStageId) ?? view.stages[0];

  async function updateStage(action: ContactPipelineStageActionView) {
    setPendingStageActionKey(stageActionKey(action));
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(
        connectionStagePath(action.connectionId),
        { body: { relationshipStage: action.nextRelationshipStage } }
      );

      if (result.success) {
        setFeedback(action.successMessage);
        onConnectionsRefresh();
      } else {
        setActionError("关系进展暂时改不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("关系进展暂时改不了。请刷新后再试一次。");
    } finally {
      setPendingStageActionKey(null);
    }
  }

  function openStageActions(contact: ContactPipelineCardView) {
    const options = [...contact.stageActions.map((action) => action.label), "取消"];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: options.length - 1,
        options,
        title: `调整 ${contact.name} 的关系阶段`
      },
      (buttonIndex) => {
        const action = contact.stageActions[buttonIndex];
        if (action) void updateStage(action);
      }
    );
  }

  function selectStage(stageId: ContactPipelineStageId) {
    setSelectedStageId(stageId);
    setMode("stages");
  }

  return (
    <>
      <View accessibilityRole="tablist" style={styles.modeControl}>
        <ModeButton
          active={mode === "actions"}
          label="待处理"
          onPress={() => setMode("actions")}
        />
        <ModeButton
          active={mode === "stages"}
          label="按阶段"
          onPress={() => setMode("stages")}
        />
      </View>

      {mode === "actions" ? (
        <>
          <ActionPanel
            baseUrl={baseUrl}
            loading={tasksLoading}
            onContactPress={(contactId) =>
              router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
            }
            onViewAll={() => router.push("/followups" as Href)}
            tasks={view.actionItems.slice(0, 3)}
            unavailable={tasksUnavailable}
          />
          <StageSnapshot onSelect={selectStage} stages={view.stages} />
        </>
      ) : selectedStage ? (
        <StagePanel
          baseUrl={baseUrl}
          onContactPress={(contactId) =>
            router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
          }
          onOpenStageActions={openStageActions}
          pending={pendingStageActionKey !== null}
          selectedStage={selectedStage}
          selectedStageId={selectedStageId}
          setSelectedStageId={setSelectedStageId}
          stages={view.stages}
        />
      ) : null}

      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
    </>
  );
}

function ModeButton({ active, label, onPress }: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
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

function ActionPanel({ baseUrl, loading, onContactPress, onViewAll, tasks, unavailable }: {
  baseUrl: string;
  loading: boolean;
  onContactPress: (contactId: string) => void;
  onViewAll: () => void;
  tasks: ContactPipelineActionItemView[];
  unavailable: boolean;
}) {
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

      {loading ? <Text style={styles.emptyText}>正在读取待办...</Text> : null}
      {unavailable ? (
        <Text style={styles.emptyText}>待办暂时没有加载出来，下拉可以重试。</Text>
      ) : null}
      {!loading && !unavailable && tasks.length === 0 ? (
        <Text style={styles.emptyText}>暂时没有已安排日期的关系待办。</Text>
      ) : null}
      {tasks.map((task, index) => (
        <ActionRow
          baseUrl={baseUrl}
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

function ActionRow({ baseUrl, isFirst, onPress, task }: {
  baseUrl: string;
  isFirst: boolean;
  onPress: () => void;
  task: ContactPipelineActionItemView;
}) {
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
        baseUrl={baseUrl}
        id={task.contactId}
        imageUrl={task.imageUrl}
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
  baseUrl,
  onContactPress,
  onOpenStageActions,
  pending,
  selectedStage,
  selectedStageId,
  setSelectedStageId,
  stages
}: {
  baseUrl: string;
  onContactPress: (contactId: string) => void;
  onOpenStageActions: (contact: ContactPipelineCardView) => void;
  pending: boolean;
  selectedStage: ContactPipelineStageView;
  selectedStageId: ContactPipelineStageId;
  setSelectedStageId: (stageId: ContactPipelineStageId) => void;
  stages: ContactPipelineStageView[];
}) {
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
              onPress={() => setSelectedStageId(stage.id)}
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
        {selectedStage.contacts.length === 0 ? (
          <Text style={styles.emptyText}>这一阶段暂时没有联系人。</Text>
        ) : null}
        {selectedStage.contacts.map((contact, index) => (
          <StageContactRow
            baseUrl={baseUrl}
            contact={contact}
            isFirst={index === 0}
            key={contact.id}
            onOpenActions={() => onOpenStageActions(contact)}
            onPress={() => onContactPress(contact.id)}
            pending={pending}
          />
        ))}
      </View>
    </>
  );
}

function StageContactRow({
  baseUrl,
  contact,
  isFirst,
  onOpenActions,
  onPress,
  pending
}: {
  baseUrl: string;
  contact: ContactPipelineCardView;
  isFirst: boolean;
  onOpenActions: () => void;
  onPress: () => void;
  pending: boolean;
}) {
  return (
    <View style={[styles.stageContactRow, isFirst ? styles.actionRowFirst : null]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.stageContactMain, pressed ? styles.pressed : null]}
      >
        <ContactAvatar
          baseUrl={baseUrl}
          id={contact.id}
          imageUrl={contact.imageUrl}
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
      {contact.stageActions.length > 0 ? (
        <Pressable
          accessibilityLabel={`调整 ${contact.name} 的关系阶段`}
          accessibilityRole="button"
          disabled={pending}
          hitSlop={8}
          onPress={onOpenActions}
          style={({ pressed }) => [
            styles.moreButton,
            pending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.text3} name="ellipsis-horizontal" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;
  return `${baseUrl.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`;
}

const avatarToneStyles: Record<
  ContactAvatarTone,
  { backgroundColor: string; color: string }
> = {
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  emerald: { backgroundColor: colors.liveSoft, color: colors.live },
  rose: { backgroundColor: colors.roseSoft, color: colors.rose },
  sky: { backgroundColor: colors.skySoft, color: colors.sky },
  violet: { backgroundColor: colors.accentSoft, color: colors.accent }
};

function ContactAvatar({ baseUrl, id, imageUrl, name }: {
  baseUrl: string;
  id: string;
  imageUrl: string | undefined;
  name: string;
}) {
  const avatar = contactAvatarFor({ id, name });
  const visual = avatarToneStyles[avatar.tone];

  return (
    <View style={[styles.avatar, { backgroundColor: visual.backgroundColor }]}>
      {imageUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: assetUrl(baseUrl, imageUrl) }}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={[styles.avatarText, { color: visual.color }]}>
          {avatar.initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  actionTextBlock: { flex: 1, gap: 2, minWidth: 0 },
  actionTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "600",
    lineHeight: 19
  },
  avatar: {
    alignItems: "center",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    width: 42
  },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: { fontSize: typography.body, fontWeight: "700" },
  contactDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  contactName: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
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
  countBadgeText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  dueBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  dueBadgeOverdue: { backgroundColor: colors.roseSoft },
  dueBadgeToday: { backgroundColor: colors.accentSoft },
  dueBadgeUpcoming: { backgroundColor: colors.surface3 },
  dueBadgeText: { fontSize: 11, fontWeight: "700", lineHeight: 15 },
  dueTextOverdue: { color: colors.rose },
  dueTextToday: { color: colors.accent },
  dueTextUpcoming: { color: colors.text2 },
  emptyText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20,
    paddingVertical: spacing.xl,
    textAlign: "center"
  },
  errorText: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  feedbackText: { color: colors.live, fontSize: typography.small, fontWeight: "700", lineHeight: 20 },
  modeButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    height: 36,
    justifyContent: "center"
  },
  modeButtonActive: { backgroundColor: colors.surface, ...shadows.subtle },
  modeButtonText: { color: colors.text3, fontSize: typography.small, fontWeight: "600" },
  modeButtonTextActive: { color: colors.ink, fontWeight: "700" },
  modeControl: {
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs
  },
  moreButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  nameLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  pressed: { opacity: 0.68 },
  sectionDetail: { color: colors.text3, fontSize: typography.caption, lineHeight: 17, marginTop: 3 },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.md
  },
  sectionTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "700", lineHeight: 22 },
  snapshotCell: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 72,
    paddingHorizontal: spacing.xs
  },
  snapshotCellBorder: { borderLeftColor: colors.border, borderLeftWidth: 1 },
  snapshotGrid: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  snapshotHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  snapshotLabel: { color: colors.text3, fontSize: 11, fontWeight: "600", lineHeight: 15 },
  snapshotSection: { gap: spacing.sm },
  snapshotValue: { color: colors.ink, fontSize: typography.title, fontWeight: "700", lineHeight: 25 },
  stageContactCopy: { flex: 1, gap: 3, minWidth: 0 },
  stageContactMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.md, minWidth: 0 },
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
    gap: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm
  },
  stageTabCount: { color: colors.text4, fontSize: 11, fontWeight: "600" },
  stageTabCountSelected: { color: colors.accent },
  stageTabLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  stageTabLabelSelected: { color: colors.accent, fontWeight: "700" },
  stageTabSelected: { borderBottomColor: colors.accent },
  stageTabs: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    ...shadows.card
  },
  viewAllButton: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 48
  },
  viewAllText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" }
});
