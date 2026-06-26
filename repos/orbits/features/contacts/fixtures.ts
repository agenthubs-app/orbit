import {
  CONTACTS_LIST_SEARCH_FILTER_FIXTURE_SOURCE,
  CONTACT_SOURCE_FILTERS,
  CONTACT_STATUS_FILTERS,
  CONTACT_TAG_FILTERS,
  CONTACT_VALUE_FILTERS,
  type ContactEvidence,
  type ContactFilterOption,
  type ContactListItem,
  type ContactSourceFilter,
  type ContactSourceReference,
  type ContactStatusFilter,
  type ContactTagFilter,
  type ContactValueFilter,
  type ContactsAppliedFilters,
  type ContactsAvailableFilters,
  type ContactsListSearchFilterInput,
  type ContactsListSearchPayload,
  type ContactsListSearchProvenance,
} from "./contract";

const fixtureCollectedAt = "2026-06-25T17:00:00.000Z";
const fixtureCapturedAt = "2026-06-25T17:08:00.000Z";

const sourceLabels: Record<ContactSourceFilter, string> = {
  business_card_ocr: "Business card OCR",
  calendar_signal: "Calendar signal",
  email_signal: "Email signal",
  event_import: "Event import",
  external_contacts: "External contacts",
  manual: "Manual note",
  qr_scan: "QR scan",
  referral: "Referral",
};

const tagLabels: Record<ContactTagFilter, string> = {
  "event:climate-founders-dinner": "Climate founders dinner",
  "priority:nurture": "Nurture priority",
  "priority:warm-follow-up": "Warm follow-up",
  "source:event-import": "Event import source",
  "source:external-import": "External import source",
  "topic:community": "Community context",
  "topic:storage-pilots": "Storage pilots",
  "topic:venture-ecosystem": "Venture ecosystem",
};

const valueLabels: Record<ContactValueFilter, string> = {
  commercial_opportunity: "Commercial opportunity",
  community_context: "Community context",
  knowledge_exchange: "Knowledge exchange",
  referral_path: "Referral path",
  strategic_fit: "Strategic fit",
};

const statusLabels: Record<ContactStatusFilter, string> = {
  active: "Active",
  archived: "Archived",
  needs_follow_up: "Needs follow-up",
  nurture: "Nurture",
};

export const mockContactSources = {
  hana: {
    type: "external_contacts",
    id: "source:contacts-list:hana-external-import",
    label: "External contacts import fixture",
    evidenceId: "evidence:contacts-list-hana",
  },
  kenji: {
    type: "manual",
    id: "source:contacts-list:kenji-manual-note",
    label: "Manual dinner note fixture",
    evidenceId: "evidence:contacts-list-kenji",
  },
  mina: {
    type: "event_import",
    id: "source:contacts-list:mina-event-roster",
    label: "Event roster fixture",
    evidenceId: "evidence:contacts-list-mina",
  },
  omar: {
    type: "email_signal",
    id: "source:contacts-list:omar-email-signal",
    label: "Email signal fixture",
    evidenceId: "evidence:contacts-list-omar",
  },
} as const satisfies Record<string, ContactSourceReference>;

export const mockContactEvidence: readonly ContactEvidence[] = [
  {
    evidenceId: "evidence:contacts-list-kenji",
    source: mockContactSources.kenji,
    excerpt:
      "Manual note says Kenji Watanabe asked for an operator intro after the climate founders dinner.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contacts-list-search-and-filter-service",
  },
  {
    evidenceId: "evidence:contacts-list-hana",
    source: mockContactSources.hana,
    excerpt:
      "External contacts fixture links Hana Sato to the climate community dinner follow-up list.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contacts-list-search-and-filter-service",
  },
  {
    evidenceId: "evidence:contacts-list-omar",
    source: mockContactSources.omar,
    excerpt:
      "Email signal fixture says Omar Rahman offered venture ecosystem introductions.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contacts-list-search-and-filter-service",
  },
  {
    evidenceId: "evidence:contacts-list-mina",
    source: mockContactSources.mina,
    excerpt:
      "Event roster fixture marks Mina Tan as a storage pilot distribution partner.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contacts-list-search-and-filter-service",
  },
];

function evidenceFor(evidenceId: string): readonly ContactEvidence[] {
  return mockContactEvidence.filter(
    (evidence) => evidence.evidenceId === evidenceId,
  );
}

export const mockContactListItems: readonly ContactListItem[] = [
  {
    id: "contact:kenji-watanabe",
    displayName: "Kenji Watanabe",
    role: "Founder",
    organization: "Aster Grid",
    location: "Tokyo",
    relationshipContext:
      "Met at the climate founders dinner and discussed storage pilot operators.",
    lastInteractionAt: "2026-06-18T20:30:00.000Z",
    nextAction: "Send Kenji the storage pilot operator intro by Friday.",
    source: mockContactSources.kenji,
    evidence: evidenceFor("evidence:contacts-list-kenji"),
    tags: [
      "event:climate-founders-dinner",
      "topic:storage-pilots",
      "priority:warm-follow-up",
    ],
    value: {
      score: 91,
      valueTypes: ["commercial_opportunity", "referral_path"],
      rationale:
        "Kenji has a concrete operator intro request and a near-term pilot path.",
      evidenceIds: ["evidence:contacts-list-kenji"],
    },
    status: "needs_follow_up",
    databaseQueryExecuted: false,
    searchIndexReadExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "contact:hana-sato",
    displayName: "Hana Sato",
    role: "Community Lead",
    organization: "Tokyo Climate Guild",
    location: "Tokyo",
    relationshipContext:
      "Imported as a community contact from the climate dinner after-party.",
    lastInteractionAt: "2026-06-19T09:15:00.000Z",
    nextAction: "Ask Hana whether the guild wants a founder roundtable.",
    source: mockContactSources.hana,
    evidence: evidenceFor("evidence:contacts-list-hana"),
    tags: [
      "event:climate-founders-dinner",
      "source:external-import",
      "topic:community",
    ],
    value: {
      score: 78,
      valueTypes: ["community_context", "knowledge_exchange"],
      rationale:
        "Hana can explain community context around climate founders and operators.",
      evidenceIds: ["evidence:contacts-list-hana"],
    },
    status: "active",
    databaseQueryExecuted: false,
    searchIndexReadExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "contact:omar-rahman",
    displayName: "Omar Rahman",
    role: "Platform Partner",
    organization: "Northstar Ventures",
    location: "San Francisco",
    relationshipContext:
      "Email signal says Omar offered venture ecosystem introductions for partner diligence.",
    lastInteractionAt: "2026-06-17T14:05:00.000Z",
    nextAction: "Send Omar the partner diligence brief after warm-up context.",
    source: mockContactSources.omar,
    evidence: evidenceFor("evidence:contacts-list-omar"),
    tags: ["topic:venture-ecosystem", "priority:nurture"],
    value: {
      score: 84,
      valueTypes: ["strategic_fit", "referral_path"],
      rationale:
        "Omar is strategically relevant because he can broker venture ecosystem introductions.",
      evidenceIds: ["evidence:contacts-list-omar"],
    },
    status: "nurture",
    databaseQueryExecuted: false,
    searchIndexReadExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "contact:mina-tan",
    displayName: "Mina Tan",
    role: "Head of Partnerships",
    organization: "HarborGrid",
    location: "Singapore",
    relationshipContext:
      "Event roster ties Mina to storage pilot distribution and partner education.",
    lastInteractionAt: "2026-06-20T11:20:00.000Z",
    nextAction: "Invite Mina to the partner pilot review call.",
    source: mockContactSources.mina,
    evidence: evidenceFor("evidence:contacts-list-mina"),
    tags: ["topic:storage-pilots", "source:event-import"],
    value: {
      score: 87,
      valueTypes: ["commercial_opportunity", "knowledge_exchange"],
      rationale:
        "Mina can compare storage pilot distribution paths across partner teams.",
      evidenceIds: ["evidence:contacts-list-mina"],
    },
    status: "active",
    databaseQueryExecuted: false,
    searchIndexReadExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  },
];

export const mockContactsListProvenance: ContactsListSearchProvenance = {
  source: CONTACTS_LIST_SEARCH_FILTER_FIXTURE_SOURCE,
  sourceLabel: "Mock contacts list search and filter fixture",
  evidenceIds: [
    "evidence:contacts-list-kenji",
    "evidence:contacts-list-hana",
    "evidence:contacts-list-omar",
    "evidence:contacts-list-mina",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-contacts-list-search-filter-only",
  generationMethod: "fixture",
  searchIndexReadExecuted: false,
  databaseQueryExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyContactsListProvenance: ContactsListSearchProvenance = {
  ...mockContactsListProvenance,
  sourceLabel: "Mock empty contacts list search and filter rule",
  evidenceIds: ["evidence:contacts-list-empty"],
  generationMethod: "rule-based-contacts-list-search-filter",
};

export const mockPendingContactsListProvenance: ContactsListSearchProvenance = {
  ...mockContactsListProvenance,
  sourceLabel: "Mock pending contacts list search and filter rule",
  evidenceIds: ["evidence:contacts-list-pending"],
  generationMethod: "rule-based-contacts-list-search-filter",
};

export const mockContactsListFailureProvenance: ContactsListSearchProvenance = {
  ...mockContactsListProvenance,
  sourceLabel: "Mock contacts list search and filter controlled failure rule",
  evidenceIds: ["evidence:contacts-list-controlled-failure"],
  generationMethod: "rule-based-contacts-list-search-filter",
};

function selectedValues<TValue extends string>(
  values?: readonly (TValue | string)[] | null,
): readonly string[] {
  return values?.filter((value) => value.trim().length > 0) ?? [];
}

function filterOption<TValue extends string>(
  value: TValue,
  label: string,
  count: number,
  selected: readonly string[],
): ContactFilterOption<TValue> {
  return {
    value,
    label,
    count,
    selected: selected.includes(value),
  };
}

function buildAvailableFilters(
  appliedFilters: ContactsAppliedFilters,
): ContactsAvailableFilters {
  return {
    tags: CONTACT_TAG_FILTERS.map((tag) =>
      filterOption(
        tag,
        tagLabels[tag],
        mockContactListItems.filter((contact) => contact.tags.includes(tag))
          .length,
        appliedFilters.tagFilters,
      ),
    ),
    sources: CONTACT_SOURCE_FILTERS.map((source) =>
      filterOption(
        source,
        sourceLabels[source],
        mockContactListItems.filter((contact) => contact.source.type === source)
          .length,
        appliedFilters.sourceFilters,
      ),
    ),
    values: CONTACT_VALUE_FILTERS.map((value) =>
      filterOption(
        value,
        valueLabels[value],
        mockContactListItems.filter((contact) =>
          contact.value.valueTypes.includes(value),
        ).length,
        appliedFilters.valueFilters,
      ),
    ),
    statuses: CONTACT_STATUS_FILTERS.map((status) =>
      filterOption(
        status,
        statusLabels[status],
        mockContactListItems.filter((contact) => contact.status === status)
          .length,
        appliedFilters.statusFilters,
      ),
    ),
  };
}

function normalizeQuery(query?: string | null): string {
  return query?.trim().toLowerCase() ?? "";
}

function includesText(contact: ContactListItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const searchableText = [
    contact.displayName,
    contact.role,
    contact.organization,
    contact.location,
    contact.relationshipContext,
    contact.nextAction,
    contact.tags.join(" "),
    contact.value.valueTypes.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

function contactMatchesFilters(
  contact: ContactListItem,
  appliedFilters: ContactsAppliedFilters,
): boolean {
  return (
    includesText(contact, appliedFilters.query) &&
    appliedFilters.tagFilters.every((tag) => contact.tags.includes(tag)) &&
    (appliedFilters.sourceFilters.length === 0 ||
      appliedFilters.sourceFilters.includes(contact.source.type)) &&
    appliedFilters.valueFilters.every((value) =>
      contact.value.valueTypes.includes(value),
    ) &&
    (appliedFilters.statusFilters.length === 0 ||
      appliedFilters.statusFilters.includes(contact.status))
  );
}

function appliedFiltersFromInput(
  input: ContactsListSearchFilterInput = {},
): ContactsAppliedFilters {
  return {
    query: normalizeQuery(input.query),
    sourceFilters: selectedValues(input.sourceFilters) as ContactSourceFilter[],
    statusFilters: selectedValues(input.statusFilters) as ContactStatusFilter[],
    tagFilters: selectedValues(input.tagFilters) as ContactTagFilter[],
    valueFilters: selectedValues(input.valueFilters) as ContactValueFilter[],
  };
}

function hasActiveSearchOrFilters(
  appliedFilters: ContactsAppliedFilters,
): boolean {
  return (
    appliedFilters.query.length > 0 ||
    appliedFilters.sourceFilters.length > 0 ||
    appliedFilters.statusFilters.length > 0 ||
    appliedFilters.tagFilters.length > 0 ||
    appliedFilters.valueFilters.length > 0
  );
}

function evidenceIdsForContacts(
  contacts: readonly ContactListItem[],
): readonly string[] {
  const evidenceIds = contacts.flatMap((contact) =>
    contact.evidence.map((evidence) => evidence.evidenceId),
  );

  return evidenceIds.length > 0
    ? evidenceIds
    : ["evidence:contacts-list-empty"];
}

export function buildContactsListSearchPayload(
  input: ContactsListSearchFilterInput = {},
): ContactsListSearchPayload {
  const appliedFilters = appliedFiltersFromInput(input);
  const hasActiveRules = hasActiveSearchOrFilters(appliedFilters);
  const contacts = mockContactListItems.filter((contact) =>
    contactMatchesFilters(contact, appliedFilters),
  );
  const state = contacts.length > 0 ? "success" : "empty";
  const provenance: ContactsListSearchProvenance = {
    ...mockContactsListProvenance,
    evidenceIds: evidenceIdsForContacts(contacts),
    generationMethod: hasActiveRules
      ? "rule-based-contacts-list-search-filter"
      : "fixture",
    sourceLabel: hasActiveRules
      ? "Rule-based contacts list search and filter result"
      : mockContactsListProvenance.sourceLabel,
  };

  return {
    state,
    query: appliedFilters.query,
    appliedFilters,
    availableFilters: buildAvailableFilters(appliedFilters),
    contacts,
    summary:
      contacts.length > 0
        ? hasActiveRules
          ? `${contacts.length} mock contacts matched local search and filter rules.`
          : "Four mock contacts are available from manual, external, email, and event fixtures."
        : "No mock contacts matched the local search and filter rules.",
    provenance,
    nextAction:
      contacts.length > 0
        ? hasActiveRules
          ? "Review the matched contacts with source evidence before creating tasks."
          : "Review source-backed contacts and decide the next follow-up action."
        : "Clear the local search and filters, or add a mock contact fixture before reviewing the list.",
  };
}

export const mockContactsListFixture: ContactsListSearchPayload =
  buildContactsListSearchPayload();

export const mockFilteredContactsListFixture: ContactsListSearchPayload =
  buildContactsListSearchPayload({
    sourceFilters: ["manual"],
    statusFilters: ["needs_follow_up"],
    tagFilters: ["topic:storage-pilots"],
  });

export const mockVentureSearchContactsListFixture: ContactsListSearchPayload =
  buildContactsListSearchPayload({
    query: "venture ecosystem",
  });

export const mockStorageSearchContactsListFixture: ContactsListSearchPayload =
  buildContactsListSearchPayload({
    query: "storage",
    tagFilters: ["topic:storage-pilots"],
    valueFilters: ["commercial_opportunity"],
  });

export const mockEmptyContactsListFixture: ContactsListSearchPayload = {
  state: "empty",
  query: "",
  appliedFilters: {
    query: "",
    sourceFilters: [],
    statusFilters: [],
    tagFilters: [],
    valueFilters: [],
  },
  availableFilters: buildAvailableFilters({
    query: "",
    sourceFilters: [],
    statusFilters: [],
    tagFilters: [],
    valueFilters: [],
  }),
  contacts: [],
  summary: "No contacts are available in the local contacts list fixture.",
  provenance: mockEmptyContactsListProvenance,
  nextAction:
    "Clear the local search and filters, or add a mock contact fixture before reviewing the list.",
};

export const mockPendingContactsListFixture: ContactsListSearchPayload = {
  ...mockEmptyContactsListFixture,
  state: "pending",
  summary:
    "Contacts list search and filter review is pending local fixture approval.",
  provenance: mockPendingContactsListProvenance,
  nextAction:
    "Wait for mock contacts fixture review before reading list results.",
};
