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
  externalActionSandboxSendMessagePath,
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
import {
  buildExternalActionConfirmationDecisionRequest,
  buildExternalActionSendMessageRequest,
  externalActionConfirmationDecisionToView,
  externalActionNoOpToView,
  externalActionSandboxToView,
  type ExternalActionConfirmationDecision,
  type ExternalActionConfirmationDecisionView,
  type ExternalActionNoOpView,
  type ExternalActionSandboxActionView,
  type ExternalActionSandboxView
} from "../../view-models/external-action-sandbox";

type AgentActionDecision = "accept" | "dismiss";

interface PendingAgentActionDecision {
  decision: AgentActionDecision;
  id: string;
}

interface PendingExternalConfirmationDecision {
  decision: ExternalActionConfirmationDecision;
  id: string;
}

export function AgentActionsScreen() {
  const client = useOrbitApiClient();
  const actionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.agentActions,
    (data) => agentActionsToView({ actionsPayload: data }).actions.length === 0
  );
  const sandboxState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.externalActionSandboxAudit,
    (data) => {
      const view = externalActionSandboxToView(data);
      return view.actions.length + view.auditRecords.length === 0;
    }
  );
  const [pendingDecision, setPendingDecision] =
    useState<PendingAgentActionDecision | null>(null);
  const [pendingExternalActionId, setPendingExternalActionId] =
    useState<string | null>(null);
  const [pendingConfirmationDecision, setPendingConfirmationDecision] =
    useState<PendingExternalConfirmationDecision | null>(null);
  const [externalConfirmationResult, setExternalConfirmationResult] =
    useState<ExternalActionConfirmationDecisionView | null>(null);
  const [externalActionResult, setExternalActionResult] =
    useState<ExternalActionNoOpView | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function refreshAll() {
    setFeedback(null);
    setActionError(null);
    setExternalConfirmationResult(null);
    actionsState.refresh();
    sandboxState.refresh();
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

  async function confirmExternalSend(action: ExternalActionSandboxActionView) {
    setPendingExternalActionId(action.id);
    setExternalActionResult(null);
    setExternalConfirmationResult(null);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.post<unknown>(
        externalActionSandboxSendMessagePath(),
        {
          body: buildExternalActionSendMessageRequest(action)
        }
      );

      if (result.success) {
        setExternalActionResult(externalActionNoOpToView(result.data));
        sandboxState.refresh();
      } else {
        setActionError(result.error.message);
      }
    } catch {
      setActionError("沙盒确认暂时处理不了。请刷新后再试一次。");
    } finally {
      setPendingExternalActionId(null);
    }
  }

  async function decideExternalConfirmation(
    action: ExternalActionSandboxActionView,
    decision: ExternalActionConfirmationDecision
  ) {
    const request = buildExternalActionConfirmationDecisionRequest(
      action,
      decision
    );

    if (!request.success) {
      setActionError(request.error);
      return;
    }

    setPendingConfirmationDecision({ decision, id: action.id });
    setExternalActionResult(null);
    setExternalConfirmationResult(null);
    setFeedback(null);
    setActionError(null);

    try {
      const result = await client.post<unknown>(request.request.path, {
        body: request.request.body
      });

      if (result.success) {
        setExternalConfirmationResult(
          externalActionConfirmationDecisionToView(result.data)
        );
        sandboxState.refresh();
      } else {
        setActionError(result.error.message);
      }
    } catch {
      setActionError("这条确认暂时处理不了。请刷新后再试一次。");
    } finally {
      setPendingConfirmationDecision(null);
    }
  }

  const sandboxView =
    sandboxState.kind === "success" || sandboxState.kind === "empty"
      ? externalActionSandboxToView(sandboxState.data)
      : null;

  return (
    <AppScreen
      eyebrow="Orbit AI"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            actionsState.refreshing ||
            sandboxState.refreshing
          }
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
      {sandboxState.kind === "failure" ? (
        <ErrorState message={sandboxState.error.message} title="对外动作确认不可用" />
      ) : null}
      {actionsState.kind === "success" || actionsState.kind === "empty" ? (
        <AgentActionsContent
          actionError={actionError}
          externalConfirmationResult={externalConfirmationResult}
          externalActionResult={externalActionResult}
          feedback={feedback}
          onDecision={decideAction}
          onExternalConfirmationDecision={decideExternalConfirmation}
          onExternalSendConfirm={confirmExternalSend}
          pendingConfirmationDecision={pendingConfirmationDecision}
          pendingDecision={pendingDecision}
          pendingExternalActionId={pendingExternalActionId}
          sandboxView={sandboxView}
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
  externalConfirmationResult,
  externalActionResult,
  feedback,
  onDecision,
  onExternalConfirmationDecision,
  onExternalSendConfirm,
  pendingConfirmationDecision,
  pendingDecision,
  pendingExternalActionId,
  sandboxView,
  view
}: {
  actionError: string | null;
  externalConfirmationResult: ExternalActionConfirmationDecisionView | null;
  externalActionResult: ExternalActionNoOpView | null;
  feedback: string | null;
  onDecision: (action: AgentActionCardView, decision: AgentActionDecision) => void;
  onExternalConfirmationDecision: (
    action: ExternalActionSandboxActionView,
    decision: ExternalActionConfirmationDecision
  ) => void;
  onExternalSendConfirm: (action: ExternalActionSandboxActionView) => void;
  pendingConfirmationDecision: PendingExternalConfirmationDecision | null;
  pendingDecision: PendingAgentActionDecision | null;
  pendingExternalActionId: string | null;
  sandboxView: ExternalActionSandboxView | null;
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
      {sandboxView ? (
        <ExternalActionSandboxCard
          confirmationResult={externalConfirmationResult}
          onConfirmationDecision={onExternalConfirmationDecision}
          onConfirmSend={onExternalSendConfirm}
          pendingConfirmationDecision={pendingConfirmationDecision}
          pendingExternalActionId={pendingExternalActionId}
          result={externalActionResult}
          view={sandboxView}
        />
      ) : null}

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

function ExternalActionSandboxCard({
  confirmationResult,
  onConfirmationDecision,
  onConfirmSend,
  pendingConfirmationDecision,
  pendingExternalActionId,
  result,
  view
}: {
  confirmationResult: ExternalActionConfirmationDecisionView | null;
  onConfirmationDecision: (
    action: ExternalActionSandboxActionView,
    decision: ExternalActionConfirmationDecision
  ) => void;
  onConfirmSend: (action: ExternalActionSandboxActionView) => void;
  pendingConfirmationDecision: PendingExternalConfirmationDecision | null;
  pendingExternalActionId: string | null;
  result: ExternalActionNoOpView | null;
  view: ExternalActionSandboxView;
}) {
  return (
    <DataCard detail={view.summary} title="对外动作确认">
      <View style={styles.nextStep}>
        <Ionicons color={colors.accent} name="shield-outline" size={18} />
        <Text style={styles.nextStepText}>{view.nextAction}</Text>
      </View>
      {result ? (
        <View style={styles.sandboxResult}>
          <Text style={styles.resultTitle}>{result.title}</Text>
          <Text style={styles.bodyText}>{result.detail}</Text>
          <Text style={styles.ruleText}>{result.message}</Text>
        </View>
      ) : null}
      {confirmationResult ? (
        <View style={styles.sandboxResult}>
          <Text style={styles.resultTitle}>{confirmationResult.title}</Text>
          <Text style={styles.bodyText}>{confirmationResult.detail}</Text>
          <Text style={styles.ruleText}>{confirmationResult.message}</Text>
        </View>
      ) : null}
      {view.emptyText ? (
        <Text style={styles.bodyText}>{view.emptyText}</Text>
      ) : null}
      {view.actions.length > 0 ? (
        <View style={styles.sandboxStack}>
          {view.actions.map((action) => {
            const pending = pendingExternalActionId === action.id;
            const approvePending =
              pendingConfirmationDecision?.id === action.id &&
              pendingConfirmationDecision.decision === "approve";
            const rejectPending =
              pendingConfirmationDecision?.id === action.id &&
              pendingConfirmationDecision.decision === "reject";
            const anyPending = Boolean(
              pendingExternalActionId || pendingConfirmationDecision
            );

            return (
              <View key={action.id} style={styles.sandboxBlock}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{action.actionTypeLabel}</Text>
                  <Text style={styles.rowMeta}>{action.confirmationLabel}</Text>
                </View>
                <Text style={styles.bodyText}>{action.requestedEffect}</Text>
                <Text style={styles.ruleText}>{action.suppressedEffect}</Text>
                {action.confirmationId ? (
                  <View style={styles.actionButtonRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={anyPending}
                      onPress={() => onConfirmationDecision(action, "approve")}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        approvePending ? styles.disabled : null,
                        pressed ? styles.pressed : null
                      ]}
                    >
                      <Ionicons
                        color={colors.onAccent}
                        name="checkmark-done-outline"
                        size={17}
                      />
                      <Text style={styles.primaryButtonText}>
                        {approvePending ? "批准中" : "批准确认"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={anyPending}
                      onPress={() => onConfirmationDecision(action, "reject")}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        rejectPending ? styles.disabled : null,
                        pressed ? styles.pressed : null
                      ]}
                    >
                      <Ionicons color={colors.accent} name="close-outline" size={17} />
                      <Text style={styles.secondaryButtonText}>
                        {rejectPending ? "拒绝中" : "拒绝确认"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {action.canConfirmSend ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={anyPending}
                    onPress={() => onConfirmSend(action)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pending ? styles.disabled : null,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Ionicons
                      color={colors.onAccent}
                      name="mail-unread-outline"
                      size={17}
                    />
                    <Text style={styles.primaryButtonText}>
                      {pending ? "确认中" : "确认沙盒发送"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {view.auditRecords.length > 0 ? (
        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons color={colors.accent} name="time-outline" size={17} />
              <Text style={styles.sectionTitle}>确认历史</Text>
            </View>
            <Text style={styles.sectionMeta}>{view.auditRecords.length} 条</Text>
          </View>
          <View style={styles.sandboxStack}>
            {view.auditRecords.map((audit) => (
              <View key={audit.id} style={styles.auditRow}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{audit.title}</Text>
                  <Text style={styles.rowMeta}>{audit.evidenceLabel}</Text>
                </View>
                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{audit.resultLabel}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{audit.providerLabel}</Text>
                  </View>
                </View>
                {audit.contextLines.map((line) => (
                  <View key={`${audit.id}-${line}`} style={styles.auditContextRow}>
                    <Ionicons color={colors.text3} name="ellipse" size={5} />
                    <Text style={styles.auditContextText}>{line}</Text>
                  </View>
                ))}
                <View style={styles.auditMetaRow}>
                  <Text style={styles.auditMetaText}>{audit.actorLabel}</Text>
                  <Text style={styles.auditMetaText}>{audit.timestampLabel}</Text>
                </View>
                <Text style={styles.bodyText}>{audit.safetyText}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </DataCard>
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
  auditRow: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  auditContextRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  auditContextText: {
    color: colors.text2,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  auditMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  auditMetaText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
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
  historySection: {
    gap: spacing.sm,
    paddingTop: spacing.xs
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
  resultTitle: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  rowMeta: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 18
  },
  rowTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  sandboxBlock: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  sandboxResult: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  sandboxStack: {
    gap: spacing.md
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  sectionMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
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
