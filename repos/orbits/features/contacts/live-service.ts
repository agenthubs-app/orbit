import {
  CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS,
  type ContactsListSearchFailure,
  type ContactsListSearchFilterInput,
  type ContactsListSearchProvenance,
  type ContactsListSearchResult,
} from "./contract";
import {
  runContactsGraphQuery,
  type ContactsGraphQueryContext,
} from "./contacts-list-search-and-filter-mock/hybrid-service";
import type { LocalRemoteContactGraph } from "./contacts-list-search-and-filter-mock/providers/contact-local-remote-provider";
import type { ContactsListSearchAndFilterService } from "./service";

type LiveContactsProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveContactsGraphProvider {
  source: string;
  sourceLabel: string;
  readContactGraph: () => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactGraphForList?: (
    input?: ContactsListSearchFilterInput,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactGraphForContact?: (
    contactId: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
}

export interface LiveContactsListSearchAndFilterServiceOptions {
  provider?: LiveContactsGraphProvider | null;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function unconfiguredProvenance(): ContactsListSearchProvenance {
  return {
    source: "live-record-store:contacts:unconfigured",
    sourceLabel: "Unconfigured Contacts live store",
    evidenceIds: ["evidence:contacts-live-store-unconfigured"],
    collectedAt: new Date(0).toISOString(),
    privacy: "live-contacts-list-search-filter",
    generationMethod: "live-store-query",
    searchIndexReadExecuted: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function unconfiguredFailure(): ContactsListSearchFailure {
  const definition =
    CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS.CONTACTS_LIVE_STORE_UNCONFIGURED;
  const provenance = unconfiguredProvenance();

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function graphQueryContext(
  provider: LiveContactsGraphProvider,
): ContactsGraphQueryContext {
  return {
    databaseQueryExecuted: true,
    generationMethod: "live-store-query",
    honorScenarios: false,
    privacy: "live-contacts-list-search-filter",
    source: provider.source,
    sourceLabel: provider.sourceLabel,
  };
}

async function runLiveContactsQuery(
  provider: LiveContactsGraphProvider | null,
  input: ContactsListSearchFilterInput = {},
): Promise<ContactsListSearchResult> {
  if (!provider) {
    return unconfiguredFailure();
  }

  const graph = provider.readContactGraphForList
    ? await provider.readContactGraphForList(input)
    : await provider.readContactGraph();

  return clonePayload(
    runContactsGraphQuery(
      graph,
      input,
      graphQueryContext(provider),
    ),
  );
}

export function createLiveContactsListSearchAndFilterService({
  provider = null,
}: LiveContactsListSearchAndFilterServiceOptions = {}): ContactsListSearchAndFilterService {
  return {
    listContacts(input = {}) {
      return runLiveContactsQuery(provider, input);
    },

    searchContacts(input = {}) {
      return runLiveContactsQuery(provider, input);
    },
  };
}
