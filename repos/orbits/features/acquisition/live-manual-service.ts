import {
  MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS,
  type ManualContactCandidate,
  type ManualContactConfirmationInput,
  type ManualContactConfirmationPayload,
  type ManualContactConfirmationResult,
  type ManualContactConfirmationScenario,
  type ManualContactCreationErrorCode,
  type ManualContactCreationFailure,
  type ManualContactCreationInput,
  type ManualContactCreationPayload,
  type ManualContactCreationProvenance,
  type ManualContactCreationResult,
  type ManualContactCreationScenario,
  type ManualContactCreationService,
  type ManualContactCreationSuccess,
  type ManualContactDraft,
  type ManualContactEvidence,
  type ManualContactSourceReference,
} from "./manual-contract";
import type {
  ContactAcquisitionDraft,
  ContactDraftEvidence,
} from "./contract";
import type { LiveContactAcquisitionDraftProvider } from "./storage/contact-draft-live-record-provider";

export interface LiveManualContactCreationServiceOptions {
  now?: () => string;
  provider?: LiveContactAcquisitionDraftProvider | null;
}

type StoredManualContactDraft = ContactAcquisitionDraft & {
  note?: string;
  tags?: readonly string[];
  followUpHint?: string;
};

const supportedCreationScenarios = new Set<ManualContactCreationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<ManualContactConfirmationScenario>([
    "success",
    "blocked",
    "failure",
  ]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ManualContactCreationPayload,
): ManualContactCreationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: ManualContactConfirmationPayload,
): { success: true; data: ManualContactConfirmationPayload } {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function normalizeCreationScenario(
  scenario?: ManualContactCreationInput["scenario"],
): ManualContactCreationScenario {
  if (
    scenario &&
    supportedCreationScenarios.has(scenario as ManualContactCreationScenario)
  ) {
    return scenario as ManualContactCreationScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: ManualContactConfirmationInput["scenario"],
): ManualContactConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as ManualContactConfirmationScenario,
    )
  ) {
    return scenario as ManualContactConfirmationScenario;
  }

  return "success";
}

function nonEmpty(value?: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function tagsFor(tags?: readonly string[] | null): readonly string[] {
  return (
    tags
      ?.map((tag) => tag.trim())
      .filter((tag) => tag.length > 0) ?? []
  );
}

function slugFor(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || "manual";
}

function actorLabelFor(actorLabel?: string | null): string {
  return nonEmpty(actorLabel) ?? "Live reviewer";
}

function sourceFor(
  inputSource: Partial<ManualContactSourceReference> | null | undefined,
  displayName: string,
): ManualContactSourceReference {
  return {
    type: "manual",
    id:
      nonEmpty(inputSource?.id) ??
      `source:manual-note:${slugFor(displayName)}`,
    label: nonEmpty(inputSource?.label) ?? "Live manual contact note",
  };
}

function displayNameFrom(input: ManualContactCreationInput): string {
  const explicit = nonEmpty(input.displayName);

  if (explicit) {
    return explicit;
  }

  const note = nonEmpty(input.note) ?? "";
  const fromMatch = note.match(/^(.+?)\s+from\s+(.+?)(?:\s+asked|\s+after|\.|$)/iu);

  return nonEmpty(fromMatch?.[1]) ?? "Manual contact";
}

function organizationFrom(input: ManualContactCreationInput): string {
  const explicit = nonEmpty(input.organization);

  if (explicit) {
    return explicit;
  }

  const note = nonEmpty(input.note) ?? "";
  const fromMatch = note.match(/\sfrom\s+(.+?)(?:\s+asked|\s+after|\.|$)/iu);

  return nonEmpty(fromMatch?.[1]) ?? "Unknown organization";
}

function roleFrom(input: ManualContactCreationInput): string {
  return nonEmpty(input.role) ?? "Relationship candidate";
}

function unconfiguredProvenance(now: string): ManualContactCreationProvenance {
  return {
    source: "live-record-store:manual-contact-creation:unconfigured",
    sourceLabel: "Unconfigured manual contact live store",
    evidenceIds: ["evidence:manual-contact-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-manual-contact-creation",
    generationMethod: "live-store-manual-contact-draft",
    liveDatabaseReadExecuted: false,
    contactDraftWriteExecuted: false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod: ManualContactCreationProvenance["generationMethod"];
  provider: LiveContactAcquisitionDraftProvider;
  readExecuted?: boolean;
  writeExecuted?: boolean;
}): ManualContactCreationProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds: input.evidenceIds,
    collectedAt: input.generatedAt,
    privacy: "live-manual-contact-creation",
    generationMethod: input.generationMethod,
    liveDatabaseReadExecuted: input.readExecuted ?? false,
    contactDraftWriteExecuted: input.writeExecuted ?? false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function failure(
  code: ManualContactCreationErrorCode,
  provenance: ManualContactCreationProvenance,
): ManualContactCreationFailure {
  const definition = MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS[code];

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

function manualEvidenceFromContactEvidence(
  evidence: ContactDraftEvidence,
): ManualContactEvidence {
  return {
    evidenceId: evidence.evidenceId,
    source: {
      type: "manual",
      id: evidence.source.id,
      label: evidence.source.label,
    },
    sourceLabel: evidence.sourceLabel,
    excerpt: evidence.excerpt,
    capturedFields: evidence.capturedFields,
    createdAt: evidence.createdAt,
    createdBy:
      evidence.createdBy === "live-contact-acquisition-draft-service"
        ? "live-manual-contact-service"
        : "mock-manual-service",
  };
}

function manualDraftFromContactDraft(
  draft: ContactAcquisitionDraft,
): ManualContactDraft {
  const stored = draft as StoredManualContactDraft;
  const note =
    nonEmpty(stored.note) ?? draft.relationshipContext;
  const tags = Array.isArray(stored.tags)
    ? stored.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id: draft.id,
    status: draft.status,
    source: {
      type: "manual",
      id: draft.source.id,
      label: draft.source.label,
    },
    displayName: draft.displayName,
    role: draft.role,
    organization: draft.organization,
    note,
    tags,
    followUpHint:
      nonEmpty(stored.followUpHint) ?? draft.suggestedNextAction,
    relationshipContext: draft.relationshipContext,
    suggestedNextAction: draft.suggestedNextAction,
    duplicateCheck: {
      mode: "live-store-review",
      result: "clear",
      rule: "Live manual intake does not run external duplicate lookup; downstream contact write must preserve source evidence.",
      possibleMatchIds: [],
      externalLookupExecuted: false,
    },
    confirmation: draft.confirmation,
    evidence: draft.evidence.map(manualEvidenceFromContactEvidence),
    provenance: provenanceFromContactDraft(draft),
    createdAt: draft.createdAt,
  };
}

function provenanceFromContactDraft(
  draft: ContactAcquisitionDraft,
): ManualContactCreationProvenance {
  return {
    source: draft.provenance.source,
    sourceLabel: draft.provenance.sourceLabel,
    evidenceIds: draft.provenance.evidenceIds,
    collectedAt: draft.provenance.collectedAt,
    privacy: "live-manual-contact-creation",
    generationMethod:
      draft.provenance.generationMethod === "live-store-confirmation"
        ? "live-store-confirmation"
        : "live-store-manual-contact-draft",
    liveDatabaseReadExecuted: draft.provenance.liveDatabaseReadExecuted ?? false,
    contactDraftWriteExecuted:
      draft.provenance.contactDraftWriteExecuted ?? false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function contactDraftFromManualInput(input: {
  generatedAt: string;
  provider: LiveContactAcquisitionDraftProvider;
  source: ManualContactSourceReference;
  displayName: string;
  role: string;
  organization: string;
  note: string;
  tags: readonly string[];
  followUpHint: string;
}): StoredManualContactDraft {
  const seed = `${input.displayName}:${input.organization}:${input.generatedAt}`;
  const draftId = `manual-draft:live:${slugFor(seed)}`;
  const evidenceId = `evidence:manual-contact-live:${draftId}`;
  const evidence: ContactDraftEvidence = {
    evidenceId,
    source: input.source,
    sourceLabel: input.source.label,
    excerpt: input.note,
    capturedFields: [
      "displayName",
      "organization",
      "role",
      "note",
      "tags",
      "followUpHint",
    ],
    createdAt: input.generatedAt,
    createdBy: "live-contact-acquisition-draft-service",
  };

  return {
    id: draftId,
    status: "pending_confirmation",
    source: input.source,
    displayName: input.displayName,
    role: input.role,
    organization: input.organization,
    relationshipContext: `Manual note: ${input.note}`,
    suggestedNextAction:
      input.followUpHint ||
      "Review the manual note evidence before confirming this contact candidate.",
    confidence: "medium",
    createdAt: input.generatedAt,
    confirmation: {
      required: true,
      state: "pending",
      question: `Confirm adding ${input.displayName} from the manual note?`,
    },
    evidence: [evidence],
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds: [evidenceId],
      collectedAt: input.generatedAt,
      privacy: "live-contact-acquisition-drafts",
      generationMethod: "live-store-query",
      liveDatabaseReadExecuted: false,
      contactDraftWriteExecuted: true,
      contactWriteExecuted: false,
      externalNetworkRequested: false,
    },
    note: input.note,
    tags: input.tags,
    followUpHint: input.followUpHint,
  };
}

function creationPayload(
  draft: ManualContactDraft,
): ManualContactCreationPayload {
  return {
    state: "success",
    draft,
    summary:
      "One live manual contact draft was staged in the shared contact draft queue without creating a contact.",
    provenance: draft.provenance,
    nextAction:
      "Review the manual note evidence before confirming this contact candidate.",
  };
}

function emptyPayload(
  now: string,
  provider: LiveContactAcquisitionDraftProvider,
): ManualContactCreationPayload {
  const provenance = provenanceFor({
    evidenceIds: ["evidence:manual-contact-live-empty"],
    generatedAt: now,
    generationMethod: "live-store-manual-contact-draft",
    provider,
    readExecuted: false,
    writeExecuted: false,
  });

  return {
    state: "empty",
    draft: null,
    summary: "No manual note was supplied, so no live contact draft was staged.",
    provenance,
    nextAction: "Capture a manual note before staging a contact draft.",
  };
}

function candidateFromDraft(draft: ManualContactDraft): ManualContactCandidate {
  return {
    candidateId: `contact-candidate:${draft.id}`,
    displayName: draft.displayName,
    role: draft.role,
    organization: draft.organization,
    relationshipContext: draft.relationshipContext,
    source: draft.source,
    note: draft.note,
    tags: draft.tags,
    followUpHint: draft.followUpHint,
    evidenceIds: draft.provenance.evidenceIds,
    readyForContactWrite: true,
    contactWriteExecuted: false,
    duplicateLookupExecuted: false,
  };
}

function confirmedContactDraft(input: {
  actorLabel: string;
  confirmedAt: string;
  draft: ContactAcquisitionDraft;
  provider: LiveContactAcquisitionDraftProvider;
}): StoredManualContactDraft {
  const stored = input.draft as StoredManualContactDraft;
  const evidenceId = `evidence:manual-contact-confirmed:${input.draft.id}`;
  const confirmationEvidence: ContactDraftEvidence = {
    evidenceId,
    source: input.draft.source,
    sourceLabel: "Operator manual contact confirmation",
    excerpt: `${input.actorLabel} confirmed ${input.draft.displayName} from manual source evidence.`,
    capturedFields: ["confirmation", "source", "note", "tags", "followUpHint"],
    createdAt: input.confirmedAt,
    createdBy: "live-contact-acquisition-draft-service",
  };

  return {
    ...stored,
    status: "confirmed",
    confirmation: {
      ...input.draft.confirmation,
      state: "confirmed",
      actorLabel: input.actorLabel,
      confirmedAt: input.confirmedAt,
    },
    evidence: [...input.draft.evidence, confirmationEvidence],
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds: [...input.draft.provenance.evidenceIds, evidenceId],
      collectedAt: input.confirmedAt,
      privacy: "live-contact-acquisition-drafts",
      generationMethod: "live-store-confirmation",
      liveDatabaseReadExecuted: true,
      contactDraftWriteExecuted: true,
      contactWriteExecuted: false,
      externalNetworkRequested: false,
    },
  };
}

export function createLiveManualContactCreationService({
  now = () => new Date().toISOString(),
  provider,
}: LiveManualContactCreationServiceOptions = {}): ManualContactCreationService {
  return {
    async createManualContactDraft(
      input = {},
    ): Promise<ManualContactCreationResult> {
      const generatedAt = now();

      if (!provider) {
        return failure(
          "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED",
          unconfiguredProvenance(generatedAt),
        );
      }

      switch (normalizeCreationScenario(input.scenario)) {
        case "empty":
          return success(emptyPayload(generatedAt, provider));
        case "pending": {
          const graph = await provider.readDraftGraph();
          const pendingDraft = graph.contactDrafts.find(
            (draft) =>
              draft.source.type === "manual" &&
              draft.status === "pending_confirmation",
          );

          if (!pendingDraft) {
            return success(emptyPayload(generatedAt, provider));
          }

          return success(creationPayload(manualDraftFromContactDraft(pendingDraft)));
        }
        case "failure":
          return failure(
            "MANUAL_CONTACT_LIVE_STORE_FAILED",
            provenanceFor({
              evidenceIds: ["evidence:manual-contact-live-controlled-failure"],
              generatedAt,
              generationMethod: "live-store-manual-contact-draft",
              provider,
            }),
          );
        case "success":
        default:
          break;
      }

      const note = nonEmpty(input.note);

      if (!note) {
        return failure(
          "MANUAL_CONTACT_NOTE_REQUIRED",
          provenanceFor({
            evidenceIds: ["evidence:manual-contact-live-note-required"],
            generatedAt,
            generationMethod: "live-store-manual-contact-draft",
            provider,
          }),
        );
      }

      const displayName = displayNameFrom(input);
      const organization = organizationFrom(input);
      const role = roleFrom(input);
      const source = sourceFor(input.source, displayName);
      const contactDraft = contactDraftFromManualInput({
        generatedAt,
        provider,
        source,
        displayName,
        role,
        organization,
        note,
        tags: tagsFor(input.tags),
        followUpHint: nonEmpty(input.followUpHint) ?? "",
      });
      const saved = await provider.upsertContactDraft(contactDraft, generatedAt);
      const manualDraft = manualDraftFromContactDraft({
        ...saved,
        note: contactDraft.note,
        tags: contactDraft.tags,
        followUpHint: contactDraft.followUpHint,
      } as StoredManualContactDraft);

      return success(creationPayload(manualDraft));
    },

    async confirmManualContactDraft(
      input,
    ): Promise<ManualContactConfirmationResult> {
      const confirmedAt = now();

      if (!provider) {
        return failure(
          "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED",
          unconfiguredProvenance(confirmedAt),
        );
      }

      switch (normalizeConfirmationScenario(input.scenario)) {
        case "failure":
          return failure(
            "MANUAL_CONTACT_LIVE_STORE_FAILED",
            provenanceFor({
              evidenceIds: ["evidence:manual-contact-live-confirm-failure"],
              generatedAt: confirmedAt,
              generationMethod: "live-store-confirmation",
              provider,
              readExecuted: true,
            }),
          );
        case "blocked":
          return failure(
            "MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED",
            provenanceFor({
              evidenceIds: ["evidence:manual-contact-live-confirm-blocked"],
              generatedAt: confirmedAt,
              generationMethod: "live-store-confirmation",
              provider,
              readExecuted: true,
            }),
          );
        case "success":
        default:
          break;
      }

      const graph = await provider.readDraftGraph();
      const existingDraft = graph.contactDrafts.find(
        (draft) =>
          draft.id === input.draftId && draft.source.type === "manual",
      );

      if (!existingDraft) {
        return failure(
          "MANUAL_CONTACT_DRAFT_NOT_FOUND",
          provenanceFor({
            evidenceIds: ["evidence:manual-contact-live-missing-draft"],
            generatedAt: confirmedAt,
            generationMethod: "live-store-confirmation",
            provider,
            readExecuted: true,
          }),
        );
      }

      const updated = confirmedContactDraft({
        actorLabel: actorLabelFor(input.actorLabel),
        confirmedAt,
        draft: existingDraft,
        provider,
      });
      const saved = await provider.upsertContactDraft(updated, confirmedAt);
      const confirmedDraft = manualDraftFromContactDraft({
        ...saved,
        note: updated.note,
        tags: updated.tags,
        followUpHint: updated.followUpHint,
      } as StoredManualContactDraft);
      const createdEvidence = confirmedDraft.evidence.at(-1);

      if (!createdEvidence) {
        return failure(
          "MANUAL_CONTACT_LIVE_STORE_FAILED",
          provenanceFor({
            evidenceIds: ["evidence:manual-contact-live-confirm-evidence-missing"],
            generatedAt: confirmedAt,
            generationMethod: "live-store-confirmation",
            provider,
            readExecuted: true,
            writeExecuted: true,
          }),
        );
      }

      return confirmationSuccess({
        state: "confirmed",
        confirmedDraft,
        contactCandidate: candidateFromDraft(confirmedDraft),
        createdEvidence,
        confirmedAt,
        provenance: confirmedDraft.provenance,
        nextAction:
          "Hand this source-backed candidate to the contact record service only after preserving manual note evidence.",
      });
    },
  };
}
