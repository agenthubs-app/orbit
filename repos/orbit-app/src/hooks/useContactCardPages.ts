import { useCallback, useState } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { contactsListPath, type ContactsListPathInput } from "../api/endpoints";
import { contactCardPageSchema, contactCardSummarySchema } from "../api/schema/contact-card-page";
import type { ContactCardPageDTO, ContactCardSummaryDTO } from "../api/contract/contact-card-page";
import { validateApiResourceState } from "../api/validated-resource-state";
import { useApiResource, type ApiResourceState } from "./useApiResource";

export function useContactCardPages(filters: ContactsListPathInput, consumerScope?: string) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const query = contactsListPath(filters).split("?")[1] ?? "";
  const scope = JSON.stringify([server.baseUrl, auth.actorId, auth.cookieHeader, consumerScope, query]);
  const [position, setPosition] = useState<{ scope: string; cursor: string | null }>({ scope, cursor: null });
  const cursor = position.scope === scope ? position.cursor : null;
  const pageParams = new URLSearchParams(query);
  pageParams.set("limit", "30");
  if (cursor) pageParams.set("cursor", cursor);
  const enabled = auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId);
  const rawPage = useApiResource<unknown>(`/api/contacts/page?${pageParams}`, data => contactCardPageSchema.safeParse(data).success && (data as ContactCardPageDTO).items.length === 0,
    { scopeKey: JSON.stringify([scope, cursor]), cachePolicy: "network-only", enabled });
  const rawSummary = useApiResource<unknown>(`/api/contacts/summary${query ? `?${query}` : ""}`, () => false,
    { scopeKey: scope, cachePolicy: "network-only", enabled });
  const pageState = validateApiResourceState(rawPage, contactCardPageSchema.refine(page => page.hasMore === Boolean(page.nextCursor)));
  const summaryState = validateApiResourceState(rawSummary, contactCardSummarySchema);
  const refresh = useCallback(() => {
    setPosition({ scope, cursor: null }); rawPage.refresh(); rawSummary.refresh();
  }, [scope, rawPage.refresh, rawSummary.refresh]);
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
  const nextCursor = page?.nextCursor;
  const nextPage = useCallback(() => { if (nextCursor) setPosition({ scope, cursor: nextCursor }); }, [scope, nextCursor]);
  const firstPage = useCallback(() => setPosition({ scope, cursor: null }), [scope]);
  return { state, page, summary, nextPage, firstPage, isFirstPage: cursor === null };
}
