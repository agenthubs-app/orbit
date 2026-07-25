import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildContactInvitationConfirmRequest,
  buildContactInvitationPrepareRequest,
  contactInvitationToView,
  contactsPipelineToView,
  type ContactInvitationView,
  type ContactIntroCandidateView,
  type ContactPipelineMetricView
} from "../../view-models/contact-pipeline";

interface PreparedInvitationRecord {
  candidate: ContactIntroCandidateView;
  invitation: ContactInvitationView;
}

export function ContactIntrosScreen() {
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
  const refreshing = contactsState.refreshing || connectionsState.refreshing;
  const refresh = () => {
    contactsState.refresh();
    connectionsState.refresh();
  };

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
                : "引荐准备暂时无法加载。"
          }
        />
      ) : null}
      {contactsState.kind === "empty" ? (
        <EmptyState
          message="先补联系人来源，再整理适合互相介绍的人。"
          title="暂无引荐候选"
        />
      ) : null}
      {contactsState.kind === "success" && connectionsState.kind === "success" ? (
        <IntrosContent
          connectionsPayload={connectionsState.data}
          contactsPayload={contactsState.data}
        />
      ) : null}
    </AppScreen>
  );
}

function IntrosContent({
  connectionsPayload,
  contactsPayload
}: {
  connectionsPayload: unknown;
  contactsPayload: unknown;
}) {
  const router = useRouter();
  const client = useOrbitApiClient();
  const view = contactsPipelineToView({ connectionsPayload, contactsPayload });
  const [activeCandidate, setActiveCandidate] =
    useState<ContactIntroCandidateView | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [invitation, setInvitation] = useState<ContactInvitationView | null>(null);
  const [invitationSubject, setInvitationSubject] = useState("");
  const [invitationBody, setInvitationBody] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [preparedInvitations, setPreparedInvitations] = useState<
    PreparedInvitationRecord[]
  >([]);
  const [invitationStatus, setInvitationStatus] = useState<
    "idle" | "preparing" | "confirming"
  >("idle");
  const totalMetric = view.metrics.find((metric) => metric.label === "联系人") ?? {
    label: "联系人",
    value: "0"
  };
  const introMetric = view.metrics.find((metric) => metric.label === "可引荐") ?? {
    label: "可引荐",
    value: "0"
  };

  function selectInvitationCandidate(candidate: ContactIntroCandidateView) {
    setActiveCandidate(candidate);
    setRecipientEmail("");
    setInvitation(null);
    setInvitationSubject("");
    setInvitationBody("");
    setInvitationError("");
    setInvitationStatus("idle");
  }

  async function prepareInvitation() {
    if (!activeCandidate) {
      setInvitationError("先选择一位联系人。");
      return;
    }

    const request = buildContactInvitationPrepareRequest({
      contactId: activeCandidate.contactId,
      recipientEmail,
      recipientName: activeCandidate.name
    });

    if (!request.success) {
      setInvitationError(request.error);
      return;
    }

    if (request.request.endpoint !== ORBIT_API_ENDPOINTS.contactInvitations) {
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

    const nextInvitation = contactInvitationToView(result.data);
    setInvitation(nextInvitation);
    setInvitationSubject(nextInvitation.subject);
    setInvitationBody(nextInvitation.body);
    setPreparedInvitations((current) =>
      upsertPreparedInvitation(current, {
        candidate: activeCandidate,
        invitation: nextInvitation
      })
    );
  }

  async function confirmInvitation() {
    if (!invitation) {
      setInvitationError("先生成邀请草稿。");
      return;
    }

    if (!activeCandidate) {
      setInvitationError("先选择一位联系人。");
      return;
    }

    const request = buildContactInvitationConfirmRequest({
      body: invitationBody,
      invitationId: invitation.id,
      subject: invitationSubject
    });

    if (!request.success) {
      setInvitationError(request.error);
      return;
    }

    setInvitationError("");
    setInvitationStatus("confirming");

    const result = await client.patch<unknown>(request.request.endpoint, {
      body: request.request.body
    });

    setInvitationStatus("idle");

    if (!result.success) {
      setInvitationError(result.error.message);
      return;
    }

    const confirmed = contactInvitationToView(result.data);
    setInvitation(confirmed);
    setInvitationSubject(confirmed.subject);
    setInvitationBody(confirmed.body);
    setPreparedInvitations((current) =>
      upsertPreparedInvitation(current, {
        candidate: activeCandidate,
        invitation: confirmed
      })
    );
  }

  return (
    <>
      <DataCard detail={view.introReadiness.summary} title="引荐总览">
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
            这里先找适合牵线的人。邀请可以先做成草稿，确认后也不会直接发送。
          </Text>
        </View>
      </DataCard>
      {preparedInvitations.length > 0 ? (
        <PreparedInvitationRecordsCard records={preparedInvitations} />
      ) : null}
      {view.introReadiness.candidates.length > 0 ? (
        <DataCard detail="按关系强度和引荐路径排序" title="可准备的人">
          <View style={styles.listStack}>
            {view.introReadiness.candidates.map((candidate) => (
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
          body={invitationBody}
          candidate={activeCandidate}
          email={recipientEmail}
          error={invitationError}
          invitation={invitation}
          onBodyChange={setInvitationBody}
          onConfirm={() => void confirmInvitation()}
          onEmailChange={setRecipientEmail}
          onPrepare={() => void prepareInvitation()}
          onSubjectChange={setInvitationSubject}
          status={invitationStatus}
          subject={invitationSubject}
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
    (record) => record.invitation.id !== nextRecord.invitation.id
  );

  return [nextRecord, ...withoutExisting].slice(0, 5);
}

function MetricGrid({ metrics }: { metrics: ContactPipelineMetricView[] }) {
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
  const draftCount = records.filter((record) => record.invitation.canConfirm)
    .length;
  const readyCount = records.length - draftCount;

  return (
    <DataCard
      detail={`草稿 ${draftCount} · 待投递 ${readyCount}`}
      title="本次引荐记录"
    >
      <View style={styles.listStack}>
        {records.map((record) => (
          <View key={record.invitation.id} style={styles.recordRow}>
            <View style={styles.rowTop}>
              <View style={styles.rowTitle}>
                <Text numberOfLines={1} style={styles.itemTitle}>
                  {record.candidate.name}
                </Text>
                <Text numberOfLines={1} style={styles.metaText}>
                  {record.invitation.recipientLine}
                </Text>
              </View>
              <Text style={styles.stageTag}>{record.invitation.statusLabel}</Text>
            </View>
            <Text numberOfLines={2} style={styles.bodyText}>
              {record.invitation.subject}
            </Text>
            <View style={styles.tagRow}>
              <Text style={styles.sourceTag}>没有外发</Text>
              <Text style={styles.stageTag}>
                确认后再进入发送前复核
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
  body,
  candidate,
  email,
  error,
  invitation,
  onBodyChange,
  onConfirm,
  onEmailChange,
  onPrepare,
  onSubjectChange,
  status,
  subject
}: {
  body: string;
  candidate: ContactIntroCandidateView;
  email: string;
  error: string;
  invitation: ContactInvitationView | null;
  onBodyChange: (value: string) => void;
  onConfirm: () => void;
  onEmailChange: (value: string) => void;
  onPrepare: () => void;
  onSubjectChange: (value: string) => void;
  status: "idle" | "preparing" | "confirming";
  subject: string;
}) {
  const preparing = status === "preparing";
  const confirming = status === "confirming";

  return (
    <DataCard
      detail={invitation?.recipientLine ?? candidate.detail}
      title={invitation?.title ?? "邀请草稿"}
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
          <Text style={styles.stageTag}>{invitation.statusLabel}</Text>
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
          <LabeledInput
            label="邮件主题"
            onChangeText={onSubjectChange}
            placeholder="邀请主题"
            value={subject}
          />
          <LabeledInput
            label="邀请正文"
            multiline
            onChangeText={onBodyChange}
            placeholder="写清楚为什么邀请对方加入 Orbit"
            value={body}
          />
          <Text style={styles.bodyText}>{invitation.nextAction}</Text>
          <Text style={styles.boundaryText}>{invitation.safetyText}</Text>
          <Text style={styles.boundaryText}>{invitation.boundaryText}</Text>
        </>
      ) : (
        <Text style={styles.bodyText}>
          先填邮箱，Orbit 会生成一版可编辑邀请。确认后也只是待投递，不会发送邮件。
        </Text>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.rowActions}>
        <ActionButton
          disabled={preparing || confirming}
          label={preparing ? "生成中" : "生成邀请草稿"}
          onPress={onPrepare}
          variant={invitation ? "ghost" : "primary"}
        />
        {invitation?.canConfirm ? (
          <ActionButton
            disabled={preparing || confirming}
            label={confirming ? "确认中" : "确认邀请"}
            onPress={onConfirm}
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

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  actionButtonGhost: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  actionButtonGhostText: {
    color: colors.text
  },
  actionButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  boundaryText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  calloutText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  disabled: {
    opacity: 0.52
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  fieldGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
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
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 21
  },
  listStack: {
    gap: spacing.md
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
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
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  pressed: {
    opacity: 0.72
  },
  recordRow: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
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
    color: colors.amber,
    fontSize: typography.small,
    fontWeight: "700"
  },
  sourceTag: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    color: colors.sky,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  stageTag: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
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
  textInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  }
});
