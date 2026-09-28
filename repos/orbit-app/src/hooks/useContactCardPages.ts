import { useCallback, useMemo, useState } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { contactsListPath, type ContactsListPathInput } from "../api/endpoints";
import { contactCardPageSchema, contactCardSummarySchema } from "../api/schema/contact-card-page";
import type { ContactCardPageDTO, ContactCardSummaryDTO } from "../api/contract/contact-card-page";
import { validateApiResourceState } from "../api/validated-resource-state";
import { localContactCardPage, localContactCardSummary } from "../view-models/contacts-local";
import { useApiResource, type ApiResourceState } from "./useApiResource";
import { useLocalContacts } from "./useLocalContacts";

export interface ContactCardPagesState {
  state: ApiResourceState<ContactCardPageDTO>;
  page: ContactCardPageDTO | null;
  summary: ContactCardSummaryDTO | null;
  nextPage(): void;
  firstPage(): void;
  isFirstPage: boolean;
  /** Sprint 0116: the list is the device copy and the last sync failed; show 「截至」 and disable writes. */
  offline: boolean;
  lastSyncedAt: string | null;
  /** The list comes from the device mirror (no page/summary request). */
  fromDevice: boolean;
}

/**
 * The contacts list. Sprint 0116: where the device mirror is this platform's
 * source (native; the browser when its mirror is active) the list, its search
 * and its summary are computed from the mirror with the server's own rules and
 * no page request is sent — opening the page costs one conditional manifest
 * read. Elsewhere (an online-only browser) it keeps the bounded server pages.
 */
export function useContactCardPages(filters: ContactsListPathInput, consumerScope?: string): ContactCardPagesState {
  const local = useLocalContacts();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const query = contactsListPath(filters).split("?")[1] ?? "";
  const scope = JSON.stringify([server.baseUrl, auth.actorId, auth.cookieHeader, consumerScope, query]);
  const [position, setPosition] = useState<{ scope: string; cursor: string | null }>({ scope, cursor: null });
  const cursor = position.scope === scope ? position.cursor : null;
  const signedIn = auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId);
  const network = useNetworkContactCardPages(query, scope, cursor, signedIn && !local.available);
  const fromDevice = local.available;
  const localFilters = useMemo(() => ({
    query: filters.query ?? null, sourceFilters: filters.sourceFilters ?? [], statusFilters: filters.statusFilters ?? [],
    tagFilters: filters.tagFilters ?? [], valueFilters: filters.valueFilters ?? [],
  }), [JSON.stringify([filters.query, filters.sourceFilters, filters.statusFilters, filters.tagFilters, filters.valueFilters])]);
  const localResult = useMemo(() => {
    if (!fromDevice || !local.freshness.readable) return null;
    const asOf = local.freshness.lastSyncedAt ?? new Date(0).toISOString();
    return { page: localContactCardPage(local.rows, localFilters, cursor, asOf), summary: localContactCardSummary(local.rows, localFilters, asOf) };
  }, [fromDevice, local.freshness.readable, local.freshness.lastSyncedAt, local.rows, localFilters, cursor]);
  const localRefresh = local.refresh;
  const refresh = useCallback(() => {
    setPosition({ scope, cursor: null });
    if (fromDevice) localRefresh(); else network.refresh();
  }, [scope, fromDevice, localRefresh, network.refresh]);
  let state: ApiResourceState<ContactCardPageDTO>;
  let page: ContactCardPageDTO | null;
  let summary: ContactCardSummaryDTO | null;
  if (fromDevice) {
    const controls = { refresh, refreshing: local.freshness.refreshing };
    page = localResult?.page ?? null;
    summary = localResult?.summary ?? null;
    // The device copy is not an HTTP answer: no status of its own, no server meta.
    const meta = { featureMode: null, privacy: null, runtimeBoundary: null };
    state = !signedIn || local.freshness.loading
      ? { kind: "loading", ...controls }
      : local.freshness.failure !== null && !localResult
        ? { kind: "offline", error: { code: "SYNC_UNAVAILABLE", message: local.freshness.failure }, meta, status: 0, ...controls }
        : page && summary
          ? { kind: page.items.length === 0 ? "empty" : "success", data: page, meta, status: 200, ...controls }
          : { kind: "loading", ...controls };
  } else {
    state = network.state.kind === "loading" || network.state.kind === "failure" || network.state.kind === "offline"
      ? { ...network.state, refresh, refreshing: network.state.refreshing }
      : { ...network.state, refresh };
    page = network.page;
    summary = network.summary;
  }
  const nextCursor = page?.nextCursor;
  const nextPage = useCallback(() => { if (nextCursor) setPosition({ scope, cursor: nextCursor }); }, [scope, nextCursor]);
  const firstPage = useCallback(() => setPosition({ scope, cursor: null }), [scope]);
  return {
    state, page, summary, nextPage, firstPage, isFirstPage: cursor === null,
    offline: fromDevice && local.freshness.offline, lastSyncedAt: fromDevice ? local.freshness.lastSyncedAt : null, fromDevice,
  };
}

/** The bounded server pages (sprint 0101), used where the device mirror is not the source. */
function useNetworkContactCardPages(query: string, scope: string, cursor: string | null, enabled: boolean) {
  const pageParams = new URLSearchParams(query);
  pageParams.set("limit", "30");
  if (cursor) pageParams.set("cursor", cursor);
  const rawPage = useApiResource<unknown>(`/api/contacts/page?${pageParams}`, data => contactCardPageSchema.safeParse(data).success && (data as ContactCardPageDTO).items.length === 0,
    { scopeKey: JSON.stringify([scope, cursor]), cachePolicy: "network-only", enabled });
  const rawSummary = useApiResource<unknown>(`/api/contacts/summary?${query}`, () => false,
    { scopeKey: scope, cachePolicy: "network-only", enabled });
  const pageState = validateApiResourceState(rawPage, contactCardPageSchema.refine(page => page.hasMore === Boolean(page.nextCursor)));
  const summaryState = validateApiResourceState(rawSummary, contactCardSummarySchema);
  const refresh = useCallback(() => { rawPage.refresh(); rawSummary.refresh(); }, [rawPage.refresh, rawSummary.refresh]);
  const controls = { refresh, refreshing: rawPage.refreshing || rawSummary.refreshing };
  let state: ApiResourceState<ContactCardPageDTO>;
  let page: ContactCardPageDTO | null = null;
  let summary: ContactCardSummaryDTO | null = null;
  if (!enabled) state = { kind: "loading", ...controls };
  else if (pageState.kind === "failure" || pageState.kind === "offline") state = { ...pageState, ...controls };
  else if (summaryState.kind === "failure" || summaryState.kind === "offline") state = { ...summaryState, ...controls };
  else if ((pageState.kind === "success" || pageState.kind === "empty") && (summaryState.kind === "success" || summaryState.kind === "empty")) {
    page = pageState.data; summary = summaryState.data; state = { ...pageState, ...controls };
  } else state = { kind: "loading", ...controls };
  return { state, page, summary, refresh };
}
