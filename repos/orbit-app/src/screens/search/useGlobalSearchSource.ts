// LF11: where the global search answers from. With the device mirror's contacts readable, people (and offline the
// conversations) are searched on the device and the server is asked only for events and conversations — one request
// per query, none for the 人 chip; offline the device answers alone. Without a readable mirror (a browser without
// one, the first sync) the server answers everything as before (search-api.ts).
import { useCallback, useMemo, useState } from "react";
import type { ZodType } from "zod";

import type { GlobalSearchResponse } from "../../api/contract/global-search";
import { globalSearchResponseSchema } from "../../api/schema/global-search";
import { useDeviceMirror } from "../../hooks/useDeviceMirror";
import { useLocalAiSessions } from "../../hooks/useLocalAiSessions";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { read } from "../events/v2/events-api";
import { useNetworkMerge } from "../network/useNetworkMerge";
import { localGlobalSearch } from "./local-global-search";
import { createSearchApi, type SearchApi } from "./search-api";

export function useGlobalSearchSource(): SearchApi & { eventsOffline: boolean } {
  const client = useOrbitApiClient();
  const { language } = useOrbitLocale();
  const mirror = useDeviceMirror();
  const contacts = useLocalContacts(false);
  const sessions = useLocalAiSessions(false);
  const onDevice = mirror && contacts.available && contacts.freshness.readable;
  const merge = useNetworkMerge(onDevice);
  const server = useMemo(() => createSearchApi(client), [client]);
  const [eventsOffline, setEventsOffline] = useState(false);
  const rows = contacts.rows, sessionRows = sessions.rows, goalIds = merge.goalIds;
  const search = useCallback<SearchApi["search"]>(async (input) => {
    if (!onDevice) return server.search(input);
    const query = input.query.trim();
    let answer: GlobalSearchResponse | null = null;
    if (query && input.filter !== "people") {
      const types = input.filter === "all" ? "events,conversations" : input.filter;
      const params = new URLSearchParams({ q: query, types, platform: "app" });
      if (input.limit) params.set("limit", String(input.limit));
      const result = await read(client.get<unknown>(`/api/search/global?${params.toString()}`), globalSearchResponseSchema as ZodType<GlobalSearchResponse>);
      setEventsOffline(!result.ok && result.reason === "network");
      answer = result.ok ? result.data : null;
    }
    return { ok: true, data: localGlobalSearch({ ...input, language, now: new Date(), contacts: rows, goalIds, sessions: sessionRows, server: answer }) };
  }, [client, goalIds, language, onDevice, rows, server, sessionRows]);
  return useMemo(() => ({ search, eventsOffline }), [eventsOffline, search]);
}
