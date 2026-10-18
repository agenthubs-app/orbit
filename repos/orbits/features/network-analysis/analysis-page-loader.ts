/**
 * R11b: what the Web 人脈分析 page reads on the server (app/(app)/app/contacts/dashboard/page.tsx).
 *
 * 1. The view (analysis-reader): below 10 people only the R11a total is read and nothing else happens below.
 * 2. Only when open: the snapshot view in the page language (zh / en / ja — B-7; ja without Japanese sentences shows none)
 *    and the names of its evidence people (this owner's contacts only). A failed snapshot read is "failed": the
 *    deterministic numbers still render, no cached sentence is shown as current (B-8).
 * The mocked capability (`ORBIT_REDESIGN_MOCK=network-analysis`, never production) reads the fixture world instead.
 */
import type { ContactCardActor } from "../contacts/card-service";
import { redesignContractMode } from "../redesign-contracts/route";
import type { OrbitLanguage } from "../../shared/contract/language";
import type { NetworkAnalysisViewDTO } from "../../shared/contract/network-analysis-view";
import type { NetworkSnapshotView } from "./contract";
import { loadNetworkAnalysisView, type NetworkAnalysisReadDeps } from "./analysis-reader";
import { resolveNetworkAnalysisReadDeps } from "./analysis-handlers";

export interface NetworkAnalysisPageData {
  view: NetworkAnalysisViewDTO | null;
  snapshot: NetworkSnapshotView | "failed" | null;
  evidenceNames: Record<string, { contactId: string; name: string }>;
}

export interface NetworkAnalysisPageDeps {
  readDeps: () => Promise<NetworkAnalysisReadDeps>;
  readSnapshot: (actorId: string, language: OrbitLanguage) => Promise<NetworkSnapshotView | null>;
  readNames: (actorId: string, recordIds: readonly string[]) => Promise<Record<string, { contactId: string; name: string }>>;
}

function log(event: string, error: unknown) {
  console.error(JSON.stringify({ event, error: error instanceof Error ? error.name : "unknown" }));
}

export async function defaultNetworkAnalysisPageDeps(): Promise<NetworkAnalysisPageDeps> {
  if (redesignContractMode("network-analysis") === "mock") {
    const { activeNetworkFixture, fixtureNetworkSnapshotView } = await import("./analysis-fixtures");
    return {
      readDeps: resolveNetworkAnalysisReadDeps,
      readSnapshot: async (_actorId, language) => fixtureNetworkSnapshotView(language),
      readNames: async (_actorId, ids) => {
        const rows = new Map(activeNetworkFixture().rows.map((row) => [row.id, row.name]));
        return Object.fromEntries(ids.flatMap((id) => (rows.has(id) ? [[id, { contactId: id, name: rows.get(id)! }]] : [])));
      },
    };
  }
  const { getConfiguredNetworkAnalysisRuntime } = await import("./runtime");
  const { readEvidenceContactNames } = await import("./evidence-contacts");
  const runtime = getConfiguredNetworkAnalysisRuntime();
  return {
    readDeps: resolveNetworkAnalysisReadDeps,
    readSnapshot: async (actorId, language) => (runtime ? runtime.service.readView(actorId, language) : null),
    readNames: async (actorId, ids) => {
      if (!runtime || ids.length === 0) return {};
      const names = await readEvidenceContactNames({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId, ids);
      return Object.fromEntries([...names.entries()]);
    },
  };
}

export async function loadNetworkAnalysisPage(actor: ContactCardActor, language: OrbitLanguage, deps?: NetworkAnalysisPageDeps): Promise<NetworkAnalysisPageData> {
  const resolved = deps ?? await defaultNetworkAnalysisPageDeps();
  let view: NetworkAnalysisViewDTO | null;
  try {
    view = await loadNetworkAnalysisView(actor, await resolved.readDeps());
  } catch (error) {
    log("network_analysis_page_view_failed", error);
    return { view: null, snapshot: null, evidenceNames: {} };
  }
  if (view.lock.state !== "open") return { view, snapshot: null, evidenceNames: {} };
  let snapshot: NetworkSnapshotView | "failed" | null;
  try {
    snapshot = await resolved.readSnapshot(actor.id, language);
  } catch (error) {
    log("network_analysis_page_snapshot_failed", error);
    snapshot = "failed";
  }
  const ids = snapshot && snapshot !== "failed" ? [...new Set(snapshot.blocks.flatMap((block) => block.evidence.contactIds))].slice(0, 30) : [];
  const evidenceNames = await resolved.readNames(actor.id, ids).catch((error: unknown) => { log("network_analysis_page_names_failed", error); return {}; });
  return { view, snapshot, evidenceNames };
}
