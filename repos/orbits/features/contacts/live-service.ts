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
} from "./contact-graph-query";
import type { LocalRemoteContactGraph } from "./contact-graph-provider";
import type { ContactsListSearchAndFilterService } from "./service";

type LiveContactsProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveContactDetailStoredNote {
  authorLabel: string;
  body: string;
  createdAt: string;
  noteId: string;
  privacy?: "private" | "relationship_shared";
  sourceLabel?: string;
}

export interface LiveContactDetailStoredInteraction {
  channel: string;
  occurredAt: string;
  summary: string;
}

export interface LiveContactDetailState {
  actorId: string;
  contactId: string;
  lastInteraction?: LiveContactDetailStoredInteraction;
  notes: readonly LiveContactDetailStoredNote[];
  status: string;
  tags: readonly string[];
  updatedAt: string;
}

export interface LiveContactsGraphProvider {
  source: string;
  sourceLabel: string;
  readContactGraph: (
    actorId?: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactGraphForList?: (
    input: ContactsListSearchFilterInput,
    actorId?: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactGraphForContact?: (
    contactId: string,
    actorId?: string,
  ) => LiveContactsProviderResult<LocalRemoteContactGraph>;
  readContactDetailState?: (
    contactId: string,
    actorId: string,
  ) => LiveContactsProviderResult<LiveContactDetailState | null>;
  upsertContactDetailState?: (
    state: LiveContactDetailState,
  ) => LiveContactsProviderResult<LiveContactDetailState>;
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

function actorRequiredFailure(): ContactsListSearchFailure {
  const definition =
    CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS.CONTACTS_ACTOR_REQUIRED;
  const provenance = unconfiguredProvenance();

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: ["evidence:contacts-actor-required"],
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

  const actorId = input.actorId?.trim();
  if (!actorId) {
    return actorRequiredFailure();
  }

  const graph = provider.readContactGraphForList
    ? await provider.readContactGraphForList(input, actorId)
    : await provider.readContactGraph(actorId);

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
