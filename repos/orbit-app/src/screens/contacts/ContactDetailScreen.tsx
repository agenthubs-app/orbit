import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
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
import type { IndustryIdCode } from "../../api/contract/industries";
import { INDUSTRY_CATALOG } from "../../api/domain/industries";
import {
  contactDetailPath,
  ORBIT_API_ENDPOINTS,
  relationshipValueAnalysisPath,
  relationshipValueRecomputePath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
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
  const [industryPending, setIndustryPending] = useState(false);
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
    relationshipValuePending ||
    industryPending;

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

  async function updatePrimaryIndustry(primaryIndustryId: IndustryIdCode) {
    setIndustryPending(true);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), {
        body: { primaryIndustryId }
      });

      if (result.success) {
        setFeedback("主要行业已更新。");
        refreshAll();
      } else {
        setActionError("主要行业暂时保存不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("主要行业暂时保存不了。请刷新后再试一次。");
    } finally {
      setIndustryPending(false);
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
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title="联系人详情"
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
          industryPending={industryPending}
          metadataDraft={metadataDraft}
          metadataPending={metadataPending}
          noteDraft={noteDraft}
          notePending={notePending}
          onChangeMetadataDraft={onChangeMetadataDraft}
          onChangeNoteDraft={setNoteDraft}
          onSaveMetadata={saveMetadata}
          onSaveNote={saveNote}
          onRecompute={recomputeRelationshipValue}
          onSelectIndustry={updatePrimaryIndustry}
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
  industryPending,
  metadataDraft,
  metadataPending,
  noteDraft,
  notePending,
  onChangeMetadataDraft,
  onChangeNoteDraft,
  onSaveMetadata,
  onSaveNote,
  onRecompute,
  onSelectIndustry,
  onStatusAction,
  relationshipValueOverride,
  relationshipValuePending,
  relationshipValueState,
  statusPending
}: {
  data: unknown;
  industryPending: boolean;
  metadataDraft: ContactDetailMetadataDraft;
  metadataPending: boolean;
  noteDraft: string;
  notePending: boolean;
  onChangeMetadataDraft: (patch: Partial<ContactDetailMetadataDraft>) => void;
  onChangeNoteDraft: (value: string) => void;
  onSaveMetadata: () => void;
  onSaveNote: () => void;
  onRecompute: () => void;
  onSelectIndustry: (industryId: IndustryIdCode) => void;
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
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [editingExpanded, setEditingExpanded] = useState(false);
  const inboxHref =
    `/inbox?contactId=${encodeURIComponent(contact.id)}&participantName=${encodeURIComponent(
      contact.name
    )}&organization=${encodeURIComponent(contact.organization)}` as Href;

  return (
    <>
      <ContactIdentityHeader
        baseUrl={baseUrl}
        hero={hero}
        toneStyle={toneStyle}
      />
      <NextStepCard
        action={contact.nextAction}
        onPress={() => router.push(inboxHref)}
      />
      <ContactOverview contact={contact} />
      <DisclosureSection
        detail="公开介绍、关系价值和来源记录"
        expanded={detailsExpanded}
        onPress={() => setDetailsExpanded((current) => !current)}
        title="完整资料"
      >
        <FullDetailsPanel
          contact={contact}
          onRecompute={onRecompute}
          relationshipValueOverride={relationshipValueOverride}
          relationshipValuePending={relationshipValuePending}
          relationshipValueState={relationshipValueState}
        />
      </DisclosureSection>
      <DisclosureSection
        detail="状态、标签、互动和私人记录"
        expanded={editingExpanded}
        onPress={() => setEditingExpanded((current) => !current)}
        title="更新联系人"
      >
        <UpdateContactPanel
          contact={contact}
          industryPending={industryPending}
          metadataDraft={metadataDraft}
          metadataPending={metadataPending}
          noteDraft={noteDraft}
          notePending={notePending}
          onChangeMetadataDraft={onChangeMetadataDraft}
          onChangeNoteDraft={onChangeNoteDraft}
          onSaveMetadata={onSaveMetadata}
          onSaveNote={onSaveNote}
          onSelectIndustry={onSelectIndustry}
          onStatusAction={onStatusAction}
          statusPending={statusPending}
        />
      </DisclosureSection>
    </>
  );
}

function ContactIdentityHeader({
  baseUrl,
  hero,
  toneStyle
}: {
  baseUrl: string;
  hero: ReturnType<typeof contactDetailHeroToView>;
  toneStyle: { backgroundColor: string; color: string };
}) {
  return (
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
          <View style={styles.heroMetaRow}>
            <Text style={styles.statusPill}>{hero.status}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function NextStepCard({
  action,
  onPress
}: {
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.nextStepCard}>
      <View style={styles.nextStepHeader}>
        <View style={styles.nextStepIcon}>
          <Ionicons color={colors.accent} name="arrow-forward" size={17} />
        </View>
        <View style={styles.nextStepCopy}>
          <Text style={styles.nextStepEyebrow}>下一步</Text>
          <Text numberOfLines={3} style={styles.nextStepText}>
            {action}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.primaryActionButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="mail-outline" size={17} />
        <Text style={styles.primaryActionButtonText}>起草消息</Text>
      </Pressable>
    </View>
  );
}

function ContactOverview({ contact }: { contact: ContactDetailSummary }) {
  const exchange = relationshipExchangeFor(contact);

  return (
    <View style={styles.overviewSurface}>
      <DetailSection title="关系摘要">
        <Text numberOfLines={3} style={styles.bodyText}>
          {relationshipSummaryFor(contact)}
        </Text>
      </DetailSection>
      <SectionDivider />
      <DetailSection title="合作切入点">
        <View style={styles.exchangeRows}>
          <ExchangeValueRow label="对方在找" values={exchange.seeking} />
          <ExchangeValueRow label="对方能提供" values={exchange.offering} />
        </View>
      </DetailSection>
      <SectionDivider />
      <LatestActivityPreview contact={contact} />
    </View>
  );
}

function ExchangeValueRow({
  label,
  values
}: {
  label: string;
  values: string[];
}) {
  const visibleValues = values.slice(0, 2);
  const remaining = values.length - visibleValues.length;

  return (
    <View style={styles.exchangeRow}>
      <Text style={styles.exchangeLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.exchangeValue}>
        {visibleValues.length > 0 ? visibleValues.join(" · ") : "暂未记录"}
        {remaining > 0 ? `  +${remaining}` : ""}
      </Text>
    </View>
  );
}

function LatestActivityPreview({
  contact
}: {
  contact: ContactDetailSummary;
}) {
  const hasInteraction = contact.lastInteractionAt !== "暂无记录";
  const latest = hasInteraction ? contact.noteSummaries[0] : undefined;
  const meta = compactInteractionDate(contact.lastInteractionAt);

  return (
    <DetailSection detail={meta} title="最近动态">
      <View style={styles.activityRow}>
        <View style={styles.activityIcon}>
          <Ionicons color={colors.text3} name="time-outline" size={16} />
        </View>
        <Text numberOfLines={2} style={latest ? styles.activityText : styles.emptyText}>
          {latest ?? "还没有记录互动。"}
        </Text>
      </View>
    </DetailSection>
  );
}

function DisclosureSection({
  children,
  detail,
  expanded,
  onPress,
  title
}: {
  children: ReactNode;
  detail: string;
  expanded: boolean;
  onPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.disclosureSurface}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.disclosureHeader,
          pressed ? styles.pressed : null
        ]}
      >
        <View style={styles.disclosureCopy}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          <Text numberOfLines={2} style={styles.disclosureDetail}>
            {detail}
          </Text>
        </View>
        <Ionicons
          color={colors.text3}
          name={expanded ? "chevron-up" : "chevron-down"}
          size={19}
        />
      </Pressable>
      {expanded ? <View style={styles.disclosureContent}>{children}</View> : null}
    </View>
  );
}

function FullDetailsPanel({
  contact,
  onRecompute,
  relationshipValueOverride,
  relationshipValuePending,
  relationshipValueState
}: {
  contact: ContactDetailSummary;
  onRecompute: () => void;
  relationshipValueOverride: unknown | null;
  relationshipValuePending: boolean;
  relationshipValueState: ApiResourceState<unknown>;
}) {
  const publicTags = uniqueDisplayItems([
    ...contact.publicTopics,
    ...contact.valueLabels
  ]).filter(
    (tag) =>
      tag.length <= 20 &&
      tag !== contact.publicBio &&
      tag !== contact.relationship
  );
  const profileBio =
    contact.publicBio.trim() === contact.relationship.trim()
      ? ""
      : contact.publicBio;

  return (
    <>
      <DetailSection detail="对外可见的信息" title="公开介绍">
        <Text style={profileBio ? styles.bodyText : styles.emptyText}>
          {profileBio || "公开介绍与关系摘要一致。"}
        </Text>
        {publicTags.length > 0 ? <TagList items={publicTags} /> : null}
      </DetailSection>
      <SectionDivider />
      <DetailSection title="关系价值">
        <RelationshipValueCard
          onRecompute={onRecompute}
          overrideData={relationshipValueOverride}
          pending={relationshipValuePending}
          state={relationshipValueState}
        />
      </DetailSection>
      <SectionDivider />
      <DetailSection detail={contact.sourceLabel} title="来源记录">
        <EvidenceList contact={contact} />
      </DetailSection>
      {contact.noteSummaries.length > 1 ? (
        <>
          <SectionDivider />
          <DetailSection detail={contact.lastInteractionAt} title="更多记录">
            <PromptList prompts={contact.noteSummaries.slice(1)} />
          </DetailSection>
        </>
      ) : null}
    </>
  );
}

function UpdateContactPanel({
  contact,
  industryPending,
  metadataDraft,
  metadataPending,
  noteDraft,
  notePending,
  onChangeMetadataDraft,
  onChangeNoteDraft,
  onSaveMetadata,
  onSaveNote,
  onSelectIndustry,
  onStatusAction,
  statusPending
}: {
  contact: ContactDetailSummary;
  industryPending: boolean;
  metadataDraft: ContactDetailMetadataDraft;
  metadataPending: boolean;
  noteDraft: string;
  notePending: boolean;
  onChangeMetadataDraft: (patch: Partial<ContactDetailMetadataDraft>) => void;
  onChangeNoteDraft: (value: string) => void;
  onSaveMetadata: () => void;
  onSaveNote: () => void;
  onSelectIndustry: (industryId: IndustryIdCode) => void;
  onStatusAction: (action: ContactDetailStatusActionView) => void;
  statusPending: boolean;
}) {
  const statusCardDetail = "关系阶段和处理动作";

  return (
    <>
      <DetailSection detail={statusCardDetail} title="当前状态">
        <Text style={styles.bodyText}>{contact.status}</Text>
        <View style={styles.managementActionRow}>
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
              <Ionicons
                color={colors.accent}
                name="swap-horizontal-outline"
                size={16}
              />
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
        </View>
      </DetailSection>
      <SectionDivider />
      <DetailSection detail="固定分类，用于人脉结构分析" title="主要行业">
        <IndustryPicker
          pending={industryPending}
          selectedId={contact.primaryIndustryId}
          selectedLabel={contact.primaryIndustryLabel}
          onSelect={onSelectIndustry}
        />
      </DetailSection>
      <SectionDivider />
      <DetailSection detail="标签和最近互动一起保存" title="编辑标签和互动">
        {contact.detailTags.length > 0 ? <TagList items={contact.detailTags} /> : null}
        <View style={styles.metadataStack}>
          <Text style={styles.inputLabel}>自定义标签</Text>
          <TextInput
            onChangeText={(value) => onChangeMetadataDraft({ tagsText: value })}
            placeholder="AI, 关西渠道, 待联系"
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
      </DetailSection>
      <SectionDivider />
      <DetailSection detail="只保存到这条关系记录" title="添加记录">
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
      </DetailSection>
    </>
  );
}

function IndustryPicker({
  onSelect,
  pending,
  selectedId,
  selectedLabel
}: {
  onSelect: (industryId: IndustryIdCode) => void;
  pending: boolean;
  selectedId: IndustryIdCode | undefined;
  selectedLabel: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.industryPicker}>
      <Pressable
        accessibilityLabel="选择主要行业"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        disabled={pending}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.industryPickerButton,
          pending ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <View style={styles.industryPickerCopy}>
          <Text style={styles.industryPickerLabel}>当前分类</Text>
          <Text style={styles.industryPickerValue}>
            {pending ? "保存中" : selectedLabel || "选择一个主要行业"}
          </Text>
        </View>
        <Ionicons
          color={colors.text3}
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.industryOptions}>
          {INDUSTRY_CATALOG.map((industry) => {
            const selected = industry.id === selectedId;

            return (
              <Pressable
                accessibilityLabel={`设为${industry.labels.zh}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={pending}
                key={industry.id}
                onPress={() => {
                  onSelect(industry.id);
                  setExpanded(false);
                }}
                style={({ pressed }) => [
                  styles.industryOption,
                  selected ? styles.industryOptionSelected : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text
                  style={[
                    styles.industryOptionText,
                    selected ? styles.industryOptionTextSelected : null
                  ]}
                >
                  {industry.labels.zh}
                </Text>
                {selected ? (
                  <Ionicons color={colors.accent} name="checkmark" size={18} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function DetailSection({
  children,
  detail,
  title
}: {
  children: ReactNode;
  detail?: string;
  title: string;
}) {
  return (
    <View style={styles.detailSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.sectionDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

function uniqueDisplayItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function relationshipSummaryFor(contact: ContactDetailSummary): string {
  const identity = contact.organization && contact.role
    ? `${contact.organization}的${contact.role}`
    : contact.organization || contact.role || contact.name;
  const location = contact.location ? `，常驻${contact.location}` : "";

  return `${identity}${location}，目前处于${contact.status}。`;
}

function relationshipExchangeFor(contact: ContactDetailSummary): {
  offering: string[];
  seeking: string[];
} {
  const structuredMatch =
    /(?:本次关注|正在寻找)[「“"]([^」”"]+)[」”"].*?可提供[「“"]([^」”"]+)[」”"]/u.exec(
      contact.relationship
    );

  if (structuredMatch?.[1] && structuredMatch[2]) {
    return {
      offering: [structuredMatch[2].trim()],
      seeking: [structuredMatch[1].trim()]
    };
  }

  return {
    offering: uniqueDisplayItems(contact.publicOffering),
    seeking: uniqueDisplayItems([
      ...contact.publicSeeking,
      ...contact.publicPrompts
    ])
  };
}

function compactInteractionDate(value: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);

  if (!dateMatch) {
    return value;
  }

  return `${Number(dateMatch[2])}月${Number(dateMatch[3])}日`;
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
      <View style={styles.relationshipValueContent}>
        <Text style={styles.sectionDetail}>正在读取关系记录</Text>
        <Text style={styles.bodyText}>正在看这条关系是否值得优先推进。</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </View>
    );
  }

  if (!overrideData && (state.kind === "failure" || state.kind === "offline")) {
    return (
      <View style={styles.relationshipValueContent}>
        <Text style={styles.sectionDetail}>暂时不可用</Text>
        <Text style={styles.bodyText}>
          这条关系的价值分析暂时取不到，联系人资料仍可继续编辑。
        </Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </View>
    );
  }

  const sourceData =
    overrideData ?? (state.kind === "success" || state.kind === "empty" ? state.data : null);
  const view = relationshipValueToView(sourceData);

  if (view.kind !== "ready") {
    return (
      <View style={styles.relationshipValueContent}>
        <Text style={styles.bodyText}>{view.body}</Text>
        <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
      </View>
    );
  }

  return (
    <View style={styles.relationshipValueContent}>
      <View style={styles.relationshipHeaderRow}>
        <View style={styles.relationshipScoreBlock}>
          <Text style={styles.relationshipScore}>{view.scoreLabel}</Text>
          <Text style={styles.relationshipPriority}>{view.priorityLabel}</Text>
        </View>
        <Text style={styles.relationshipSafety}>{view.safetyText}</Text>
      </View>
      <Text style={styles.bodyText}>{view.summary}</Text>
      <RelationshipRecomputeButton onPress={onRecompute} pending={pending} />
    </View>
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
  industryOption: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: spacing.md
  },
  industryOptionSelected: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft
  },
  industryOptionText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  industryOptionTextSelected: {
    color: colors.accent
  },
  industryOptions: {
    gap: spacing.xs
  },
  industryPicker: {
    gap: spacing.sm
  },
  industryPickerButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  industryPickerCopy: {
    flex: 1,
    gap: spacing.xxs
  },
  industryPickerLabel: {
    color: colors.text4,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13
  },
  industryPickerValue: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 19
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
  },
  activityIcon: {
    alignItems: "center",
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  activityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  activityText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20,
    minWidth: 0
  },
  detailSection: {
    gap: spacing.md
  },
  disclosureContent: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
    padding: spacing.lg
  },
  disclosureCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  disclosureDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  disclosureHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  disclosureSurface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  disclosureTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  emptyText: {
    color: colors.text3,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20,
    minWidth: 0
  },
  exchangeLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18,
    width: 76
  },
  exchangeRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  exchangeRows: {
    gap: spacing.md
  },
  exchangeValue: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20,
    minWidth: 0
  },
  managementActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  nextStepCard: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentRing,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  nextStepCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  nextStepEyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  nextStepHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  nextStepIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  nextStepText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  overviewSurface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg
  },
  primaryActionButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  primaryActionButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  relationshipValueContent: {
    gap: spacing.md
  },
  sectionBody: {
    gap: spacing.sm
  },
  sectionDetail: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  sectionDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    width: "100%"
  },
  sectionHeader: {
    gap: spacing.xs
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  }
});
