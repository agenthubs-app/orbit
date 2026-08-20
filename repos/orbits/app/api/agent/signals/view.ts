import type {
  AgentSignal,
  AgentSignalRefreshResult,
  AgentSignalService,
} from "../../../../features/agent/signals/contract";
import { selectAgentHomeSignals } from "../../../../features/agent/signals/home-selection";

function requestsHomeView(url: URL): boolean {
  return url.searchParams.get("view") === "home";
}

export async function listAgentSignalsForView(
  service: AgentSignalService,
  url: URL,
): Promise<readonly AgentSignal[]> {
  if (requestsHomeView(url)) {
    return selectAgentHomeSignals(
      await service.list({ includeResolved: true, limit: 100 }),
    );
  }

  return service.list({
    includeResolved: url.searchParams.get("includeResolved") === "true",
    limit: Number(url.searchParams.get("limit") ?? 30),
  });
}

export async function agentSignalRefreshForView(
  service: AgentSignalService,
  url: URL,
  result: AgentSignalRefreshResult,
): Promise<AgentSignalRefreshResult> {
  if (!requestsHomeView(url)) return result;

  return {
    ...result,
    signals: selectAgentHomeSignals(
      await service.list({ includeResolved: true, limit: 100 }),
    ),
  };
}
