// R11a 人脈（App）: the list and its counts. Where the device mirror is the source (native, and the browser with
// an active mirror) everything — tabs, 絞り込み, search, summary — is computed on the device with the server's
// rules, so it works in airplane mode. Elsewhere it reads the bounded server pages with the same parameters.
import { useCallback, useMemo, useState } from "react";

import type { ContactCardDTO, ContactCardSummaryDTO } from "../../api/contract/contact-card-page";
import type { LocalContactDirectoryQuery } from "../../api/contract/contact-local-directory";
import { contactCardPageSchema, contactCardSummarySchema } from "../../api/schema/contact-card-page";
import { localContactDirectory, localContactDirectorySummary } from "../../api/schema/contact-local-directory";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { withLegacyNetworkFields } from "../../view-models/contacts-local";
import type { useNetworkDesignContacts } from "./network-design-fixture";

export type NetworkListStatus = "loading" | "ready" | "failure";

export interface NetworkListState {
  status: NetworkListStatus;
  items: ContactCardDTO[];
  /** Facets over every contact (header, tabs, density card, 絞り込み counts). */
  summary: ContactCardSummaryDTO | null;
  /** People matching the current tab, filters and search. */
  matched: number;
  hasMore: boolean;
  loadMore(): void;
  refresh(): void;
  offline: boolean;
  lastSyncedAt: string | null;
  fromDevice: boolean;
  failure: string | null;
}

/** Server query string for GET /api/contacts/page|summary (the web App without a mirror). */
export function networkServerQuery(query: LocalContactDirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  const list = (key: string, values?: readonly string[] | null) => values?.filter(Boolean).forEach((value) => params.append(key, value));
  list("status", query.statusFilters);
  list("industry", query.industryFilters);
  list("region", query.regionFilters);
  list("met", query.metFilters);
  list("density", query.densityFilters);
  if (query.goalRelated) params.set("goalRelated", "1");
  if (query.needsFollowUp) params.set("needsFollowUp", "1");
  return params.toString();
}

export function useNetworkList(query: LocalContactDirectoryQuery, fixture?: ReturnType<typeof useNetworkDesignContacts>): NetworkListState {
  const local = useLocalContacts();
  const sourceRows = fixture?.enabled ? fixture.data?.rows ?? [] : local.rows;
  const rows = useMemo(() => sourceRows.map(withLegacyNetworkFields), [sourceRows]);
  const merge = { goalRelatedIds: query.goalRelatedIds ?? null, followUpContactIds: query.followUpContactIds ?? null, monthStart: query.monthStart ?? null };
  const deviceSummary = useMemo(() => (local.available ? { ...localContactDirectorySummary(rows, { ...merge, query: query.query ?? null }), asOf: fixture?.enabled ? fixture.lastSyncedAt ?? new Date(0).toISOString() : local.freshness.lastSyncedAt ?? new Date(0).toISOString() } : null),
    [local.available, rows, JSON.stringify(merge), query.query, local.freshness.lastSyncedAt, fixture?.enabled, fixture?.lastSyncedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const deviceItems = useMemo(() => (local.available ? localContactDirectory(rows, query).flatMap((row) => (row.card ? [row.card] : [])) : []),
    [local.available, rows, JSON.stringify(query)]); // eslint-disable-line react-hooks/exhaustive-deps

  const serverQuery = networkServerQuery(query);
  const [cursor, setCursor] = useState<{ query: string; value: string | null }>({ query: serverQuery, value: null });
  const pageParams = new URLSearchParams(serverQuery);
  pageParams.set("limit", "30");
  const currentCursor = cursor.query === serverQuery ? cursor.value : null;
  if (currentCursor) pageParams.set("cursor", currentCursor);
  const enabled = !local.available;
  const rawPage = useApiResource<unknown>(`/api/contacts/page?${pageParams}`, () => false, { scopeKey: JSON.stringify([serverQuery, currentCursor]), cachePolicy: "network-only", enabled });
  const rawSummary = useApiResource<unknown>(`/api/contacts/summary`, () => false, { scopeKey: "network-summary", cachePolicy: "network-only", enabled });
  const rawMatched = useApiResource<unknown>(`/api/contacts/summary?${serverQuery}`, () => false, { scopeKey: JSON.stringify(["matched", serverQuery]), cachePolicy: "network-only", enabled });
  const pageState = validateApiResourceState(rawPage, contactCardPageSchema);
  const summaryState = validateApiResourceState(rawSummary, contactCardSummarySchema);
  const matchedState = validateApiResourceState(rawMatched, contactCardSummarySchema);
  const localRefresh = local.refresh;
  const refresh = useCallback(() => {
    if (fixture?.enabled) fixture.refresh();
    else if (local.available) localRefresh();
    else { setCursor({ query: serverQuery, value: null }); rawPage.refresh(); rawSummary.refresh(); rawMatched.refresh(); }
  }, [fixture?.enabled, fixture?.refresh, local.available, localRefresh, serverQuery, rawPage.refresh, rawSummary.refresh, rawMatched.refresh]);

  if (local.available) {
    const loading = fixture?.enabled ? fixture.loading : local.freshness.loading && rows.length === 0;
    return {
      status: loading ? "loading" : (fixture?.enabled ? fixture.failure : local.freshness.failure) !== null && rows.length === 0 ? "failure" : "ready",
      items: deviceItems, summary: deviceSummary, matched: deviceItems.length, hasMore: false, loadMore: () => undefined, refresh,
      offline: fixture?.enabled ? fixture.offline : local.freshness.offline,
      lastSyncedAt: fixture?.enabled ? fixture.lastSyncedAt : local.freshness.lastSyncedAt,
      fromDevice: true, failure: fixture?.enabled ? fixture.failure : local.freshness.failure,
    };
  }
  const page = pageState.kind === "success" || pageState.kind === "empty" ? pageState.data : null;
  const summary = summaryState.kind === "success" || summaryState.kind === "empty" ? summaryState.data as ContactCardSummaryDTO : null;
  const matched = matchedState.kind === "success" || matchedState.kind === "empty" ? (matchedState.data as ContactCardSummaryDTO).total : page?.items.length ?? 0;
  const failed = [pageState, summaryState].find((state) => state.kind === "failure" || state.kind === "offline");
  return {
    status: failed ? "failure" : page && summary ? "ready" : "loading",
    items: (page?.items ?? []) as ContactCardDTO[],
    summary,
    matched,
    hasMore: page?.hasMore ?? false,
    loadMore: () => { if (page?.nextCursor) setCursor({ query: serverQuery, value: page.nextCursor }); },
    refresh,
    offline: failed?.kind === "offline",
    lastSyncedAt: null,
    fromDevice: false,
    failure: failed && "error" in failed ? failed.error.message : null,
  };
}
