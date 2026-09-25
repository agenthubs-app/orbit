import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { RelationshipInvitationDTO } from "../../api/contract/relationship-communication";
import type { ContactIntrosSummaryContract } from "../../api/contract/contact-intros-summary";
import { buildRelationshipInvitationRequest } from "../../api/contact-communication";
import { relationshipCommunicationInvitationsPath } from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  type ContactIntroCandidateView,
  type ContactPipelineMetricView,
} from "../../view-models/contact-pipeline";
import { contactIntrosSummaryToView } from "../../view-models/contact-intros-summary";

const CONTACT_INTROS_SUMMARY_ENDPOINT = "/api/contacts/intros/summary";

interface PreparedInvitationRecord {
  candidate: ContactIntroCandidateView;
  invitation: RelationshipInvitationDTO;
}

export function ContactIntrosScreen() {
  const { colors } = useOrbitTheme();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.actorId ?? "", auth.cookieHeader, baseUrl]);
  const summaryState = useApiResource<ContactIntrosSummaryContract>(
    CONTACT_INTROS_SUMMARY_ENDPOINT,
    (data) => data.totalContacts === 0,
    { scopeKey }
  );
  const refreshing = summaryState.refreshing;
  const refresh = () => summaryState.refresh();

  return (
    <AppScreen
      eyebrow="名片夹"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={refreshing}
          tintColor={colors.accent}
        />
      }
      title="引荐准备"
    >
      {summaryState.kind === "loading" ? (
        <LoadingState />
      ) : null}
      {summaryState.kind === "offline" ? (
        <ErrorState
          message={summaryState.error.message}
          title="服务器连不上"
        />
      ) : null}
      {summaryState.kind === "failure" ? (
        <ErrorState
          message={summaryState.error.message}
        />
      ) : null}
      {summaryState.kind === "empty" ? (
        <EmptyState
          message="先补联系人来源，再整理适合互相介绍的人。"
          title="暂无引荐候选"
        />
      ) : null}
      {summaryState.kind === "success" ? (
        <IntrosContent summary={summaryState.data} />
      ) : null}
    </AppScreen>
  );
}

function IntrosContent({ summary }: { summary: ContactIntrosSummaryContract }) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const client = useOrbitApiClient();
  const view = contactIntrosSummaryToView(summary);
  const [activeCandidate, setActiveCandidate] =
    useState<ContactIntroCandidateView | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [invitation, setInvitation] = useState<RelationshipInvitationDTO | null>(null);
  const [invitationError, setInvitationError] = useState("");
  const [preparedInvitations, setPreparedInvitations] = useState<
    PreparedInvitationRecord[]
  >([]);
  const [invitationStatus, setInvitationStatus] = useState<
    "idle" | "preparing" | "sharing"
  >("idle");
  const totalMetric = { label: "联系人", value: String(view.totalContactCount) };
  const introMetric = { label: "可引荐", value: String(view.introCandidateCount) };

  function selectInvitationCandidate(candidate: ContactIntroCandidateView) {
    setActiveCandidate(candidate);
    setRecipientEmail("");
    setInvitation(null);
    setInvitationError("");
    setInvitationStatus("idle");
  }

  async function prepareInvitation() {
    if (!activeCandidate) {
      setInvitationError("先选择一位联系人。");
      return;
    }

    const request = buildRelationshipInvitationRequest({
      contactId: activeCandidate.contactId,
      recipientEmail,
      recipientName: activeCandidate.name
    });

    if (!request.success) {
      setInvitationError(request.error);
      return;
    }

    if (request.request.endpoint !== relationshipCommunicationInvitationsPath()) {
      setInvitationError("邀请接口暂时不可用。");
      return;
    }

    setInvitationError("");
    setInvitationStatus("preparing");

    const result = await client.post<unknown>(request.request.endpoint, {
      body: request.request.body
    });

    setInvitationStatus("idle");

    if (!result.success) {
      setInvitationError(result.error.message);
      return;
    }

    const nextInvitation = result.data as RelationshipInvitationDTO;
    if (
      nextInvitation.status !== "pending" ||
      !nextInvitation.invitationUrl?.trim() ||
      nextInvitation.externalSendRequested !== false
    ) {
      setInvitationError("尚未确认有效邀请链接，请重试。");
      return;
    }
    setInvitation(nextInvitation);
    setPreparedInvitations((current) =>
      upsertPreparedInvitation(current, {
        candidate: activeCandidate,
        invitation: nextInvitation
      })
    );
  }

  async function shareInvitation() {
    if (!invitation) {
      setInvitationError("先创建邀请链接。");
      return;
    }
    setInvitationError("");
    setInvitationStatus("sharing");
    try {
      await Share.share({
        message: `请打开这个 Orbit 邀请链接并登录确认：${invitation.invitationUrl}`,
        title: "Orbit 邀请"
      });
    } catch {
      setInvitationError("系统分享暂时不可用，链接仍保留在页面上。");
    } finally {
      setInvitationStatus("idle");
    }
  }

  return (
    <>
      <DataCard detail={view.introCandidateCount > 0
        ? `${view.introCandidateCount} 位联系人适合先准备引荐。`
        : "还没有适合发起引荐的候选。"} title="引荐总览">
        <MetricGrid
          metrics={[
            totalMetric,
            introMetric,
            { label: "邀请", value: "可准备" },
            { label: "外发", value: "需确认" }
          ]}
        />
        <View style={styles.callout}>
          <Ionicons color={colors.live} name="git-compare-outline" size={18} />
          <Text style={styles.calloutText}>
            这里先找适合牵线的人。创建邀请链接不会自动联系对方。
          </Text>
        </View>
      </DataCard>
      {preparedInvitations.length > 0 ? (
        <PreparedInvitationRecordsCard records={preparedInvitations} />
      ) : null}
      {view.candidates.length > 0 ? (
        <DataCard detail="按关系强度和引荐路径排序" title="可准备的人">
          <View style={styles.listStack}>
            {view.candidates.map((candidate) => (
              <IntroCandidateRow
                candidate={candidate}
                key={candidate.id}
                onOpen={() =>
                  router.push(
                    `/contacts/${encodeURIComponent(candidate.contactId)}` as Href
                  )
                }
                onPrepare={() => selectInvitationCandidate(candidate)}
              />
            ))}
          </View>
        </DataCard>
      ) : (
        <EmptyState
          message="有明确引荐路径或朋友介绍来源的人会出现在这里。"
          title="暂无合适候选"
        />
      )}
      {activeCandidate ? (
        <InvitationDraftCard
          candidate={activeCandidate}
          email={recipientEmail}
          error={invitationError}
          invitation={invitation}
          onEmailChange={setRecipientEmail}
          onPrepare={() => void prepareInvitation()}
          onShare={() => void shareInvitation()}
          status={invitationStatus}
        />
      ) : null}
    </>
  );
}

function upsertPreparedInvitation(
  current: PreparedInvitationRecord[],
  nextRecord: PreparedInvitationRecord
): PreparedInvitationRecord[] {
  const withoutExisting = current.filter(
    (record) => record.invitation.invitationId !== nextRecord.invitation.invitationId
  );

  return [nextRecord, ...withoutExisting].slice(0, 5);
}

function MetricGrid({ metrics }: { metrics: ContactPipelineMetricView[] }) {
  const { styles } = useStyles();
  return (
    <View style={styles.metricGrid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.metricCell}>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricLabel}>{metric.label}</Text>
        </View>
      ))}
    </View>
  );
}

function PreparedInvitationRecordsCard({
  records
}: {
  records: PreparedInvitationRecord[];
}) {
  const { styles } = useStyles();
  const pendingCount = records.filter((record) => record.invitation.status === "pending").length;

  return (
    <DataCard
      detail={`等待接受 ${pendingCount}`}
      title="本次引荐记录"
    >
      <View style={styles.listStack}>
        {records.map((record) => (
          <View key={record.invitation.invitationId} style={styles.recordRow}>
            <View style={styles.rowTop}>
              <View style={styles.rowTitle}>
                <Text numberOfLines={1} style={styles.itemTitle}>
                  {record.candidate.name}
                </Text>
                <Text numberOfLines={1} style={styles.metaText}>
                  {record.invitation.recipientEmail}
                </Text>
              </View>
              <Text style={styles.stageTag}>等待接受</Text>
            </View>
            <Text numberOfLines={2} style={styles.bodyText}>
              {record.invitation.invitationUrl}
            </Text>
            <View style={styles.tagRow}>
              <Text style={styles.sourceTag}>没有外发</Text>
              <Text style={styles.stageTag}>
                打开链接后由对方确认
              </Text>
            </View>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function IntroCandidateRow({
  candidate,
  onOpen,
  onPrepare
}: {
  candidate: ContactIntroCandidateView;
  onOpen: () => void;
  onPrepare: () => void;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowTitle}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {candidate.name}
          </Text>
          <Text numberOfLines={1} style={styles.metaText}>
            {candidate.detail}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{candidate.strengthLabel}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{candidate.reason}</Text>
      <Text style={styles.bodyText}>{candidate.nextAction}</Text>
      <View style={styles.tagRow}>
        <Text style={styles.sourceTag}>{candidate.sourceLabel}</Text>
        <Text style={styles.stageTag}>发出前确认</Text>
      </View>
      <View style={styles.rowActions}>
        <ActionButton label="查看详情" onPress={onOpen} variant="ghost" />
        <ActionButton label="准备邀请" onPress={onPrepare} />
      </View>
    </View>
  );
}

function InvitationDraftCard({
  candidate,
  email,
  error,
  invitation,
  onEmailChange,
  onPrepare,
  onShare,
  status,
}: {
  candidate: ContactIntroCandidateView;
  email: string;
  error: string;
  invitation: RelationshipInvitationDTO | null;
  onEmailChange: (value: string) => void;
  onPrepare: () => void;
  onShare: () => void;
  status: "idle" | "preparing" | "sharing";
}) {
  const { colors, styles } = useStyles();
  const preparing = status === "preparing";
  const sharing = status === "sharing";

  return (
    <DataCard
      detail={invitation?.recipientEmail ?? candidate.detail}
      title={invitation ? "邀请链接" : "创建邀请"}
      variant="inset"
    >
      <View style={styles.invitationHeader}>
        <View style={styles.invitationMark}>
          <Ionicons color={colors.accent} name="mail-outline" size={18} />
        </View>
        <View style={styles.invitationTitleBlock}>
          <Text style={styles.itemTitle}>{candidate.name}</Text>
          <Text style={styles.metaText}>{candidate.reason}</Text>
        </View>
        {invitation ? (
          <Text style={styles.stageTag}>等待接受</Text>
        ) : null}
      </View>
      <LabeledInput
        keyboardType="email-address"
        label="邮箱"
        onChangeText={onEmailChange}
        placeholder="name@example.com"
        value={email}
      />
      {invitation ? (
        <>
          <Text selectable style={styles.bodyText}>{invitation.invitationUrl}</Text>
          <Text style={styles.boundaryText}>打开链接不会自动发送消息；对方登录并确认后才会建立聊天资格。</Text>
        </>
      ) : (
        <Text style={styles.bodyText}>
          先填邮箱再创建服务端邀请。创建链接不会自动发送邮件、短信或站内消息。
        </Text>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.rowActions}>
        <ActionButton
          disabled={preparing || sharing}
          label={preparing ? "创建中" : "创建邀请链接"}
          onPress={onPrepare}
          variant={invitation ? "ghost" : "primary"}
        />
        {invitation ? (
          <ActionButton
            disabled={preparing || sharing}
            label={sharing ? "打开中" : "系统分享"}
            onPress={onShare}
          />
        ) : null}
      </View>
    </DataCard>
  );
}

function LabeledInput({
  keyboardType = "default",
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value
}: {
  keyboardType?: "default" | "email-address";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        style={[styles.textInput, multiline ? styles.textArea : null]}
        value={value}
      />
    </View>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
  variant = "primary"
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  variant?: "ghost" | "primary";
}) {
  const { styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "ghost" ? styles.actionButtonGhost : null,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === "ghost" ? styles.actionButtonGhostText : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionButton: {
    ...createControlStyles(colors).primaryButton,
    maxWidth: "100%"
  },
  actionButtonGhost: { ...createControlStyles(colors).secondaryButton },
  actionButtonGhostText: { ...createControlStyles(colors).secondaryButtonText },
  actionButtonText: { ...createControlStyles(colors).primaryButtonText },
  bodyText: {
    ...textStyles.body,
    color: colors.text
  },
  boundaryText: {
    ...textStyles.caption,
    color: colors.text3
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  calloutText: {
    ...textStyles.small,
    color: colors.text,
    flex: 1
  },
  disabled: { opacity: 0.52 },
  errorText: {
    ...textStyles.small,
    color: colors.rose,
    fontWeight: "600"
  },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  invitationHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  invitationMark: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.accentSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  invitationTitleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  itemTitle: {
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  listStack: { gap: spacing.md },
  metaText: {
    ...textStyles.small,
    color: colors.text3
  },
  metricCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 120,
    paddingTop: spacing.md
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  metricValue: {
    ...textStyles.title,
    color: colors.ink
  },
  pressed: { opacity: 0.72 },
  recordRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingVertical: spacing.md
  },
  row: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  rowTitle: {
    flex: 1,
    gap: spacing.xs
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  scorePill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scoreText: {
    ...textStyles.small,
    color: colors.amber,
    fontWeight: "600"
  },
  sourceTag: {
    ...textStyles.caption,
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  stageTag: {
    ...textStyles.caption,
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  tagRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  textArea: {
    minHeight: 132,
    paddingTop: spacing.md,
    textAlignVertical: "top"
  },
  textInput: { ...createControlStyles(colors).input }
}));
