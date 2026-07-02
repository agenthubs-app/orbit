import type { ContactDTO } from "../../shared/domain/contracts";
import type { ContactAcquisitionDraft } from "./contract";
import {
  DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS,
  type DuplicateDetectionConfidence,
  type DuplicateDetectionMatchReason,
  type DuplicateDetectionMergeErrorCode,
  type DuplicateDetectionMergeFailure,
  type DuplicateDetectionMergeScenario,
  type DuplicateDetectionMergeService,
  type DuplicateMergeApplyInput,
  type DuplicateMergeApplyPayload,
  type DuplicateMergeApplyResult,
  type DuplicateMergeApplyScenario,
  type DuplicateMergeEvidence,
  type DuplicateMergeFieldDecision,
  type DuplicateMergeProvenance,
  type DuplicateMergeSourceReference,
  type DuplicateMergeSuggestion,
  type DuplicateMergeSuggestionInput,
  type DuplicateMergeSuggestionsPayload,
  type DuplicateMergeSuggestionsResult,
  type ImportedContactDuplicateCandidate,
} from "./merge-contract";
import type {
  LiveDuplicateMergeGraph,
  LiveDuplicateMergeProvider,
} from "./storage/duplicate-merge-live-record-provider";

export interface LiveDuplicateMergeServiceOptions {
  now?: () => string;
  provider?: LiveDuplicateMergeProvider | null;
}

type ImportedDraftWithEmail = ContactAcquisitionDraft & {
  email?: string;
};

interface DuplicateMatch {
  candidate: ImportedContactDuplicateCandidate;
  contact: ContactDTO;
  draft: ImportedDraftWithEmail;
  suggestion: DuplicateMergeSuggestion;
}

interface ReadDuplicateMergeGraphSuccess {
  graph: LiveDuplicateMergeGraph;
  provider: LiveDuplicateMergeProvider;
}

type ReadDuplicateMergeGraphResult =
  | DuplicateDetectionMergeFailure
  | ReadDuplicateMergeGraphSuccess;

const supportedListScenarios = new Set<DuplicateDetectionMergeScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedApplyScenarios = new Set<DuplicateMergeApplyScenario>([
  "success",
  "pending",
  "blocked",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function suggestionsSuccess(
  payload: DuplicateMergeSuggestionsPayload,
): { success: true; data: DuplicateMergeSuggestionsPayload } {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function applySuccess(
  payload: DuplicateMergeApplyPayload,
): { success: true; data: DuplicateMergeApplyPayload } {
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

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeEmail(value: string | null | undefined): string {
  return normalizeText(value);
}

function importedDraftEmail(draft: ContactAcquisitionDraft): string {
  const value = (draft as ImportedDraftWithEmail).email;

  return nonEmpty(value) ?? "";
}

function normalizeListScenario(
  scenario?: DuplicateMergeSuggestionInput["scenario"],
): DuplicateDetectionMergeScenario {
  if (
    scenario &&
    supportedListScenarios.has(scenario as DuplicateDetectionMergeScenario)
  ) {
    return scenario as DuplicateDetectionMergeScenario;
  }

  return "success";
}

function normalizeApplyScenario(
  scenario?: DuplicateMergeApplyInput["scenario"],
): DuplicateMergeApplyScenario {
  if (
    scenario &&
    supportedApplyScenarios.has(scenario as DuplicateMergeApplyScenario)
  ) {
    return scenario as DuplicateMergeApplyScenario;
  }

  return "success";
}

function unconfiguredProvenance(now: string): DuplicateMergeProvenance {
  return {
    source: "live-record-store:duplicate-merge:unconfigured",
    sourceLabel: "Unconfigured duplicate merge live store",
    evidenceIds: ["evidence:duplicate-merge-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-duplicate-detection-merge",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    externalNetworkRequested: false,
    databaseWriteExecuted: false,
    destructiveMergeExecuted: false,
    importedContactWriteExecuted: false,
    emailCalendarReadExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod: DuplicateMergeProvenance["generationMethod"];
  provider: LiveDuplicateMergeProvider;
  readExecuted?: boolean;
}): DuplicateMergeProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:duplicate-merge-live-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-duplicate-detection-merge",
    generationMethod: input.generationMethod,
    liveDatabaseReadExecuted: input.readExecuted ?? true,
    externalNetworkRequested: false,
    databaseWriteExecuted: false,
    destructiveMergeExecuted: false,
    importedContactWriteExecuted: false,
    emailCalendarReadExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: DuplicateDetectionMergeErrorCode,
  provenance: DuplicateMergeProvenance,
): DuplicateDetectionMergeFailure {
  const definition = DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS[code];

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

function liveSourceFor(
  draft: ContactAcquisitionDraft,
): DuplicateMergeSourceReference | null {
  if (
    draft.source.type !== "event_import" &&
    draft.source.type !== "external_contacts" &&
    draft.source.type !== "referral"
  ) {
    return null;
  }

  return {
    type: draft.source.type,
    id: draft.source.id,
    label: draft.source.label,
    batchId: `live-batch:${draft.source.id}`,
  };
}

function matchReasonsFor(input: {
  contact: ContactDTO;
  draft: ImportedDraftWithEmail;
}): readonly DuplicateDetectionMatchReason[] {
  const reasons: DuplicateDetectionMatchReason[] = [];
  const draftEmail = normalizeEmail(importedDraftEmail(input.draft));
  const contactEmail = normalizeEmail(input.contact.primaryEmail);
  const sameEmail = draftEmail.length > 0 && draftEmail === contactEmail;
  const sameName =
    normalizeText(input.draft.displayName) ===
    normalizeText(input.contact.displayName);
  const sameOrganization =
    normalizeText(input.draft.organization) ===
    normalizeText(input.contact.organization);

  if (sameEmail) {
    reasons.push("email");
  }

  if (sameName && sameOrganization) {
    reasons.push("name_organization");
  }

  if (
    reasons.length === 0 &&
    input.draft.source.type === "referral" &&
    sameName
  ) {
    reasons.push("referral_context");
  }

  return reasons;
}

function confidenceFor(
  reasons: readonly DuplicateDetectionMatchReason[],
): DuplicateDetectionConfidence {
  if (reasons.includes("email")) {
    return "high";
  }

  if (reasons.includes("name_organization")) {
    return "medium";
  }

  return "low";
}

function relationshipContextFor(input: {
  contact: ContactDTO;
  draft: ContactAcquisitionDraft;
}): string {
  return [
    input.draft.relationshipContext,
    input.contact.profileSnippet
      ? `Existing profile: ${input.contact.profileSnippet}`
      : null,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function fieldDecisionsFor(input: {
  contact: ContactDTO;
  draft: ImportedDraftWithEmail;
}): readonly DuplicateMergeFieldDecision[] {
  const decisions: DuplicateMergeFieldDecision[] = [
    {
      field: "displayName",
      selectedFrom:
        input.draft.displayName.length >= input.contact.displayName.length
          ? "imported_draft"
          : "existing_contact",
      value:
        input.draft.displayName.length >= input.contact.displayName.length
          ? input.draft.displayName
          : input.contact.displayName,
      reason:
        "Choose the most complete display name while preserving both source evidence trails.",
    },
    {
      field: "organization",
      selectedFrom: input.contact.organization ? "existing_contact" : "imported_draft",
      value: input.contact.organization ?? input.draft.organization,
      reason:
        "Keep the existing organization unless the imported draft is the only source.",
    },
    {
      field: "role",
      selectedFrom: "combined",
      value: input.contact.role ?? input.draft.role,
      reason:
        "Treat role labels as review context; a future contact write can choose the final normalized role.",
    },
    {
      field: "relationshipContext",
      selectedFrom: "combined",
      value: relationshipContextFor(input),
      reason:
        "Combine imported context with the existing profile snippet before any live merge write.",
    },
  ];
  const draftEmail = importedDraftEmail(input.draft);
  const contactEmail = input.contact.primaryEmail ?? "";

  if (draftEmail || contactEmail) {
    decisions.push({
      field: "email",
      selectedFrom: contactEmail ? "existing_contact" : "imported_draft",
      value: contactEmail || draftEmail,
      reason:
        "Prefer the existing contact email for the preview until a confirmed merge write exists.",
    });
  }

  return decisions;
}

function candidateFor(input: {
  contact: ContactDTO;
  draft: ImportedDraftWithEmail;
  reasons: readonly DuplicateDetectionMatchReason[];
  source: DuplicateMergeSourceReference;
}): ImportedContactDuplicateCandidate {
  const evidenceIds = unique([
    ...input.draft.provenance.evidenceIds,
    ...input.contact.evidenceIds,
  ]);

  return {
    candidateId: `duplicate-candidate:live:${input.draft.id}:${input.contact.id}`,
    importedDraftId: input.draft.id,
    importedContactName: input.draft.displayName,
    importedRole: input.draft.role,
    importedOrganization: input.draft.organization,
    importedEmail: importedDraftEmail(input.draft),
    existingContactId: input.contact.id,
    existingContactName: input.contact.displayName,
    existingRole: input.contact.role ?? "Known contact",
    existingOrganization: input.contact.organization ?? "",
    existingEmail: input.contact.primaryEmail ?? "",
    relationshipContext: relationshipContextFor({
      contact: input.contact,
      draft: input.draft,
    }),
    matchReasons: input.reasons,
    confidence: confidenceFor(input.reasons),
    source: input.source,
    evidenceIds,
    importedContactWriteExecuted: false,
    externalLookupExecuted: false,
    aiProviderRequested: false,
  };
}

function suggestionFor(input: {
  candidate: ImportedContactDuplicateCandidate;
  contact: ContactDTO;
  draft: ImportedDraftWithEmail;
  provenance: DuplicateMergeProvenance;
}): DuplicateMergeSuggestion {
  return {
    id: `live-merge:${input.draft.id}:${input.contact.id}`,
    candidateId: input.candidate.candidateId,
    importedDraftId: input.draft.id,
    existingContactId: input.contact.id,
    decision: "merge_into_existing",
    confidence: input.candidate.confidence,
    summary: `Review whether ${input.draft.displayName} from the live draft should merge into existing contact ${input.contact.displayName}.`,
    reviewQuestion: `Confirm that live draft ${input.draft.id} belongs to existing contact ${input.contact.displayName}?`,
    fieldDecisions: fieldDecisionsFor({
      contact: input.contact,
      draft: input.draft,
    }),
    evidenceIds: input.candidate.evidenceIds,
    provenance: input.provenance,
    requiresUserConfirmation: true,
    destructiveMergeExecuted: false,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    notificationDelivered: false,
  };
}

function matchesFor(input: {
  graph: LiveDuplicateMergeGraph;
  provider: LiveDuplicateMergeProvider;
}): readonly DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const draft of input.graph.contactDrafts) {
    if (draft.status !== "pending_confirmation") {
      continue;
    }

    const source = liveSourceFor(draft);

    if (!source) {
      continue;
    }

    for (const contact of input.graph.contacts) {
      const typedDraft = draft as ImportedDraftWithEmail;
      const reasons = matchReasonsFor({
        contact,
        draft: typedDraft,
      });

      if (reasons.length === 0) {
        continue;
      }

      const candidate = candidateFor({
        contact,
        draft: typedDraft,
        reasons,
        source,
      });
      const provenance = provenanceFor({
        evidenceIds: candidate.evidenceIds,
        generatedAt: input.graph.generatedAt,
        generationMethod: "live-store-query",
        provider: input.provider,
      });
      const suggestion = suggestionFor({
        candidate,
        contact,
        draft: typedDraft,
        provenance,
      });

      matches.push({
        candidate,
        contact,
        draft: typedDraft,
        suggestion,
      });
    }
  }

  return matches;
}

function listPayloadFor(input: {
  graph: LiveDuplicateMergeGraph;
  matches: readonly DuplicateMatch[];
  provider: LiveDuplicateMergeProvider;
  state?: "empty" | "pending" | "success";
}): DuplicateMergeSuggestionsPayload {
  const state =
    input.state ?? (input.matches.length > 0 ? "success" : "empty");
  const evidenceIds = unique(
    input.matches.flatMap((match) => match.candidate.evidenceIds),
  );

  return {
    state,
    duplicateCandidates: input.matches.map((match) => match.candidate),
    mergeSuggestions: input.matches.map((match) => match.suggestion),
    summary:
      state === "success"
        ? `${input.matches.length} live duplicate merge suggestion(s) are ready for explicit review.`
        : "No live imported contact drafts currently match existing contacts.",
    provenance: provenanceFor({
      evidenceIds,
      generatedAt: input.graph.generatedAt,
      generationMethod: "live-store-query",
      provider: input.provider,
    }),
    nextAction:
      state === "success"
        ? "Review each source-backed suggestion before applying any future contact merge write."
        : "Stage imported contact drafts before reviewing live duplicate merges.",
  };
}

function createdEvidenceFor(input: {
  actorLabel: string;
  confirmedAt: string;
  suggestion: DuplicateMergeSuggestion;
}): DuplicateMergeEvidence {
  return {
    evidenceId: `evidence:duplicate-merge-live-confirmation:${input.suggestion.id}`,
    source: {
      type: "event_import",
      id: input.suggestion.importedDraftId,
      label: "Live duplicate merge confirmation",
      batchId: `live-batch:${input.suggestion.importedDraftId}`,
    },
    sourceLabel: "Live duplicate merge confirmation",
    excerpt: `${input.actorLabel} confirmed ${input.suggestion.id} in review-only live duplicate merge mode; no contact write was executed.`,
    capturedFields: ["suggestionId", "actorLabel", "confirmedAt"],
    createdAt: input.confirmedAt,
    createdBy: "live-duplicate-merge-service",
  };
}

function applyPayloadFor(input: {
  actorLabel: string;
  confirmedAt: string;
  match: DuplicateMatch;
  provider: LiveDuplicateMergeProvider;
}): DuplicateMergeApplyPayload {
  const evidence = createdEvidenceFor({
    actorLabel: input.actorLabel,
    confirmedAt: input.confirmedAt,
    suggestion: input.match.suggestion,
  });
  const evidenceIds = unique([
    ...input.match.suggestion.evidenceIds,
    evidence.evidenceId,
  ]);
  const provenance = provenanceFor({
    evidenceIds,
    generatedAt: input.confirmedAt,
    generationMethod: "live-store-confirmation",
    provider: input.provider,
  });

  return {
    state: "confirmed",
    suggestionId: input.match.suggestion.id,
    confirmedBy: input.actorLabel,
    confirmedAt: input.confirmedAt,
    appliedSuggestion: {
      ...input.match.suggestion,
      provenance,
    },
    mergedContactPreview: {
      contactId: input.match.contact.id,
      displayName:
        input.match.suggestion.fieldDecisions.find(
          (decision) => decision.field === "displayName",
        )?.value ?? input.match.contact.displayName,
      role:
        input.match.suggestion.fieldDecisions.find(
          (decision) => decision.field === "role",
        )?.value ?? input.match.contact.role ?? input.match.draft.role,
      organization:
        input.match.suggestion.fieldDecisions.find(
          (decision) => decision.field === "organization",
        )?.value ??
        input.match.contact.organization ??
        input.match.draft.organization,
      email:
        input.match.suggestion.fieldDecisions.find(
          (decision) => decision.field === "email",
        )?.value ??
        input.match.contact.primaryEmail ??
        importedDraftEmail(input.match.draft),
      relationshipContext:
        input.match.suggestion.fieldDecisions.find(
          (decision) => decision.field === "relationshipContext",
        )?.value ?? input.match.draft.relationshipContext,
      evidenceIds,
    },
    confirmation: {
      required: true,
      state: "confirmed",
      question: input.match.suggestion.reviewQuestion,
      actorLabel: input.actorLabel,
      confirmedAt: input.confirmedAt,
    },
    createdEvidence: evidence,
    fieldDecisions: input.match.suggestion.fieldDecisions,
    provenance,
    nextAction:
      "Keep this live merge preview under review until a future audited merge writer is implemented.",
    mergeWriteExecuted: false,
    destructiveMergeExecuted: false,
    databaseWriteExecuted: false,
    contactWriteExecuted: false,
    notificationDelivered: false,
  };
}

function scenarioSuggestionsResult(input: {
  graph: LiveDuplicateMergeGraph;
  matches: readonly DuplicateMatch[];
  provider: LiveDuplicateMergeProvider;
  scenario: DuplicateDetectionMergeScenario;
}): DuplicateMergeSuggestionsResult | null {
  switch (input.scenario) {
    case "empty":
      return suggestionsSuccess(
        listPayloadFor({
          graph: input.graph,
          matches: [],
          provider: input.provider,
          state: "empty",
        }),
      );
    case "pending":
      return suggestionsSuccess(
        listPayloadFor({
          graph: input.graph,
          matches: [],
          provider: input.provider,
          state: "pending",
        }),
      );
    case "failure":
      return failure(
        "DUPLICATE_MERGE_LIVE_STORE_FAILED",
        provenanceFor({
          evidenceIds: ["evidence:duplicate-merge-live-controlled-failure"],
          generatedAt: input.graph.generatedAt,
          generationMethod: "live-store-query",
          provider: input.provider,
        }),
      );
    case "success":
    default:
      return null;
  }
}

function scenarioApplyResult(input: {
  generatedAt: string;
  provider: LiveDuplicateMergeProvider;
  scenario: DuplicateMergeApplyScenario;
}): DuplicateMergeApplyResult | null {
  switch (input.scenario) {
    case "pending":
      return failure(
        "DUPLICATE_MERGE_PENDING_REVIEW",
        provenanceFor({
          evidenceIds: ["evidence:duplicate-merge-live-pending"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-query",
          provider: input.provider,
        }),
      );
    case "blocked":
      return failure(
        "DUPLICATE_MERGE_CONFIRMATION_BLOCKED",
        provenanceFor({
          evidenceIds: ["evidence:duplicate-merge-live-blocked"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-confirmation",
          provider: input.provider,
        }),
      );
    case "failure":
      return failure(
        "DUPLICATE_MERGE_LIVE_STORE_FAILED",
        provenanceFor({
          evidenceIds: ["evidence:duplicate-merge-live-controlled-failure"],
          generatedAt: input.generatedAt,
          generationMethod: "live-store-query",
          provider: input.provider,
        }),
      );
    case "success":
    default:
      return null;
  }
}

function actorLabelFor(actorLabel?: string | null): string {
  return nonEmpty(actorLabel) ?? "Live reviewer";
}

function isDuplicateMergeFailure(
  result: ReadDuplicateMergeGraphResult,
): result is DuplicateDetectionMergeFailure {
  return "success" in result && result.success === false;
}

async function readGraph(input: {
  now: string;
  provider: LiveDuplicateMergeProvider | null | undefined;
}): Promise<ReadDuplicateMergeGraphResult> {
  if (!input.provider) {
    return failure(
      "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  try {
    return {
      graph: await input.provider.readDuplicateMergeGraph(),
      provider: input.provider,
    };
  } catch {
    return failure(
      "DUPLICATE_MERGE_LIVE_STORE_FAILED",
      provenanceFor({
        evidenceIds: ["evidence:duplicate-merge-live-store-failed"],
        generatedAt: input.now,
        generationMethod: "live-store-query",
        provider: input.provider,
        readExecuted: true,
      }),
    );
  }
}

export function createLiveDuplicateMergeService({
  now = () => new Date().toISOString(),
  provider,
}: LiveDuplicateMergeServiceOptions = {}): DuplicateDetectionMergeService {
  return {
    async listMergeSuggestions(
      input = {},
    ): Promise<DuplicateMergeSuggestionsResult> {
      const readResult = await readGraph({
        now: now(),
        provider,
      });

      if (isDuplicateMergeFailure(readResult)) {
        return readResult;
      }

      const matches = matchesFor(readResult);
      const scenarioResult = scenarioSuggestionsResult({
        ...readResult,
        matches,
        scenario: normalizeListScenario(input.scenario),
      });

      if (scenarioResult) {
        return scenarioResult;
      }

      return suggestionsSuccess(
        listPayloadFor({
          ...readResult,
          matches,
        }),
      );
    },

    async applyMergeSuggestion(
      input: DuplicateMergeApplyInput,
    ): Promise<DuplicateMergeApplyResult> {
      const generatedAt = now();
      const readResult = await readGraph({
        now: generatedAt,
        provider,
      });

      if (isDuplicateMergeFailure(readResult)) {
        return readResult;
      }

      const scenarioResult = scenarioApplyResult({
        generatedAt: readResult.graph.generatedAt,
        provider: readResult.provider,
        scenario: normalizeApplyScenario(input.scenario),
      });

      if (scenarioResult) {
        return scenarioResult;
      }

      const match = matchesFor(readResult).find(
        (candidate) => candidate.suggestion.id === input.suggestionId,
      );

      if (!match) {
        return failure(
          "DUPLICATE_MERGE_SUGGESTION_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:duplicate-merge-live-not-found"],
            generatedAt: readResult.graph.generatedAt,
            generationMethod: "live-store-query",
            provider: readResult.provider,
          }),
        );
      }

      return applySuccess(
        applyPayloadFor({
          actorLabel: actorLabelFor(input.actorLabel),
          confirmedAt: generatedAt,
          match,
          provider: readResult.provider,
        }),
      );
    },
  };
}
