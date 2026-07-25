import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AgentLedgerTransitionContract } from "../../api/agent-ledger-contract";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import type {
  AgentLedgerEntryView,
  AgentLedgerSurfaceView,
  AgentLedgerTransitionView
} from "../../view-models/agent-ledger";

export interface PendingTransition {
  entryId: string;
  transition: AgentLedgerTransitionContract;
}

export interface AgentLedgerContentProps {
  error: string | null;
  feedback: string | null;
  onTransition: (
    entry: AgentLedgerEntryView,
    transition: AgentLedgerTransitionContract,
    selectedOperationIds: readonly string[]
  ) => void;
  pending: PendingTransition | null;
  view: AgentLedgerSurfaceView;
}

export function AgentLedgerContent({
  error,
  feedback,
  onTransition,
  pending,
  view
}: AgentLedgerContentProps) {
  return (
    <>
      <DataCard detail={view.summary} title={view.title}>
        <View style={styles.metrics}>
          {view.metrics.map((metric) => (
            <View key={metric} style={styles.metric}>
              <Text style={styles.metricText}>{metric}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.nextAction}>{view.nextAction}</Text>
      </DataCard>

      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {view.sections.length === 0 ? (
        <EmptyState message={view.emptyMessage} title={view.emptyTitle} />
      ) : (
        view.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.entries.length}</Text>
            </View>
            {section.entries.map((entry) => (
              <AgentLedgerEntryCard
                entry={entry}
                key={`${entry.id}:${entry.updatedLabel}:${entry.status}`}
                onTransition={onTransition}
                pending={pending}
              />
            ))}
          </View>
        ))
      )}
    </>
  );
}

function AgentLedgerEntryCard({
  entry,
  onTransition,
  pending
}: {
  entry: AgentLedgerEntryView;
  onTransition: AgentLedgerContentProps["onTransition"];
  pending: PendingTransition | null;
}) {
  const [selectedOperationIds, setSelectedOperationIds] = useState<
    readonly string[]
  >(
    entry.operations
      .filter((operation) => operation.selectedByDefault)
      .map((operation) => operation.id)
  );
  const confirmable = entry.transitions.some(
    (transition) => transition.transition === "confirm"
  );
  const entryPending = pending?.entryId === entry.id;

  function toggleOperation(operationId: string): void {
    setSelectedOperationIds((current) =>
      current.includes(operationId)
        ? current.filter((id) => id !== operationId)
        : [...current, operationId]
    );
  }

  return (
    <DataCard
      detail={`${entry.statusLabel} · ${entry.riskLabel}`}
      title={entry.title}
    >
      {entry.contactLine ? (
        <Text style={styles.contactLine}>{entry.contactLine}</Text>
      ) : null}
      {entry.preview ? (
        <Text selectable style={styles.preview}>
          {entry.preview}
        </Text>
      ) : null}
      <View style={styles.whyBox}>
        <Text style={styles.label}>为什么现在出现</Text>
        <Text style={styles.body}>{entry.whyNow}</Text>
      </View>

      <View style={styles.operationList}>
        {entry.operations.map((operation) => {
          const selected = selectedOperationIds.includes(operation.id);
          const marker = confirmable ? (selected ? "✓" : "○") : "•";

          return (
            <Pressable
              accessibilityLabel={`${selected ? "取消选择" : "选择"} ${operation.title}`}
              accessibilityRole={confirmable ? "checkbox" : "text"}
              accessibilityState={
                confirmable ? { checked: selected, disabled: entryPending } : {}
              }
              disabled={!confirmable || entryPending}
              key={operation.id}
              onPress={() => toggleOperation(operation.id)}
              style={({ pressed }) => [
                styles.operation,
                selected ? styles.operationSelected : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text
                accessibilityElementsHidden
                style={[
                  styles.operationMarker,
                  selected ? styles.operationMarkerSelected : null
                ]}
              >
                {marker}
              </Text>
              <View style={styles.operationBody}>
                <View style={styles.operationHeader}>
                  <Text style={styles.operationTitle}>{operation.title}</Text>
                  <Text style={styles.operationStatus}>
                    {operation.statusLabel}
                  </Text>
                </View>
                <Text style={styles.body}>{operation.effectSummary}</Text>
                <Text selectable style={styles.auditText}>
                  {operation.id}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {entry.evidenceLabels.length > 0 ? (
        <View style={styles.evidenceList}>
          <Text style={styles.label}>证据</Text>
          {entry.evidenceLabels.map((evidence) => (
            <Text key={evidence} selectable style={styles.evidence}>
              {evidence}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.auditBox}>
        <Text selectable style={styles.auditText}>
          Action：{entry.id}
        </Text>
        <Text selectable style={styles.auditText}>
          Run：{entry.runLabel}
        </Text>
        <Text style={styles.auditText}>工作流：{entry.workflowLabel}</Text>
        <Text style={styles.auditText}>
          来源：{entry.sourceLabel} · 更新：{entry.updatedLabel}
        </Text>
      </View>

      {entry.transitions.length > 0 ? (
        <View style={styles.actions}>
          {entry.transitions.map((transition) => (
            <TransitionButton
              disabled={
                Boolean(pending) ||
                (transition.transition === "confirm" &&
                  selectedOperationIds.length === 0)
              }
              key={transition.transition}
              onPress={() =>
                onTransition(
                  entry,
                  transition.transition,
                  selectedOperationIds
                )
              }
              pending={
                entryPending && pending?.transition === transition.transition
              }
              transition={transition}
            />
          ))}
        </View>
      ) : null}
    </DataCard>
  );
}

function TransitionButton({
  disabled,
  onPress,
  pending,
  transition
}: {
  disabled: boolean;
  onPress: () => void;
  pending: boolean;
  transition: AgentLedgerTransitionView;
}) {
  const primary = transition.tone === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        primary ? styles.primaryButton : styles.secondaryButton,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text
        style={
          primary ? styles.primaryButtonText : styles.secondaryButtonText
        }
      >
        {pending ? "处理中" : transition.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  auditBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    gap: spacing.xxs,
    padding: spacing.md
  },
  auditText: {
    color: colors.text3,
    fontFamily: "monospace",
    fontSize: typography.caption,
    lineHeight: 17
  },
  body: {
    color: colors.text2,
    flexShrink: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  contactLine: {
    color: colors.text3,
    fontSize: typography.small,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.48
  },
  error: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  evidence: {
    color: colors.text2,
    fontSize: typography.caption,
    lineHeight: 18
  },
  evidenceList: {
    gap: spacing.xs
  },
  feedback: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  label: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  metric: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metricText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  nextAction: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  operation: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  operationBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  operationHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  operationList: {
    gap: spacing.sm
  },
  operationMarker: {
    color: colors.text3,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center",
    width: 18
  },
  operationMarkerSelected: {
    color: colors.accent
  },
  operationSelected: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.accent
  },
  operationStatus: {
    color: colors.text3,
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  operationTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  pressed: {
    opacity: 0.76
  },
  preview: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  section: {
    gap: spacing.sm
  },
  sectionCount: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700"
  },
  whyBox: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md
  }
});
