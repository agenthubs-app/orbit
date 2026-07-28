import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  agentActionAcceptPath,
  agentActionDismissPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  agentActionsToView,
  type AgentActionCardView,
  type AgentActionsView
} from "../../view-models/agent-actions";

type AgentActionDecision = "accept" | "dismiss";

interface PendingAgentActionDecision {
  decision: AgentActionDecision;
  id: string;
}

export function AgentActionsScreen() {
  const client = useOrbitApiClient();
  const actionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.agentActions,
    (data) => agentActionsToView({ actionsPayload: data }).actions.length === 0
  );
  const [pendingDecision, setPendingDecision] =
    useState<PendingAgentActionDecision | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function refreshAll() {
    setFeedback(null);
    setActionError(null);
    actionsState.refresh();
  }

  async function decideAction(
    action: AgentActionCardView,
    decision: AgentActionDecision
  ) {
    setPendingDecision({ decision, id: action.id });
    setFeedback(null);
    setActionError(null);

    try {
      const path =
        decision === "accept"
          ? agentActionAcceptPath(action.id)
          : agentActionDismissPath(action.id);
      const result = await client.post<unknown>(path, {
        body: { actorLabel: "移动端用户" }
      });

      if (result.success) {
        setFeedback(
          decision === "accept"
            ? "已确认这条建议。后续对外动作仍会停下来等你确认。"
            : "已暂不处理这条建议。"
        );
        actionsState.refresh();
      } else {
        setActionError(result.error.message);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "这条建议暂时处理不了。"
      );
    } finally {
      setPendingDecision(null);
    }
  }

  return (
    <AppScreen
      eyebrow="Orbit AI"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={actionsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Agent 动作中心"
    >
      {actionsState.kind === "loading" ? <LoadingState /> : null}
      {actionsState.kind === "offline" ? (
        <ErrorState message={actionsState.error.message} title="服务器连不上" />
      ) : null}
      {actionsState.kind === "failure" ? (
        <ErrorState message={actionsState.error.message} title="动作队列不可用" />
      ) : null}
      {actionsState.kind === "success" || actionsState.kind === "empty" ? (
        <AgentActionsContent
          actionError={actionError}
          feedback={feedback}
          onDecision={decideAction}
          pendingDecision={pendingDecision}
          view={agentActionsToView({
            actionsPayload: actionsState.data
          })}
        />
      ) : null}
    </AppScreen>
  );
}

function AgentActionsContent({
  actionError,
  feedback,
  onDecision,
  pendingDecision,
  view
}: {
  actionError: string | null;
  feedback: string | null;
  onDecision: (action: AgentActionCardView, decision: AgentActionDecision) => void;
  pendingDecision: PendingAgentActionDecision | null;
  view: AgentActionsView;
}) {
  return (
    <>
      <DataCard detail={view.summary} title="今天需要你决定什么">
        <View style={styles.metricRow}>
          {view.metrics.map((metric) => (
            <View key={metric} style={styles.metricChip}>
              <Text numberOfLines={1} style={styles.metricText}>
                {metric}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.nextStep}>
          <Ionicons color={colors.accent} name="shield-checkmark-outline" size={18} />
          <Text style={styles.nextStepText}>{view.nextAction}</Text>
        </View>
      </DataCard>

      <DataCard
        detail={view.settings.confirmationLabel}
        title={`边界：${view.settings.policyLabel}`}
      >
        <Text style={styles.bodyText}>{view.settings.summary}</Text>
        <View style={styles.ruleList}>
          {view.settings.rules.map((rule) => (
            <View key={rule} style={styles.ruleItem}>
              <Ionicons color={colors.live} name="checkmark-circle-outline" size={17} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>
      </DataCard>

      {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {view.actions.length === 0 ? (
        <EmptyState message={view.emptyMessage} title={view.emptyTitle} />
      ) : (
        view.actions.map((action) => (
          <AgentActionCard
            action={action}
            key={action.id}
            onDecision={onDecision}
            pendingDecision={pendingDecision}
          />
        ))
      )}
    </>
  );
}

function AgentActionCard({
  action,
  onDecision,
  pendingDecision
}: {
  action: AgentActionCardView;
  onDecision: (action: AgentActionCardView, decision: AgentActionDecision) => void;
  pendingDecision: PendingAgentActionDecision | null;
}) {
  const acceptPending =
    pendingDecision?.id === action.id && pendingDecision.decision === "accept";
  const dismissPending =
    pendingDecision?.id === action.id && pendingDecision.decision === "dismiss";
  const actionPending = pendingDecision?.id === action.id;

  return (
    <DataCard
      detail={`${action.actionTypeLabel} · ${action.dueLabel}`}
      title={action.title}
    >
      <View style={styles.tagRow}>
        <View style={[styles.tag, styles.priorityTag]}>
          <Text style={styles.priorityText}>{action.priorityLabel}</Text>
        </View>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{action.confirmationLabel}</Text>
        </View>
      </View>
      <Text style={styles.actionText}>{action.recommendedAction}</Text>
      <Text style={styles.bodyText}>{action.reason}</Text>
      <View style={styles.metaBox}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>对象</Text>
          <Text style={styles.metaValue}>
            {action.contactName} · {action.organization}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>边界</Text>
          <Text style={styles.metaValue}>{action.safetyLabel}</Text>
        </View>
      </View>
      <View style={styles.actionButtonRow}>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(pendingDecision)}
          onPress={() => onDecision(action, "accept")}
          style={({ pressed }) => [
            styles.primaryButton,
            actionPending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="checkmark-outline" size={17} />
          <Text style={styles.primaryButtonText}>
            {acceptPending ? "确认中" : action.acceptLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(pendingDecision)}
          onPress={() => onDecision(action, "dismiss")}
          style={({ pressed }) => [
            styles.secondaryButton,
            actionPending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="close-outline" size={17} />
          <Text style={styles.secondaryButtonText}>
            {dismissPending ? "处理中" : action.dismissLabel}
          </Text>
        </Pressable>
      </View>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  actionButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  actionText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  bodyText: {
    color: colors.text,
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
  metaBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  metaLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    width: 38
  },
  metaRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  metaValue: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 19
  },
  metricChip: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metricText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  nextStep: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  nextStepText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  priorityTag: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.amberSoft
  },
  priorityText: {
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 128,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  ruleItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  ruleList: {
    gap: spacing.sm
  },
  ruleText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 128,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  tag: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  tagText: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  }
});
