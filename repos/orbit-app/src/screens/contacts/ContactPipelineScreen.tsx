import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { connectionStagePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  contactsPipelineToView,
  type ContactIntroCandidateView,
  type ContactPipelineCardView,
  type ContactPipelineMetricView,
  type ContactPipelineStageActionView,
  type ContactPipelineStageView
} from "../../view-models/contact-pipeline";

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
      title="跟进管线"
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
                : "联系人管线暂时无法加载。"
          }
        />
      ) : null}
      {contactsState.kind === "empty" ? (
        <EmptyState
          message="先补联系人来源，再把下一步跟进放进管线。"
          title="暂无管线联系人"
        />
      ) : null}
      {contactsState.kind === "success" && connectionsState.kind === "success" ? (
        <PipelineContent
          connectionsPayload={connectionsState.data}
          contactsPayload={contactsState.data}
          onConnectionsRefresh={connectionsState.refresh}
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
  onConnectionsRefresh
}: {
  connectionsPayload: unknown;
  contactsPayload: unknown;
  onConnectionsRefresh: () => void;
}) {
  const router = useRouter();
  const client = useOrbitApiClient();
  const [pendingStageActionKey, setPendingStageActionKey] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const view = contactsPipelineToView({ connectionsPayload, contactsPayload });

  async function updateStage(action: ContactPipelineStageActionView) {
    setPendingStageActionKey(stageActionKey(action));
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.patch<unknown>(
        connectionStagePath(action.connectionId),
        {
          body: { relationshipStage: action.nextRelationshipStage }
        }
      );

      if (result.success) {
        setFeedback(action.successMessage);
        onConnectionsRefresh();
      } else {
        setActionError("跟进状态暂时改不了。请刷新后再试一次。");
      }
    } catch {
      setActionError("跟进状态暂时改不了。请刷新后再试一次。");
    } finally {
      setPendingStageActionKey(null);
    }
  }

  return (
    <>
      <DataCard detail={view.summary} title="管线总览">
        <MetricGrid metrics={view.metrics} />
        <View style={styles.callout}>
          <Ionicons color={colors.accent} name="list-outline" size={18} />
          <Text style={styles.calloutText}>
            先处理待联系，再把能牵线的人单独拿出来准备。
          </Text>
        </View>
      </DataCard>
      {view.stages.map((stage) => (
        <PipelineStage
          key={stage.id}
          onContactPress={(contactId) =>
            router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)
          }
          onStageAction={updateStage}
          pendingStageActionKey={pendingStageActionKey}
          stage={stage}
        />
      ))}
      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      <DataCard
        detail={view.introReadiness.summary}
        onPress={() => router.push("/contacts/intros" as Href)}
        title="引荐准备"
      >
        <View style={styles.callout}>
          <Ionicons color={colors.live} name="git-compare-outline" size={18} />
          <Text style={styles.calloutText}>
            只先整理适合牵线的人，真正发出前还要逐条确认。
          </Text>
        </View>
        {view.introReadiness.candidates.slice(0, 2).map((candidate) => (
          <IntroCandidateRow candidate={candidate} key={candidate.id} />
        ))}
      </DataCard>
    </>
  );
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

function PipelineStage({
  onContactPress,
  onStageAction,
  pendingStageActionKey,
  stage
}: {
  onContactPress: (contactId: string) => void;
  onStageAction: (action: ContactPipelineStageActionView) => void;
  pendingStageActionKey: string | null;
  stage: ContactPipelineStageView;
}) {
  return (
    <DataCard detail={stage.detail} title={`${stage.label} · ${stage.count}`}>
      {stage.contacts.length > 0 ? (
        <View style={styles.listStack}>
          {stage.contacts.map((contact) => (
            <PipelineContactRow
              contact={contact}
              key={contact.id}
              onPress={() => onContactPress(contact.id)}
              onStageAction={onStageAction}
              pendingStageActionKey={pendingStageActionKey}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.mutedText}>这一组暂时没有联系人。</Text>
      )}
    </DataCard>
  );
}

function PipelineContactRow({
  contact,
  onPress,
  onStageAction,
  pendingStageActionKey
}: {
  contact: ContactPipelineCardView;
  onPress: () => void;
  onStageAction: (action: ContactPipelineStageActionView) => void;
  pendingStageActionKey: string | null;
}) {
  const actions = contact.stageActions;
  const anyActionPending = pendingStageActionKey !== null;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.rowPressTarget,
          pressed ? styles.pressed : null
        ]}
      >
        <View style={styles.rowTop}>
          <View style={styles.rowTitle}>
            <Text numberOfLines={1} style={styles.itemTitle}>
              {contact.name}
            </Text>
            <Text numberOfLines={1} style={styles.metaText}>
              {contact.detail}
            </Text>
          </View>
          {contact.valueScoreLabel ? (
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>{contact.valueScoreLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.bodyText}>{contact.relationship}</Text>
        <Text style={styles.bodyText}>{contact.nextAction}</Text>
        {contact.valueLabels.length > 0 ? (
          <View style={styles.tagRow}>
            {contact.valueLabels.map((label) => (
              <Text key={label} style={styles.stageTag}>
                {label}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>
      {actions.length > 0 ? (
        <View style={styles.stageActionsRow}>
          {actions.map((stageAction) => {
            const actionKey = stageActionKey(stageAction);
            const actionPending = pendingStageActionKey === actionKey;

            return (
              <Pressable
                accessibilityRole="button"
                disabled={anyActionPending}
                key={actionKey}
                onPress={() => onStageAction(stageAction)}
                style={({ pressed }) => [
                  styles.stageButton,
                  anyActionPending ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons
                  color={colors.accent}
                  name="swap-horizontal-outline"
                  size={16}
                />
                <Text style={styles.stageButtonText}>
                  {actionPending ? stageAction.pendingLabel : stageAction.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function IntroCandidateRow({
  candidate
}: {
  candidate: ContactIntroCandidateView;
}) {
  return (
    <View style={styles.introRow}>
      <View style={styles.rowTop}>
        <View style={styles.rowTitle}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {candidate.name}
          </Text>
          <Text numberOfLines={1} style={styles.metaText}>
            {candidate.detail}
          </Text>
        </View>
        <Text style={styles.metaText}>{candidate.strengthLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{candidate.reason}</Text>
      <View style={styles.tagRow}>
        <Text style={styles.sourceTag}>{candidate.sourceLabel}</Text>
        <Text style={styles.metaText}>{candidate.nextAction}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
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
  introRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
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
  mutedText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 20
  },
  pressed: {
    opacity: 0.72
  },
  row: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  rowPressTarget: {
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
  stageActionsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  stageButton: {
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
  stageButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
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
  }
});
