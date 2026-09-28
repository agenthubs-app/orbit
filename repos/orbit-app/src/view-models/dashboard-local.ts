import { dashboardGraphFromSyncRows, dashboardGraphSyncRow, type DashboardGraphSyncRow } from "../api/compute/dashboard-graph";
import { computeDashboardSections, referencedContactIds, type DashboardLocalSections } from "../api/compute/dashboard-local";
import type { ContactSyncPayload } from "../api/contract/contact-local-directory";

/**
 * Sprint 0117 (dashboard D3): the dashboard and the contacts analysis from the
 * device's copy of the sync domain "dashboard-graph". The rows are the
 * server's own graph records and the sections are computed by the server's
 * own code (api/compute, copied from orbits/shared/compute), so every number
 * and list equals what the server would answer for the same data.
 */

/** Recent activity items on the dashboard and the contacts analysis (the server read asked for 4). */
export const LOCAL_DASHBOARD_ACTIVITY_LIMIT = 4;

export interface LocalDashboardRecord { id: string; payload: unknown }

/** Mirror rows the graph can use; a malformed row is ignored, never half-built. */
export function dashboardGraphRows(records: readonly LocalDashboardRecord[]): DashboardGraphSyncRow[] {
  return records.flatMap((record) => {
    const row = dashboardGraphSyncRow(record.payload);
    return row && record.id === `${row.collection}/${row.recordId}` ? [row] : [];
  });
}

export function localDashboardSections(rows: readonly DashboardGraphSyncRow[], input: { actorId: string; now: string }): Promise<DashboardLocalSections> {
  return computeDashboardSections(dashboardGraphFromSyncRows(rows), { actorId: input.actorId, now: input.now, activityLimit: LOCAL_DASHBOARD_ACTIVITY_LIMIT });
}

/**
 * The contacts section of the contacts analysis: the contacts the page shows
 * (the server's own choice, referencedContactIds) named from the device copy of
 * the contacts domain, plus role counts over every contact of the graph.
 */
export function localContactsAnalysisContacts(sections: DashboardLocalSections, contacts: readonly ContactSyncPayload[]): Record<string, unknown> {
  const ids = referencedContactIds({ aggregate: sections.aggregate, opportunities: sections.opportunities });
  const byContactId = new Map(contacts.flatMap((row) => (row.card ? [[row.card.id, row] as const] : [])));
  const listed = ids.flatMap((id) => {
    const row = byContactId.get(id);
    if (!row?.card) return [];
    const detail = row.detail && typeof row.detail.contact === "object" && row.detail.contact !== null ? row.detail.contact as Record<string, unknown> : {};
    return [{
      ...detail,
      id: row.card.id,
      displayName: row.card.displayName,
      organization: row.card.organization,
      role: row.card.role,
      status: row.card.status,
      nextAction: row.card.nextActionPreview,
      ...(row.card.pendingInitialization ? { lifecycleInitialization: "pending" } : {}),
    }];
  });
  return { state: "success", query: "", appliedFilters: {}, availableFilters: {}, contacts: listed, roleCounts: sections.roleCounts, summary: "", nextAction: "" };
}
