import type {
  ExternalContactCandidate,
  ExternalContactDraft,
  ExternalContactsCandidatesPayload,
  ExternalContactsEvidence,
  ExternalContactsImportPayload,
  ExternalContactsImportProvenance,
  ExternalContactsSourceReference,
  ExternalContactsSourceSummary,
} from "./external-import-contract";

export const EXTERNAL_CONTACTS_IMPORT_FIXTURE_SOURCE =
  "fixture:features/acquisition/external-import-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T16:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T16:08:00.000Z";

export const mockExternalContactsSources = {
  phone: {
    type: "external_contacts",
    id: "source:external-contacts:phone",
    label: "Phone address book fixture",
    sourceKind: "phone",
    batchId: "external-batch:phone",
  },
  googleContacts: {
    type: "external_contacts",
    id: "source:external-contacts:google-contacts",
    label: "Google Contacts fixture",
    sourceKind: "google_contacts",
    batchId: "external-batch:google-contacts",
  },
  csv: {
    type: "external_contacts",
    id: "source:external-contacts:csv",
    label: "CSV upload fixture",
    sourceKind: "csv",
    batchId: "external-batch:csv",
  },
  customerList: {
    type: "external_contacts",
    id: "source:external-contacts:customer-list",
    label: "Existing customer list fixture",
    sourceKind: "existing_customer_list",
    batchId: "external-batch:customer-list",
  },
} as const satisfies Record<string, ExternalContactsSourceReference>;

export const mockExternalContactsImportProvenance: ExternalContactsImportProvenance =
  {
    source: EXTERNAL_CONTACTS_IMPORT_FIXTURE_SOURCE,
    sourceLabel: "Mock external contacts import fixture",
    evidenceIds: [
      "evidence:external-import-phone",
      "evidence:external-import-google",
      "evidence:external-import-csv",
      "evidence:external-import-customer-list",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-external-contacts-import-only",
    generationMethod: "fixture",
    phoneAddressBookReadExecuted: false,
    googleContactsSyncExecuted: false,
    csvParsedAtScale: false,
    customerListJobExecuted: false,
    externalNetworkRequested: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };

export const mockEmptyExternalContactsImportProvenance: ExternalContactsImportProvenance =
  {
    ...mockExternalContactsImportProvenance,
    sourceLabel: "Mock empty external contacts import rule",
    evidenceIds: ["evidence:external-import-empty"],
    generationMethod: "rule-based-external-contacts-import",
  };

export const mockPendingExternalContactsImportProvenance: ExternalContactsImportProvenance =
  {
    ...mockExternalContactsImportProvenance,
    sourceLabel: "Mock pending external contacts import rule",
    evidenceIds: ["evidence:external-import-pending"],
    generationMethod: "rule-based-external-contacts-import",
  };

export const mockExternalContactsImportFailureProvenance: ExternalContactsImportProvenance =
  {
    ...mockExternalContactsImportProvenance,
    sourceLabel: "Mock external contacts import controlled failure rule",
    evidenceIds: ["evidence:external-import-controlled-failure"],
    generationMethod: "rule-based-external-contacts-import",
  };

export const mockExternalContactsSourceSummaries: readonly ExternalContactsSourceSummary[] =
  [
    {
      kind: "phone",
      label: "Phone contacts",
      candidateCount: 1,
      permissionState: "mock-granted",
      source: mockExternalContactsSources.phone,
      providerSyncRequested: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
    {
      kind: "google_contacts",
      label: "Google Contacts",
      candidateCount: 1,
      permissionState: "mock-linked",
      source: mockExternalContactsSources.googleContacts,
      providerSyncRequested: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
    {
      kind: "csv",
      label: "CSV upload",
      candidateCount: 1,
      permissionState: "mock-uploaded",
      source: mockExternalContactsSources.csv,
      providerSyncRequested: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
    {
      kind: "existing_customer_list",
      label: "Existing customer list",
      candidateCount: 1,
      permissionState: "mock-linked",
      source: mockExternalContactsSources.customerList,
      providerSyncRequested: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
  ];

export const mockExternalContactsEvidence: readonly ExternalContactsEvidence[] =
  [
    {
      evidenceId: "evidence:external-import-phone",
      source: mockExternalContactsSources.phone,
      sourceLabel: "Phone address book fixture",
      excerpt:
        "Local fixture lists Hana Sato as a phone contact from the climate dinner after-party.",
      capturedFields: ["displayName", "phone", "relationshipContext"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-external-contacts-import-service",
    },
    {
      evidenceId: "evidence:external-import-google",
      source: mockExternalContactsSources.googleContacts,
      sourceLabel: "Google Contacts fixture",
      excerpt:
        "Local fixture lists Omar Rahman as a synced workspace contact with venture ecosystem context.",
      capturedFields: ["displayName", "email", "organization"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-external-contacts-import-service",
    },
    {
      evidenceId: "evidence:external-import-csv",
      source: mockExternalContactsSources.csv,
      sourceLabel: "CSV upload fixture",
      excerpt:
        "Local fixture lists Mina Tan from an uploaded partner prospect spreadsheet.",
      capturedFields: ["displayName", "role", "organization", "email"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-external-contacts-import-service",
    },
    {
      evidenceId: "evidence:external-import-customer-list",
      source: mockExternalContactsSources.customerList,
      sourceLabel: "Existing customer list fixture",
      excerpt:
        "Local fixture lists Rafi Stein from a prior customer list as a candidate import.",
      capturedFields: ["displayName", "organization", "duplicateHint"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-external-contacts-import-service",
    },
  ];

export const mockExternalContactCandidates: readonly ExternalContactCandidate[] =
  [
    {
      candidateId: "external-candidate:phone-1",
      displayName: "Hana Sato",
      role: "Community Lead",
      organization: "Tokyo Climate Guild",
      email: "hana.sato@example.test",
      phone: "+81-90-0000-0101",
      sourceKind: "phone",
      relationshipContext:
        "Phone contact from the climate dinner after-party with a possible warm intro path to operators.",
      suggestedNextAction:
        "Review Hana as a community-context contact before confirming any write.",
      confidence: "medium",
      source: mockExternalContactsSources.phone,
      evidenceIds: ["evidence:external-import-phone"],
      duplicateHint: null,
      importEligible: true,
      readyForReview: true,
      providerSyncRequested: false,
      contactWriteExecuted: false,
      databaseWriteExecuted: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
    {
      candidateId: "external-candidate:google-1",
      displayName: "Omar Rahman",
      role: "Platform Partner",
      organization: "Northstar Ventures",
      email: "omar.rahman@example.test",
      phone: "+1-415-000-0140",
      sourceKind: "google_contacts",
      relationshipContext:
        "Workspace contact fixture suggests Omar can broker venture ecosystem introductions.",
      suggestedNextAction:
        "Confirm Omar only after checking why the workspace contact exists.",
      confidence: "high",
      source: mockExternalContactsSources.googleContacts,
      evidenceIds: ["evidence:external-import-google"],
      duplicateHint: "possible-contact:omar-rahman",
      importEligible: true,
      readyForReview: true,
      providerSyncRequested: false,
      contactWriteExecuted: false,
      databaseWriteExecuted: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
    {
      candidateId: "external-candidate:csv-1",
      displayName: "Mina Tan",
      role: "Head of Partnerships",
      organization: "HarborGrid",
      email: "mina.tan@example.test",
      phone: "+65-8000-0199",
      sourceKind: "csv",
      relationshipContext:
        "CSV fixture marks Mina as a partner prospect tied to storage pilot distribution.",
      suggestedNextAction:
        "Review the spreadsheet context before staging a follow-up task.",
      confidence: "medium",
      source: mockExternalContactsSources.csv,
      evidenceIds: ["evidence:external-import-csv"],
      duplicateHint: null,
      importEligible: true,
      readyForReview: true,
      providerSyncRequested: false,
      contactWriteExecuted: false,
      databaseWriteExecuted: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
    {
      candidateId: "external-candidate:customer-list-1",
      displayName: "Rafi Stein",
      role: "Customer Success Director",
      organization: "GridLedger",
      email: "rafi.stein@example.test",
      phone: "+44-20-0000-0188",
      sourceKind: "existing_customer_list",
      relationshipContext:
        "Customer-list fixture links Rafi to an existing account without running a production import job.",
      suggestedNextAction:
        "Review account context before deciding whether this belongs in Orbit contacts.",
      confidence: "low",
      source: mockExternalContactsSources.customerList,
      evidenceIds: ["evidence:external-import-customer-list"],
      duplicateHint: "account:gridledger",
      importEligible: true,
      readyForReview: true,
      providerSyncRequested: false,
      contactWriteExecuted: false,
      databaseWriteExecuted: false,
      fileParsingAtScale: false,
      productionImportJobEnqueued: false,
    },
  ];

export const mockExternalContactDrafts: readonly ExternalContactDraft[] =
  mockExternalContactCandidates.map((candidate) => ({
    id: `external-draft:${candidate.sourceKind === "existing_customer_list" ? "customer-list" : candidate.sourceKind}-1`,
    candidateId: candidate.candidateId,
    displayName: candidate.displayName,
    role: candidate.role,
    organization: candidate.organization,
    email: candidate.email,
    phone: candidate.phone,
    sourceKind: candidate.sourceKind,
    relationshipContext: candidate.relationshipContext,
    suggestedNextAction: candidate.suggestedNextAction,
    confidence: candidate.confidence,
    source: candidate.source,
    evidence: mockExternalContactsEvidence.filter((evidence) =>
      candidate.evidenceIds.includes(evidence.evidenceId),
    ),
    provenance: mockExternalContactsImportProvenance,
    readyForReview: true,
    providerSyncRequested: false,
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
    productionImportJobEnqueued: false,
  }));

export const mockExternalContactsCandidatesFixture: ExternalContactsCandidatesPayload =
  {
    state: "success",
    sources: mockExternalContactsSourceSummaries,
    candidates: mockExternalContactCandidates,
    summary:
      "Four external contact candidates are available from phone, Google Contacts, CSV, and existing customer-list fixtures.",
    provenance: mockExternalContactsImportProvenance,
    nextAction:
      "Review each source-backed candidate before staging contact drafts.",
  };

export const mockExternalContactsImportFixture: ExternalContactsImportPayload = {
  ...mockExternalContactsCandidatesFixture,
  contactDrafts: mockExternalContactDrafts,
  summary:
    "Four external contact drafts are staged from deterministic fixtures with source evidence attached.",
  nextAction:
    "Confirm each candidate before any future live contact write or follow-up action.",
};

export const mockEmptyExternalContactsCandidatesFixture: ExternalContactsCandidatesPayload =
  {
    state: "empty",
    sources: [],
    candidates: [],
    summary: "No external contact candidates are available in the local fixture.",
    provenance: mockEmptyExternalContactsImportProvenance,
    nextAction:
      "Connect a mock source fixture before staging external contact drafts.",
  };

export const mockEmptyExternalContactsImportFixture: ExternalContactsImportPayload =
  {
    ...mockEmptyExternalContactsCandidatesFixture,
    contactDrafts: [],
  };

export const mockPendingExternalContactsCandidatesFixture: ExternalContactsCandidatesPayload =
  {
    state: "pending",
    sources: mockExternalContactsSourceSummaries.map((source) => ({
      ...source,
      candidateCount: 0,
    })),
    candidates: [],
    summary:
      "External contact candidate review is pending local fixture approval.",
    provenance: mockPendingExternalContactsImportProvenance,
    nextAction:
      "Wait for mock source review before importing external contact drafts.",
  };

export const mockPendingExternalContactsImportFixture: ExternalContactsImportPayload =
  {
    ...mockPendingExternalContactsCandidatesFixture,
    contactDrafts: [],
  };
