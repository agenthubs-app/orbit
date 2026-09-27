import { useEffect, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import type {
  AgentLedgerListPayloadContract,
  AgentLedgerMutationPayloadContract,
  AgentLedgerTransitionContract,
  AgentLedgerTransitionRequestContract
} from "../../api/agent-ledger-contract";
import {
  agentLedgerPagePath,
  agentLedgerTransitionPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  agentLedgerToSurfaceView,
  mergeAgentLedgerPages,
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
  mode,
  selectedEntryId
}: {
  mode: AgentLedgerSurfaceMode;
  selectedEntryId?: string | undefined;
}) {
  const { colors } = useOrbitTheme();
  const client = useOrbitApiClient();
  const ledgerState = useApiResource<AgentLedgerListPayloadContract>(
    ORBIT_API_ENDPOINTS.agentLedger,
    (data) => data.entries.length === 0
  );
  // Older pages follow the server cursor (Sprint 0122, Codex 103-A). They
  // belong to the first page they extend: a refresh, transition or account
  // change replaces the first page and drops them, including a late reply.
  const firstPage =
    ledgerState.kind === "success" || ledgerState.kind === "empty"
      ? ledgerState.data
      : null;
  const [olderPages, setOlderPages] = useState<{
    base: AgentLedgerListPayloadContract;
    pages: readonly AgentLedgerListPayloadContract[];
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadMoreRequest = useRef<object | null>(null);
  useEffect(() => {
    loadMoreRequest.current = null;
    setLoadingMore(false);
    setLoadMoreError(null);
  }, [firstPage]);
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

  const loadedPages = firstPage
    ? [firstPage, ...(olderPages?.base === firstPage ? olderPages.pages : [])]
    : [];
  const merged = firstPage ? mergeAgentLedgerPages(loadedPages) : null;

  async function loadMore(): Promise<void> {
    const cursor = merged?.nextCursor;
    if (!firstPage || !cursor || loadMoreRequest.current) return;
    const request = {};
    const base = firstPage;
    const previous = loadedPages.slice(1);
    loadMoreRequest.current = request;
    setLoadingMore(true);
    setLoadMoreError(null);
    let failure: string | null = null;
    let page: AgentLedgerListPayloadContract | null = null;
    try {
      const result = await client.get<AgentLedgerListPayloadContract>(agentLedgerPagePath(cursor));
      if (result.success && Array.isArray(result.data?.entries)) page = result.data;
      else failure = result.success ? "更早的记录暂时读不出来。" : result.error.message;
    } catch (error) {
      failure = error instanceof Error ? error.message : "更早的记录暂时读不出来。";
    }
    if (loadMoreRequest.current !== request) return;
    loadMoreRequest.current = null;
    setLoadingMore(false);
    if (page) setOlderPages({ base, pages: [...previous, page] });
    else setLoadMoreError(failure);
  }

  const view = merged ? agentLedgerToSurfaceView(merged, mode) : null;

  return (
    <AppScreen
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
          loadMoreError={loadMoreError}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          onTransition={(entry, transition, selectedOperationIds) =>
            void applyTransition(entry, transition, selectedOperationIds)
          }
          pending={pending}
          selectedEntryId={mode === "all" ? selectedEntryId : undefined}
          view={view}
        />
      ) : null}
    </AppScreen>
  );
}

export function AllActionsAgentLedgerScreen({
  selectedEntryId
}: {
  selectedEntryId?: string | undefined;
} = {}) {
  return <AgentLedgerScreen mode="all" selectedEntryId={selectedEntryId} />;
}
