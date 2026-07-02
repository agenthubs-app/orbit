import type {
  ContactDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS,
  EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS,
  type ExternalContactCandidate,
  type ExternalContactDraft,
  type ExternalContactsCandidatesPayload,
  type ExternalContactsCandidatesResult,
  type ExternalContactsCandidatesSuccess,
  type ExternalContactsEvidence,
  type ExternalContactsImportErrorCode,
  type ExternalContactsImportFailure,
  type ExternalContactsImportInput,
  type ExternalContactsImportPayload,
  type ExternalContactsImportProvenance,
  type ExternalContactsImportResult,
  type ExternalContactsImportScenario,
  type ExternalContactsImportService,
  type ExternalContactsImportSourceKind,
  type ExternalContactsImportSuccess,
  type ExternalContactsSourceReference,
  type ExternalContactsSourceSummary,
} from "./external-import-contract";
import type {
  LiveExternalContactsImportGraph,
  LiveExternalContactsImportProvider,
} from "./storage/external-import-live-record-provider";

export interface LiveExternalContactsImportServiceOptions {
  now?: () => string;
  provider?: LiveExternalContactsImportProvider | null;
}

interface LiveExternalContactCandidateRecord {
  candidate: ExternalContactCandidate;
  draft: ExternalContactDraft;
  sourceSummary: ExternalContactsSourceSummary;
}

interface ReadExternalContactsGraphSuccess {
  graph: LiveExternalContactsImportGraph;
  provider: LiveExternalContactsImportProvider;
}

type ReadExternalContactsGraphResult =
  | ReadExternalContactsGraphSuccess
  | ExternalContactsImportFailure;

type ScenarioPayloadResult =
  | ExternalContactsCandidatesPayload
  | ExternalContactsImportFailure;

const supportedScenarios = new Set<ExternalContactsImportScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedSourceKinds = new Set<ExternalContactsImportSourceKind>(
  EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS,
);

const sourceKindLabels = {
  phone: "Live external phone contact pool",
  google_contacts: "Live external Google contacts pool",
  csv: "Live external CSV contact pool",
  existing_customer_list: "Live external customer-list pool",
} as const satisfies Record<ExternalContactsImportSourceKind, string>;

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function candidatesSuccess(
  payload: ExternalContactsCandidatesPayload,
): ExternalContactsCandidatesSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function importSuccess(
  payload: ExternalContactsImportPayload,
): ExternalContactsImportSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeScenario(
  scenario?: ExternalContactsImportInput["scenario"],
): ExternalContactsImportScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ExternalContactsImportScenario)
  ) {
    return scenario as ExternalContactsImportScenario;
  }

  return "success";
}

function normalizeSourceKind(
  sourceKind?: ExternalContactsImportInput["sourceKind"],
): ExternalContactsImportSourceKind | null {
  const normalized = sourceKind?.trim();

  if (!normalized) {
    return null;
  }

  return supportedSourceKinds.has(normalized as ExternalContactsImportSourceKind)
    ? normalized as ExternalContactsImportSourceKind
    : null;
}

function unconfiguredProvenance(now: string): ExternalContactsImportProvenance {
  return {
    source: "live-record-store:external-contacts-import:unconfigured",
    sourceLabel: "Unconfigured external contacts import live store",
    evidenceIds: ["evidence:external-import-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-external-contacts-import",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    phoneAddressBookReadExecuted: false,
    googleContactsSyncExecuted: false,
    csvParsedAtScale: false,
    customerListJobExecuted: false,
    externalNetworkRequested: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  provider: LiveExternalContactsImportProvider;
  readExecuted?: boolean;
}): ExternalContactsImportProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:external-import-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-external-contacts-import",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: input.readExecuted ?? true,
    phoneAddressBookReadExecuted: false,
    googleContactsSyncExecuted: false,
    csvParsedAtScale: false,
    customerListJobExecuted: false,
    externalNetworkRequested: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: ExternalContactsImportErrorCode,
  provenance: ExternalContactsImportProvenance,
): ExternalContactsImportFailure {
  const definition = EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS[code];

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

function isFailureResult<TPayload extends object>(
  result: TPayload | ExternalContactsImportFailure,
): result is ExternalContactsImportFailure {
  return "success" in result && result.success === false;
}

function isReadGraphFailure(
  result: ReadExternalContactsGraphResult,
): result is ExternalContactsImportFailure {
  return "success" in result && result.success === false;
}

function sourceKindFailure(
  sourceKind: ExternalContactsImportInput["sourceKind"],
  provenance: ExternalContactsImportProvenance,
): ExternalContactsImportFailure | null {
  const normalized = sourceKind?.trim();

  if (!normalized || supportedSourceKinds.has(normalized as ExternalContactsImportSourceKind)) {
    return null;
  }

  return failure("EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED", provenance);
}

function sourceReferenceFor(input: {
  person: NetworkPersonDTO;
  sourceKind: ExternalContactsImportSourceKind;
}): ExternalContactsSourceReference {
  return {
    type: "external_contacts",
    id: input.person.source.id,
    label:
      input.person.source.label ??
      sourceKindLabels[input.sourceKind],
    sourceKind: input.sourceKind,
    batchId: `live-external-import:${input.sourceKind}`,
  };
}

function sourceKindForPerson(
  person: NetworkPersonDTO,
  index: number,
): ExternalContactsImportSourceKind {
  const numericSuffix = person.id.match(/(\d+)$/)?.[1];

  if (numericSuffix) {
    const numericIndex = Math.max(Number.parseInt(numericSuffix, 10) - 1, 0);

    return EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS[
      numericIndex % EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS.length
    ];
  }

  const hash = [...person.id].reduce(
    (total, char) => total + char.charCodeAt(0),
    index,
  );

  return EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS[
    hash % EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS.length
  ];
}

function confidenceFor(evidence: RelationshipEvidenceDTO | null) {
  const confidence = evidence?.confidence ?? 0.74;

  if (confidence >= 0.85) {
    return "high";
  }

  if (confidence >= 0.65) {
    return "medium";
  }

  return "low";
}

function evidenceForPerson(
  evidence: readonly RelationshipEvidenceDTO[],
  person: NetworkPersonDTO,
): RelationshipEvidenceDTO | null {
  const evidenceIdSet = new Set(person.evidenceIds);

  return (
    evidence.find((item) => evidenceIdSet.has(item.id)) ??
    evidence.find((item) => item.sourceId === person.source.id) ??
    null
  );
}

function duplicateContactFor(
  person: NetworkPersonDTO,
  contacts: readonly ContactDTO[],
): ContactDTO | null {
  const email = nonEmpty(person.primaryEmail)?.toLocaleLowerCase();
  const organization = nonEmpty(person.organization)?.toLocaleLowerCase();
  const displayName = person.displayName.toLocaleLowerCase();

  return (
    contacts.find((contact) => contact.personId === person.id) ??
    contacts.find(
      (contact) =>
        email &&
        nonEmpty(contact.primaryEmail)?.toLocaleLowerCase() === email,
    ) ??
    contacts.find(
      (contact) =>
        contact.displayName.toLocaleLowerCase() === displayName &&
        nonEmpty(contact.organization)?.toLocaleLowerCase() === organization,
    ) ??
    null
  );
}

function sourceSummaryFor(input: {
  candidateCount: number;
  sourceKind: ExternalContactsImportSourceKind;
}): ExternalContactsSourceSummary {
  const permissionState =
    input.sourceKind === "csv"
      ? "live-uploaded"
      : input.sourceKind === "existing_customer_list"
        ? "live-linked"
        : "live-indexed";

  return {
    kind: input.sourceKind,
    label: sourceKindLabels[input.sourceKind],
    candidateCount: input.candidateCount,
    permissionState,
    source: {
      type: "external_contacts",
      id: `source:external-contacts:live:${input.sourceKind}`,
      label: sourceKindLabels[input.sourceKind],
      sourceKind: input.sourceKind,
      batchId: `live-external-import:${input.sourceKind}`,
    },
    providerSyncRequested: false,
    fileParsingAtScale: false,
    productionImportJobEnqueued: false,
  };
}

function evidenceRecordFor(input: {
  evidence: RelationshipEvidenceDTO | null;
  person: NetworkPersonDTO;
  source: ExternalContactsSourceReference;
}): ExternalContactsEvidence {
  return {
    evidenceId: input.evidence?.id ?? input.person.evidenceIds[0],
    source: input.source,
    sourceLabel: input.source.label,
    excerpt:
      input.evidence?.summary ??
      input.person.profileSnippet ??
      `${input.person.displayName} is available in the live external contact pool.`,
    capturedFields: [
      "displayName",
      "organization",
      "role",
      "primaryEmail",
      "profileSnippet",
    ],
    createdAt: input.evidence?.occurredAt ?? input.person.updatedAt,
    createdBy: "live-external-contacts-import-service",
  };
}

function buildCandidateRecord(input: {
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  index: number;
  person: NetworkPersonDTO;
}): LiveExternalContactCandidateRecord {
  const sourceKind = sourceKindForPerson(input.person, input.index);
  const source = sourceReferenceFor({
    person: input.person,
    sourceKind,
  });
  const matchingContact = duplicateContactFor(input.person, input.contacts);
  const evidence = evidenceForPerson(input.evidence, input.person);
  const externalEvidence = evidenceRecordFor({
    evidence,
    person: input.person,
    source,
  });
  const relationshipContext =
    input.person.profileSnippet ??
    `${input.person.displayName} from ${input.person.organization ?? "an external source"} is ready for review.`;
  const suggestedNextAction = matchingContact
    ? "Review the existing live contact before staging a duplicate draft."
    : "Review the source-backed external contact before creating a central contact draft.";
  const candidate: ExternalContactCandidate = {
    candidateId: `external-candidate:live:${input.person.id}`,
    displayName: input.person.displayName,
    role: input.person.role ?? "External contact",
    organization: input.person.organization ?? "",
    email: input.person.primaryEmail ?? "",
    phone: "",
    sourceKind,
    relationshipContext,
    suggestedNextAction,
    confidence: confidenceFor(evidence),
    source,
    evidenceIds: input.person.evidenceIds,
    duplicateHint: matchingContact
      ? `Existing live contact: ${matchingContact.displayName}`
      : null,
    importEligible: true,
    readyForReview: true,
    providerSyncRequested: false,
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    fileParsingAtScale: false,
    productionImportJobEnqueued: false,
  };

  return {
    candidate,
    draft: {
      id: `external-draft:live:${input.person.id}`,
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      role: candidate.role,
      organization: candidate.organization,
      email: candidate.email,
      phone: candidate.phone,
      sourceKind,
      relationshipContext,
      suggestedNextAction,
      confidence: candidate.confidence,
      source,
      evidence: [externalEvidence],
      provenance: provenanceFor({
        evidenceIds: candidate.evidenceIds,
        generatedAt: input.person.updatedAt,
        provider: {
          source: source.id,
          sourceLabel: source.label,
          readExternalContactsImportGraph: () => ({
            contacts: [],
            evidence: [],
            generatedAt: input.person.updatedAt,
            networkPeople: [],
          }),
        },
      }),
      readyForReview: true,
      providerSyncRequested: false,
      contactWriteExecuted: false,
      databaseWriteExecuted: false,
      notificationDelivered: false,
      productionImportJobEnqueued: false,
    },
    sourceSummary: sourceSummaryFor({
      candidateCount: 1,
      sourceKind,
    }),
  };
}

function withPayloadProvenance(
  draft: ExternalContactDraft,
  provenance: ExternalContactsImportProvenance,
): ExternalContactDraft {
  return {
    ...draft,
    provenance,
  };
}

function buildRecords(
  graph: LiveExternalContactsImportGraph,
): readonly LiveExternalContactCandidateRecord[] {
  return graph.networkPeople
    .filter((person) => person.personKind === "external_contact")
    .map((person, index) =>
      buildCandidateRecord({
        contacts: graph.contacts,
        evidence: graph.evidence,
        index,
        person,
      }),
    );
}

function sourceSummariesFor(
  records: readonly LiveExternalContactCandidateRecord[],
  sourceKind: ExternalContactsImportSourceKind | null,
): readonly ExternalContactsSourceSummary[] {
  return EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS
    .filter((kind) => !sourceKind || kind === sourceKind)
    .map((kind) =>
      sourceSummaryFor({
        candidateCount: records.filter(
          (record) => record.candidate.sourceKind === kind,
        ).length,
        sourceKind: kind,
      }),
    );
}

function filterRecords(
  records: readonly LiveExternalContactCandidateRecord[],
  sourceKind: ExternalContactsImportSourceKind | null,
): readonly LiveExternalContactCandidateRecord[] {
  if (!sourceKind) {
    return records;
  }

  return records.filter((record) => record.candidate.sourceKind === sourceKind);
}

async function readGraph(
  provider: LiveExternalContactsImportProvider | null | undefined,
  now: string,
): Promise<ReadExternalContactsGraphResult> {
  if (!provider) {
    return failure(
      "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(now),
    );
  }

  try {
    return {
      graph: await provider.readExternalContactsImportGraph(),
      provider,
    };
  } catch {
    return failure(
      "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:external-import-live-store-failed"],
        generatedAt: now,
        provider,
        readExecuted: true,
      }),
    );
  }
}

function scenarioPayload(input: {
  now: string;
  provider: LiveExternalContactsImportProvider | null | undefined;
  scenario: ExternalContactsImportScenario;
  sourceKind: ExternalContactsImportSourceKind | null;
}): ScenarioPayloadResult | null {
  if (input.scenario === "success") {
    return null;
  }

  const provenance = input.provider
    ? provenanceFor({
        evidenceIds: [`evidence:external-import-live-${input.scenario}`],
        generatedAt: input.now,
        provider: input.provider,
        readExecuted: false,
      })
    : unconfiguredProvenance(input.now);

  if (input.scenario === "failure") {
    return failure("EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_FAILED", provenance);
  }

  return {
    state: input.scenario,
    sources: sourceSummariesFor([], input.sourceKind),
    candidates: [],
    summary:
      input.scenario === "pending"
        ? "Live external contacts import is waiting for review before staging candidates."
        : "No live external contact candidates matched the requested source.",
    provenance,
    nextAction:
      input.scenario === "pending"
        ? "Wait for the live external contact pool to finish review."
        : "Clear the external source filter or seed live networkPeople records.",
  };
}

function buildCandidatesPayload(input: {
  graph: LiveExternalContactsImportGraph;
  provider: LiveExternalContactsImportProvider;
  sourceKind: ExternalContactsImportSourceKind | null;
}): ExternalContactsCandidatesPayload {
  const records = buildRecords(input.graph);
  const filteredRecords = filterRecords(records, input.sourceKind);
  const evidenceIds = filteredRecords.flatMap(
    (record) => record.candidate.evidenceIds,
  );
  const provenance = provenanceFor({
    evidenceIds,
    generatedAt: input.graph.generatedAt,
    provider: input.provider,
  });

  return {
    state: filteredRecords.length > 0 ? "success" : "empty",
    sources: sourceSummariesFor(records, input.sourceKind),
    candidates: filteredRecords.map((record) => record.candidate),
    summary:
      filteredRecords.length > 0
        ? `Found ${filteredRecords.length} source-backed external contact candidates in live storage.`
        : "No source-backed external contact candidates matched the requested source.",
    provenance,
    nextAction:
      filteredRecords.length > 0
        ? "Review live external contact candidates before creating central contact drafts."
        : "Adjust the source filter or seed live networkPeople records.",
  };
}

function buildImportPayload(
  candidatesPayload: ExternalContactsCandidatesPayload,
  records: readonly LiveExternalContactCandidateRecord[],
): ExternalContactsImportPayload {
  return {
    ...candidatesPayload,
    contactDrafts: records.map((record) =>
      withPayloadProvenance(record.draft, candidatesPayload.provenance),
    ),
    summary:
      records.length > 0
        ? `Staged ${records.length} live external contact drafts for review without writing contacts.`
        : candidatesPayload.summary,
  };
}

export function createLiveExternalContactsImportService({
  now = () => new Date().toISOString(),
  provider,
}: LiveExternalContactsImportServiceOptions): ExternalContactsImportService {
  return {
    async listExternalContactCandidates(input = {}): Promise<ExternalContactsCandidatesResult> {
      const generatedAt = now();
      const sourceKind = normalizeSourceKind(input.sourceKind);
      const preliminaryProvenance = provider
        ? provenanceFor({
            evidenceIds: ["evidence:external-import-live-validation"],
            generatedAt,
            provider,
            readExecuted: false,
          })
        : unconfiguredProvenance(generatedAt);
      const unsupportedSourceFailure = sourceKindFailure(
        input.sourceKind,
        preliminaryProvenance,
      );

      if (unsupportedSourceFailure) {
        return unsupportedSourceFailure;
      }

      const scenarioResult = scenarioPayload({
        now: generatedAt,
        provider,
        scenario: normalizeScenario(input.scenario),
        sourceKind,
      });

      if (scenarioResult) {
        return isFailureResult(scenarioResult)
          ? scenarioResult
          : candidatesSuccess(scenarioResult);
      }

      const graphResult = await readGraph(provider, generatedAt);

      if (isReadGraphFailure(graphResult)) {
        return graphResult;
      }

      return candidatesSuccess(
        buildCandidatesPayload({
          graph: graphResult.graph,
          provider: graphResult.provider,
          sourceKind,
        }),
      );
    },

    async importExternalContacts(input = {}): Promise<ExternalContactsImportResult> {
      const generatedAt = now();
      const sourceKind = normalizeSourceKind(input.sourceKind);
      const preliminaryProvenance = provider
        ? provenanceFor({
            evidenceIds: ["evidence:external-import-live-validation"],
            generatedAt,
            provider,
            readExecuted: false,
          })
        : unconfiguredProvenance(generatedAt);
      const unsupportedSourceFailure = sourceKindFailure(
        input.sourceKind,
        preliminaryProvenance,
      );

      if (unsupportedSourceFailure) {
        return unsupportedSourceFailure;
      }

      const scenarioResult = scenarioPayload({
        now: generatedAt,
        provider,
        scenario: normalizeScenario(input.scenario),
        sourceKind,
      });

      if (scenarioResult) {
        return isFailureResult(scenarioResult)
          ? scenarioResult
          : importSuccess({
              ...scenarioResult,
              contactDrafts: [],
            });
      }

      const graphResult = await readGraph(provider, generatedAt);

      if (isReadGraphFailure(graphResult)) {
        return graphResult;
      }

      const records = buildRecords(graphResult.graph);
      const filteredRecords = filterRecords(records, sourceKind);
      const candidatesPayload = buildCandidatesPayload({
        graph: graphResult.graph,
        provider: graphResult.provider,
        sourceKind,
      });

      return importSuccess(buildImportPayload(candidatesPayload, filteredRecords));
    },
  };
}
