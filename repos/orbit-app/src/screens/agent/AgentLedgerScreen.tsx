import { useState } from "react";
import { RefreshControl } from "react-native";
import type {
  AgentLedgerListPayloadContract,
  AgentLedgerMutationPayloadContract,
  AgentLedgerTransitionContract,
  AgentLedgerTransitionRequestContract
} from "../../api/agent-ledger-contract";
import {
  agentLedgerTransitionPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  agentLedgerToSurfaceView,
  type AgentLedgerEntryView,
  type AgentLedgerSurfaceMode
} from "../../view-models/agent-ledger";
import {
  AgentLedgerContent,
  type PendingTransition
} from "./AgentLedgerContent";

function transitionFeedback(
  transition: AgentLedgerTransitionContract
): string {
  switch (transition) {
    case "confirm":
      return "已确认，最新执行状态会从统一账本恢复。";
    case "defer":
      return "已移到稍后处理；All Actions 会继续保留这条记录。";
    case "reject":
      return "已忽略这条建议，记录仍保留在操作账本。";
    case "cancel":
      return "已取消尚未开始的执行。";
    case "undo":
      return "已提交撤销，账本会保留补偿结果。";
    case "retry":
      return "已重试失败项；成功过的操作不会重复执行。";
  }
}

export function AgentLedgerScreen({
  mode
}: {
  mode: AgentLedgerSurfaceMode;
}) {
  const client = useOrbitApiClient();
  const ledgerState = useApiResource<AgentLedgerListPayloadContract>(
    ORBIT_API_ENDPOINTS.agentLedger,
    (data) => data.entries.length === 0
  );
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function refresh(): void {
    setFeedback(null);
    setActionError(null);
    ledgerState.refresh();
  }

  async function applyTransition(
    entry: AgentLedgerEntryView,
    transition: AgentLedgerTransitionContract,
    selectedOperationIds: readonly string[]
  ): Promise<void> {
    setPending({ entryId: entry.id, transition });
    setFeedback(null);
    setActionError(null);

    const request: AgentLedgerTransitionRequestContract = {
      actorLabel: "移动端用户",
      transition,
      ...(transition === "confirm" ? { selectedOperationIds } : {})
    };

    try {
      const result = await client.post<AgentLedgerMutationPayloadContract>(
        agentLedgerTransitionPath(entry.id),
        { body: request }
      );

      if (result.success) {
        setFeedback(transitionFeedback(transition));
        ledgerState.refresh();
      } else {
        setActionError(result.error.message);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "这条操作暂时处理不了。"
      );
    } finally {
      setPending(null);
    }
  }

  const view =
    ledgerState.kind === "success" || ledgerState.kind === "empty"
      ? agentLedgerToSurfaceView(ledgerState.data, mode)
      : null;

  return (
    <AppScreen
      eyebrow="Orbit Agent"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={ledgerState.refreshing}
          tintColor={colors.accent}
        />
      }
      title={mode === "today" ? "Today" : "All Actions"}
    >
      {ledgerState.kind === "loading" ? <LoadingState /> : null}
      {ledgerState.kind === "offline" ? (
        <ErrorState
          message={ledgerState.error.message}
          title="操作账本暂时连不上"
        />
      ) : null}
      {ledgerState.kind === "failure" ? (
        <ErrorState
          message={ledgerState.error.message}
          title="操作账本加载失败"
        />
      ) : null}
      {view ? (
        <AgentLedgerContent
          error={actionError}
          feedback={feedback}
          onTransition={(entry, transition, selectedOperationIds) =>
            void applyTransition(entry, transition, selectedOperationIds)
          }
          pending={pending}
          view={view}
        />
      ) : null}
    </AppScreen>
  );
}

export function TodayAgentLedgerScreen() {
  return <AgentLedgerScreen mode="today" />;
}

export function AllActionsAgentLedgerScreen() {
  return <AgentLedgerScreen mode="all" />;
}
