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
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { OfflineNotice } from "../../components/OfflineNotice";
import { NeedsNetworkState } from "../../components/NeedsNetworkState";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
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
  const { colors } = useOrbitTheme();
  const locale = useOrbitLocale();
  const client = useOrbitApiClient();
  // Sprint 0131: the device keeps the last online answer (page copy "agent-actions"); offline it stays with 截至.
  const actionsState = usePageCopyResource<unknown>(
    ORBIT_API_ENDPOINTS.agentActions,
    (data) => agentActionsToView({ actionsPayload: data }).actions.length === 0,
    { copy: { id: "agent-actions" } }
  );
  const offline = actionsState.copy?.offline === true;
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
            ? locale.t("agentActions.acceptFeedback")
            : locale.t("agentActions.dismissFeedback")
        );
        actionsState.refresh();
      } else {
        setActionError(result.error.message);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : locale.t("agentActions.unavailable")
      );
    } finally {
      setPendingDecision(null);
    }
  }

  return (
    <AppScreen
      backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("ai.title") })}
      backLabel={locale.t("ai.title")}
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={actionsState.refreshing}
          tintColor={colors.accentText}
        />
      }
      title={locale.t("agentActions.title")}
    >
      {offline ? <OfflineNotice lastSyncedAt={actionsState.copy?.lastSyncedAt ?? null} reason={actionsState.copy?.reason ?? null} /> : null}
      {actionsState.kind === "loading" ? <LoadingState /> : null}
      {actionsState.kind === "offline" ? (
        <NeedsNetworkState message={locale.t("sync.notOnDevice")} onRetry={actionsState.refresh} />
      ) : null}
      {actionsState.kind === "failure" ? (
        <ErrorState message={actionsState.error.message} title={locale.t("agentActions.queueUnavailable")} />
      ) : null}
      {actionsState.kind === "success" || actionsState.kind === "empty" ? (
        <AgentActionsContent
          actionError={actionError}
          feedback={feedback}
          offline={offline}
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
  offline,
  onDecision,
  pendingDecision,
  view
}: {
  actionError: string | null;
  feedback: string | null;
  offline: boolean;
  onDecision: (action: AgentActionCardView, decision: AgentActionDecision) => void;
  pendingDecision: PendingAgentActionDecision | null;
  view: AgentActionsView;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  return (
    <>
      <DataCard detail={view.summary} title={locale.t("agentActions.decideToday")}>
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
          <Ionicons color={colors.accentText} name="shield-checkmark-outline" size={18} />
          <Text style={styles.nextStepText}>{view.nextAction}</Text>
        </View>
      </DataCard>

      <DataCard
        detail={view.settings.confirmationLabel}
        title={locale.t("agentActions.boundaryNamed", { name: locale.t.literal(view.settings.policyLabel) })}
      >
        <Text style={styles.bodyText}>{view.settings.summary}</Text>
        <View style={styles.ruleList}>
          {view.settings.rules.map((rule) => (
            <View key={rule} style={styles.ruleItem}>
              <Ionicons color={colors.okText} name="checkmark-circle-outline" size={17} />
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
            offline={offline}
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
  offline,
  onDecision,
  pendingDecision
}: {
  action: AgentActionCardView;
  offline: boolean;
  onDecision: (action: AgentActionCardView, decision: AgentActionDecision) => void;
  pendingDecision: PendingAgentActionDecision | null;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const acceptPending =
    pendingDecision?.id === action.id && pendingDecision.decision === "accept";
  const dismissPending =
    pendingDecision?.id === action.id && pendingDecision.decision === "dismiss";
  const actionPending = pendingDecision?.id === action.id;
  const needsNetwork = offline ? ` · ${locale.t("sync.needsNetwork")}` : "";

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
          <Text style={styles.metaLabel}>{locale.t("agentActions.object")}</Text>
          <Text style={styles.metaValue}>
            {action.contactName} · {action.organization}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{locale.t("agentActions.boundary")}</Text>
          <Text style={styles.metaValue}>{action.safetyLabel}</Text>
        </View>
      </View>
      <View style={styles.actionButtonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: offline || Boolean(pendingDecision) }}
          disabled={offline || Boolean(pendingDecision)}
          onPress={() => onDecision(action, "accept")}
          style={({ pressed }) => [
            styles.primaryButton,
            actionPending || offline ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="checkmark-outline" size={17} />
          <Text style={styles.primaryButtonText}>
            {acceptPending ? locale.t("agentActions.confirming") : action.acceptLabel + needsNetwork}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: offline || Boolean(pendingDecision) }}
          disabled={offline || Boolean(pendingDecision)}
          onPress={() => onDecision(action, "dismiss")}
          style={({ pressed }) => [
            styles.secondaryButton,
            actionPending || offline ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accentText} name="close-outline" size={17} />
          <Text style={styles.secondaryButtonText}>
            {dismissPending ? locale.t("agentActions.processing") : action.dismissLabel + needsNetwork}
          </Text>
        </Pressable>
      </View>
    </DataCard>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  actionText: {
    ...textStyles.listTitle,
    color: colors.ink
  },
  bodyText: {
    color: colors.ink,
    fontSize: typography.bodySm,
    lineHeight: 20
  },
  disabled: {
    opacity: 0.54
  },
  errorText: {
    color: colors.coralText,
    fontSize: typography.bodySm,
    lineHeight: 20
  },
  feedbackText: {
    color: colors.okText,
    fontSize: typography.bodySm,
    fontWeight: "700",
    lineHeight: 20
  },
  metaBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl
  },
  metaLabel: {
    color: colors.ink3Text,
    fontSize: typography.label,
    width: 38
  },
  metaRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  metaValue: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.bodySm,
    lineHeight: 19
  },
  metricChip: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.line,
    borderRadius: radius.md,
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
    color: colors.accentText,
    fontSize: typography.label,
    fontWeight: "700",
    lineHeight: 16
  },
  nextStep: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSoft,
    borderColor: colors.line,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl
  },
  nextStepText: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.bodySm,
    lineHeight: 20
  },
  priorityTag: {
    backgroundColor: colors.macApricot,
    borderColor: colors.macApricot
  },
  priorityText: {
    color: colors.macApricotText,
    fontSize: typography.label,
    fontWeight: "700",
    lineHeight: 16
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 128
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText,
    color: colors.onAccent,
    flexShrink: 1
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
    color: colors.ink,
    flex: 1,
    fontSize: typography.bodySm,
    lineHeight: 20
  },
  secondaryButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 128
  },
  secondaryButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.accentText,
    flexShrink: 1
  },
  tag: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderRadius: radius.md,
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
    color: colors.ink2,
    fontSize: typography.label,
    fontWeight: "700",
    lineHeight: 16
  }
}));
