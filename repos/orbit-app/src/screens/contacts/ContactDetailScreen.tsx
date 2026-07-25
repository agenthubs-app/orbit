import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import {
  contactDetailPath,
  ORBIT_API_ENDPOINTS,
  relationshipValueAnalysisPath,
  relationshipValueRecomputePath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  useApiResource,
  type ApiResourceState
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildContactDetailMetadataRequest,
  buildContactDetailNoteRequest,
  contactDetailHeroToView,
  contactDetailToSummary,
  type ContactAvatarTone,
  type ContactDetailMetadataDraft,
  type ContactDetailStatusActionView,
  type ContactDetailSummary
} from "../../view-models/contacts";
import {
  relationshipConnectionIdForContact,
  relationshipValueStateIsEmpty,
  relationshipValueToView
} from "../../view-models/relationship-value";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "contact";
  }

  return value ?? "contact";
}

function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`;
}

export function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = firstParam(id);
  const client = useOrbitApiClient();
  const state = useApiResource<unknown>(
    contactDetailPath(contactId),
    () => false
  );
  const connectionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.connections,
    () => false
  );
  const connectionId =
    relationshipConnectionIdForContact(
      state.kind === "success" || state.kind === "empty" ? state.data : null,
      connectionsState.kind === "success" || connectionsState.kind === "empty"
        ? connectionsState.data
        : null,
      contactId
    ) ?? contactId;
  const relationshipValueState = useApiResource<unknown>(
    relationshipValueAnalysisPath(connectionId),
    relationshipValueStateIsEmpty
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [metadataDraft, setMetadataDraft] = useState<ContactDetailMetadataDraft>({
    channel: "手动记录",
    occurredAt: "",
    summary: "",
    tagsText: ""
  });
  const [metadataPending, setMetadataPending] = useState(false);
  const [notePending, setNotePending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [relationshipValuePending, setRelationshipValuePending] = useState(false);
  const [relationshipValueOverride, setRelationshipValueOverride] =
    useState<unknown | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshing =
    state.refreshing ||
    connectionsState.refreshing ||
    relationshipValueState.refreshing ||
    relationshipValuePending;

  function refreshAll() {
    setRelationshipValueOverride(null);
    state.refresh();
    connectionsState.refresh();
    relationshipValueState.refresh();
  }

  async function recomputeRelationshipValue() {
    setRelationshipValuePending(true);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.post<unknown>(relationshipValueRecomputePath(), {
        body: { connectionId }
      });

      if (result.success) {
        setRelationshipValueOverride(result.data);
        setFeedback("已重新计算。未创建任务，也没有发送消息。");
      } else {
        setActionError("关系价值暂时算不了。先刷新来源证据再试。");
      }
    } catch {
      setActionError("关系价值暂时算不了。先刷新来源证据再试。");
    } finally {
      setRelationshipValuePending(false);
    }
  }

  async function updateStatus(action: ContactDetailStatusActionView) {
    setStatusPending(true);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), {
        body: { status: action.nextStatus }
      });

      if (result.success) {
        setFeedback(action.successMessage);
        refreshAll();
      } else {
        setActionError("当前状态暂时改不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("当前状态暂时改不了。请刷新后再试一次。");
    } finally {
      setStatusPending(false);
    }
  }

  async function saveNote() {
    const request = buildContactDetailNoteRequest(noteDraft);

    if (!request.success) {
      setActionError(request.error);
      setFeedback(null);
      return;
    }

    setNotePending(true);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), {
        body: request.request.body
      });

      if (result.success) {
        setFeedback(request.successMessage);
        setNoteDraft("");
        refreshAll();
      } else {
        setActionError("这条记录暂时保存不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("这条记录暂时保存不了。请刷新后再试一次。");
    } finally {
      setNotePending(false);
    }
  }

  function onChangeMetadataDraft(patch: Partial<ContactDetailMetadataDraft>) {
    setMetadataDraft((current) => ({
      ...current,
      ...patch
    }));
  }

  async function saveMetadata() {
    const request = buildContactDetailMetadataRequest(metadataDraft);

    if (!request.success) {
      setActionError(request.error);
      setFeedback(null);
      return;
    }

    setMetadataPending(true);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), {
        body: request.request.body
      });

      if (result.success) {
        setFeedback(request.successMessage);
        setMetadataDraft({
          channel: "手动记录",
          occurredAt: "",
          summary: "",
          tagsText: ""
        });
        refreshAll();
      } else {
        setActionError("标签或互动暂时保存不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("标签或互动暂时保存不了。请刷新后再试一次。");
    } finally {
      setMetadataPending(false);
    }
  }

  return (
    <AppScreen
      eyebrow="联系人详情"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title="联系人"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <ContactDetailCard
          data={state.data}
          metadataDraft={metadataDraft}
          metadataPending={metadataPending}
          noteDraft={noteDraft}
          notePending={notePending}
          onChangeMetadataDraft={onChangeMetadataDraft}
          onChangeNoteDraft={setNoteDraft}
          onSaveMetadata={saveMetadata}
          onSaveNote={saveNote}
          onRecompute={recomputeRelationshipValue}
          onStatusAction={updateStatus}
          relationshipValueOverride={relationshipValueOverride}
          relationshipValuePending={relationshipValuePending}
          relationshipValueState={relationshipValueState}
          statusPending={statusPending}
        />
      ) : null}
    </AppScreen>
  );
}

function ContactDetailCard({
  data,
  metadataDraft,
  metadataPending,
  noteDraft,
  notePending,
  onChangeMetadataDraft,
  onChangeNoteDraft,
  onSaveMetadata,
  onSaveNote,
  onRecompute,
  onStatusAction,
  relationshipValueOverride,
  relationshipValuePending,
  relationshipValueState,
  statusPending
}: {
  data: unknown;
  metadataDraft: ContactDetailMetadataDraft;
  metadataPending: boolean;
  noteDraft: string;
  notePending: boolean;
  onChangeMetadataDraft: (patch: Partial<ContactDetailMetadataDraft>) => void;
  onChangeNoteDraft: (value: string) => void;
  onSaveMetadata: () => void;
  onSaveNote: () => void;
  onRecompute: () => void;
  onStatusAction: (action: ContactDetailStatusActionView) => void;
  relationshipValueOverride: unknown | null;
  relationshipValuePending: boolean;
  relationshipValueState: ApiResourceState<unknown>;
  statusPending: boolean;
}) {
  const router = useRouter();
  const { baseUrl } = useOrbitApiBaseUrl();
  const contact = contactDetailToSummary(data);
  const hero = contactDetailHeroToView(contact);
  const toneStyle = avatarToneStyles[hero.avatar.tone];
  const publicTags = [
    ...contact.publicOffering,
    ...contact.publicSeeking,
    ...contact.publicTopics
  ];
  const inboxHref =
    `/inbox?contactId=${encodeURIComponent(contact.id)}&participantName=${encodeURIComponent(
      contact.name
    )}&organization=${encodeURIComponent(contact.organization)}` as Href;
  const statusCardDetail = "关系阶段和处理动作";

  return (
    <>
      <View style={styles.contactHero}>
        <View style={styles.contactHeroHeader}>
          <View
            style={[
              styles.heroAvatar,
              { backgroundColor: toneStyle.backgroundColor }
            ]}
          >
            {hero.avatar.imageUrl ? (
              <Image
                resizeMode="cover"
                source={{ uri: assetUrl(baseUrl, hero.avatar.imageUrl) }}
                style={styles.heroAvatarImage}
              />
            ) : (
              <Text style={[styles.heroAvatarText, { color: toneStyle.color }]}>
                {hero.avatar.initial}
              </Text>
            )}
          </View>
          <View style={styles.contactHeroTitleBlock}>
            <Text numberOfLines={2} style={styles.contactHeroName}>
              {hero.name}
            </Text>
            <Text numberOfLines={2} style={styles.contactHeroDetail}>
              {hero.detailLine}
            </Text>
          </View>
        </View>
        <Text style={styles.contactHeroRelationship}>{hero.relationship}</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.statusPill}>{hero.status}</Text>
          {hero.valueScoreLabel ? (
            <Text style={styles.scorePill}>{hero.valueScoreLabel}</Text>
          ) : null}
        </View>
        {contact.valueLabels.length > 0 ? (
          <View style={styles.tagsRow}>
            {contact.valueLabels.map((label) => (
              <Text key={label} style={styles.tagText}>
                {label}
              </Text>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(inboxHref)}
          style={({ pressed }) => [
            styles.primaryHeroButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="mail-outline" size={17} />
          <Text style={styles.primaryHeroButtonText}>起草跟进</Text>
        </Pressable>
      </View>
      {contact.publicBio || publicTags.length > 0 || contact.publicPrompts.length > 0 ? (
        <DataCard detail="别人会先看到这段介绍" title="公开资料">
          {contact.publicBio ? (
            <Text style={styles.bodyText}>{contact.publicBio}</Text>
          ) : null}
          {publicTags.length > 0 ? <TagList items={publicTags} /> : null}
          {contact.publicPrompts.length > 0 ? (
            <PromptList prompts={contact.publicPrompts} />
          ) : null}
        </DataCard>
      ) : null}
      {contact.sourceLabel || contact.evidenceExcerpts.length > 0 ? (
        <DataCard detail={contact.sourceLabel} title="来源证据">
          <EvidenceList contact={contact} />
        </DataCard>
      ) : null}
      <RelationshipValueCard
        onRecompute={onRecompute}
        overrideData={relationshipValueOverride}
        pending={relationshipValuePending}
        state={relationshipValueState}
      />
      <DataCard detail={statusCardDetail} title="当前状态">
        <Text style={styles.bodyText}>{contact.status}</Text>
        {contact.statusAction ? (
          <Pressable
            accessibilityRole="button"
            disabled={statusPending}
            onPress={() => onStatusAction(contact.statusAction!)}
            style={({ pressed }) => [
              styles.statusButton,
              statusPending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="swap-horizontal-outline" size={16} />
            <Text style={styles.statusButtonText}>
              {statusPending
                ? contact.statusAction.pendingLabel
                : contact.statusAction.label}
            </Text>
          </Pressable>
        ) : null}
        {contact.archiveAction ? (
          <Pressable
            accessibilityRole="button"
            disabled={statusPending}
            onPress={() => onStatusAction(contact.archiveAction!)}
            style={({ pressed }) => [
              styles.archiveButton,
              statusPending ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.rose} name="archive-outline" size={16} />
            <Text style={styles.archiveButtonText}>
              {statusPending
                ? contact.archiveAction.pendingLabel
                : contact.archiveAction.label}
            </Text>
          </Pressable>
        ) : null}
      </DataCard>
      <DataCard detail="标签和最近互动一起复核" title="编辑标签和互动">
        {contact.detailTags.length > 0 ? <TagList items={contact.detailTags} /> : null}
        <View style={styles.metadataStack}>
          <Text style={styles.inputLabel}>标签</Text>
          <TextInput
            onChangeText={(value) => onChangeMetadataDraft({ tagsText: value })}
            placeholder="AI, 关西渠道, 待跟进"
            placeholderTextColor={colors.text4}
            style={styles.metadataInput}
            value={metadataDraft.tagsText}
          />
          <View style={styles.metadataRow}>
            <View style={styles.metadataColumn}>
              <Text style={styles.inputLabel}>时间</Text>
              <TextInput
                onChangeText={(value) => onChangeMetadataDraft({ occurredAt: value })}
                placeholder="今天下午或 2026-07-24 09:30"
                placeholderTextColor={colors.text4}
                style={styles.metadataInput}
                value={metadataDraft.occurredAt}
              />
            </View>
            <View style={styles.metadataColumn}>
              <Text style={styles.inputLabel}>渠道</Text>
              <TextInput
                onChangeText={(value) => onChangeMetadataDraft({ channel: value })}
                placeholder="微信、邮件、活动现场"
                placeholderTextColor={colors.text4}
                style={styles.metadataInput}
                value={metadataDraft.channel}
              />
            </View>
          </View>
          <Text style={styles.inputLabel}>摘要</Text>
          <TextInput
            multiline
            onChangeText={(value) => onChangeMetadataDraft({ summary: value })}
            placeholder="刚确认了什么，下一步卡在哪里"
            placeholderTextColor={colors.text4}
            style={styles.noteInput}
            textAlignVertical="top"
            value={metadataDraft.summary}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={metadataPending}
          onPress={onSaveMetadata}
          style={({ pressed }) => [
            styles.statusButton,
            metadataPending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="pricetags-outline" size={16} />
          <Text style={styles.statusButtonText}>
            {metadataPending ? "保存中" : "保存标签和互动"}
          </Text>
        </Pressable>
      </DataCard>
      <DataCard detail="只保存到这条关系记录" title="添加记录">
        <TextInput
          multiline
          onChangeText={onChangeNoteDraft}
          placeholder="记下刚聊到的事、承诺或下次要带的资料"
          placeholderTextColor={colors.text4}
          style={styles.noteInput}
          textAlignVertical="top"
          value={noteDraft}
        />
        <Pressable
          accessibilityRole="button"
          disabled={notePending}
          onPress={onSaveNote}
          style={({ pressed }) => [
            styles.noteButton,
            notePending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="document-text-outline" size={16} />
          <Text style={styles.noteButtonText}>
            {notePending ? "保存中" : "保存记录"}
          </Text>
        </Pressable>
      </DataCard>
      {contact.noteSummaries.length > 0 ? (
        <DataCard detail={contact.lastInteractionAt} title="最近记录">
          {contact.noteSummaries.map((note) => (
            <Text key={note} style={styles.bodyText}>
              {note}
            </Text>
          ))}
        </DataCard>
      ) : null}
      <DataCard detail={contact.lastInteractionAt} title="下一步">
        <Text style={styles.bodyText}>{contact.nextAction}</Text>
      </DataCard>
    </>
  );
}

const avatarToneStyles: Record<
  ContactAvatarTone,
  { backgroundColor: string; color: string }
> = {
  amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  emerald: { backgroundColor: colors.liveSoft, color: colors.live },
  rose: { backgroundColor: colors.roseSoft, color: colors.rose },
  sky: { backgroundColor: colors.skySoft, color: colors.sky },
  violet: { backgroundColor: colors.accentSofter, color: colors.accent }
};

function TagList({ items }: { items: string[] }) {
  return (
    <View style={styles.tagsRow}>
      {items.map((label) => (
        <Text key={label} style={styles.tagText}>
          {label}
        </Text>
      ))}
    </View>
  );
}

function PromptList({ prompts }: { prompts: string[] }) {
  return (
    <View style={styles.promptStack}>
      {prompts.map((prompt) => (
        <Text key={prompt} style={styles.promptText}>
          {prompt}
        </Text>
      ))}
    </View>
  );
}

function EvidenceList({ contact }: { contact: ContactDetailSummary }) {
  if (contact.evidenceExcerpts.length === 0) {
    return <Text style={styles.bodyText}>这条关系有来源记录。</Text>;
  }

  return (
    <View style={styles.promptStack}>
      {contact.evidenceExcerpts.map((excerpt) => (
        <Text key={excerpt} style={styles.bodyText}>
          {excerpt}
        </Text>
      ))}
    </View>
  );
}

function RelationshipValueCard({
  onRecompute,
  overrideData,
  pending,
  state
}: {
  onRecompute: () => void;
  overrideData: unknown | null;
  pending: boolean;
  state: ApiResourceState<unknown>;
}) {
  if (!overrideData && state.kind === "loading") {
    return (
      <DataCard detail="正在读取关系证据" title="关系价值">
        <Text style={styles.bodyText}>正在看这条关系是否值得优先推进。</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </DataCard>
    );
  }

  if (!overrideData && (state.kind === "failure" || state.kind === "offline")) {
    return (
      <DataCard detail="暂时不可用" title="关系价值">
        <Text style={styles.bodyText}>
          这条关系的价值分析暂时取不到，联系人资料仍可继续编辑。
        </Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </DataCard>
    );
  }

  const sourceData =
    overrideData ?? (state.kind === "success" || state.kind === "empty" ? state.data : null);
  const view = relationshipValueToView(sourceData);

  if (view.kind !== "ready") {
    return (
      <DataCard detail={view.nextAction} title="关系价值">
        <Text style={styles.bodyText}>{view.body}</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </DataCard>
    );
  }

  return (
    <DataCard detail={view.nextAction} title="关系价值">
      <View style={styles.relationshipHeaderRow}>
        <View style={styles.relationshipScoreBlock}>
          <Text style={styles.relationshipScore}>{view.scoreLabel}</Text>
          <Text style={styles.relationshipPriority}>{view.priorityLabel}</Text>
        </View>
        <Text style={styles.relationshipSafety}>{view.safetyText}</Text>
      </View>
      <Text style={styles.bodyText}>{view.summary}</Text>
      <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      {view.factors.length > 0 ? (
        <View style={styles.promptStack}>
          <Text style={styles.relationshipSectionTitle}>加分原因</Text>
          {view.factors.map((factor) => (
            <View key={factor.label} style={styles.relationshipFactorRow}>
              <Text style={styles.bodyText}>{factor.label}</Text>
              <Text style={styles.factorPoint}>{factor.pointsLabel}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {view.evidenceLines.length > 0 ? (
        <View style={styles.promptStack}>
          <Text style={styles.relationshipSectionTitle}>依据</Text>
          {view.evidenceLines.map((line) => (
            <Text key={line} style={styles.bodyText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </DataCard>
  );
}

function RelationshipRecomputeButton({
  onPress,
  pending
}: {
  onPress: () => void;
  pending: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.relationshipRecomputeButton,
        pending ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.accent} name="refresh-outline" size={16} />
      <Text style={styles.relationshipRecomputeButtonText}>
        {pending ? "计算中" : "重新计算"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  archiveButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.rose,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  archiveButtonText: {
    color: colors.rose,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  contactHero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  contactHeroDetail: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  contactHeroHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  contactHeroName: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  contactHeroRelationship: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  contactHeroTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  heroAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 64,
    justifyContent: "center",
    overflow: "hidden",
    width: 64
  },
  heroAvatarImage: {
    height: "100%",
    width: "100%"
  },
  heroAvatarText: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  inputLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  metadataColumn: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  metadataInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  metadataRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  metadataStack: {
    gap: spacing.sm
  },
  noteButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  noteButtonText: {
    color: colors.onAccent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  noteInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 92,
    padding: spacing.md
  },
  pressed: {
    opacity: 0.72
  },
  primaryHeroButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryHeroButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  promptStack: {
    gap: 8
  },
  promptText: {
    backgroundColor: colors.liveSoft,
    borderRadius: 10,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  factorPoint: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  relationshipFactorRow: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  relationshipHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  relationshipPriority: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  relationshipRecomputeButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.accent,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  relationshipRecomputeButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  relationshipSafety: {
    color: colors.text3,
    flexShrink: 1,
    fontSize: typography.caption,
    lineHeight: 17,
    textAlign: "right"
  },
  relationshipScore: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 25
  },
  relationshipScoreBlock: {
    gap: 2
  },
  relationshipSectionTitle: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  statusButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.accent,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  statusButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  scorePill: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPill: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tagText: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
