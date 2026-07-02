import {
  CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS,
  type ContactAcquisitionDraft,
  type ContactAcquisitionDraftErrorCode,
  type ContactAcquisitionDraftFailure,
  type ContactAcquisitionDraftInput,
  type ContactAcquisitionDraftPayload,
  type ContactAcquisitionDraftProvenance,
  type ContactAcquisitionDraftResult,
  type ContactAcquisitionDraftScenario,
  type ContactAcquisitionDraftSuccess,
  type ContactDraftConfirmationInput,
  type ContactDraftConfirmationPayload,
  type ContactDraftConfirmationResult,
  type ContactDraftConfirmationScenario,
  type ContactDraftConfirmationSuccess,
  type ContactDraftEvidence,
} from "./contract";
import type { ContactAcquisitionDraftService } from "./service";
import type {
  LiveContactAcquisitionAttendeeRecord,
  LiveContactAcquisitionDraftGraph,
  LiveContactAcquisitionDraftProvider,
} from "./storage/contact-draft-live-record-provider";
import type {
  EventDTO,
  EventParticipantIntentDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";

export interface LiveContactAcquisitionDraftServiceOptions {
  now?: () => string;
  provider?: LiveContactAcquisitionDraftProvider | null;
}

const supportedListScenarios = new Set<ContactAcquisitionDraftScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<ContactDraftConfirmationScenario>([
    "success",
    "failure",
    "blocked",
  ]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ContactAcquisitionDraftPayload,
): ContactAcquisitionDraftSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: ContactDraftConfirmationPayload,
): ContactDraftConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function normalizeListScenario(
  scenario?: ContactAcquisitionDraftInput["scenario"],
): ContactAcquisitionDraftScenario {
  if (
    scenario &&
    supportedListScenarios.has(scenario as ContactAcquisitionDraftScenario)
  ) {
    return scenario as ContactAcquisitionDraftScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: ContactDraftConfirmationInput["scenario"],
): ContactDraftConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as ContactDraftConfirmationScenario,
    )
  ) {
    return scenario as ContactDraftConfirmationScenario;
  }

  return "success";
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function unconfiguredProvenance(now: string): ContactAcquisitionDraftProvenance {
  return {
    source: "live-record-store:contact-drafts:unconfigured",
    sourceLabel: "Unconfigured contact acquisition draft live store",
    evidenceIds: ["evidence:contact-draft-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-contact-acquisition-drafts",
    generationMethod: "live-store-query",
    liveDatabaseReadExecuted: false,
    contactDraftWriteExecuted: false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function failure(
  code: ContactAcquisitionDraftErrorCode,
  provenance: ContactAcquisitionDraftProvenance,
): ContactAcquisitionDraftFailure {
  const definition = CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS[code];

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

function provenanceFor(input: {
  evidenceIds: readonly string[];
  generatedAt: string;
  generationMethod: ContactAcquisitionDraftProvenance["generationMethod"];
  provider: LiveContactAcquisitionDraftProvider;
  writeExecuted?: boolean;
}): ContactAcquisitionDraftProvenance {
  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      input.evidenceIds.length > 0
        ? unique(input.evidenceIds)
        : ["evidence:contact-draft-live-store-empty"],
    collectedAt: input.generatedAt,
    privacy: "live-contact-acquisition-drafts",
    generationMethod: input.generationMethod,
    liveDatabaseReadExecuted: true,
    contactDraftWriteExecuted: input.writeExecuted ?? false,
    contactWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function eventFor(
  attendee: LiveContactAcquisitionAttendeeRecord,
  eventsById: ReadonlyMap<string, EventDTO>,
): EventDTO | null {
  return eventsById.get(attendee.eventId) ?? null;
}

function intentFor(
  attendee: LiveContactAcquisitionAttendeeRecord,
  intentsByAttendeeId: ReadonlyMap<string, EventParticipantIntentDTO>,
): EventParticipantIntentDTO | null {
  return intentsByAttendeeId.get(attendee.id) ?? null;
}

function personFor(
  attendee: LiveContactAcquisitionAttendeeRecord,
  peopleById: ReadonlyMap<string, NetworkPersonDTO>,
): NetworkPersonDTO | null {
  return attendee.personId ? peopleById.get(attendee.personId) ?? null : null;
}

function relationshipContextFor(input: {
  event: EventDTO | null;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
}): string {
  const lookingFor = input.intent?.lookingFor.join("; ");
  const canOffer = input.intent?.canOffer.join("; ");

  return [
    input.event ? `Event: ${input.event.name}.` : null,
    lookingFor ? `Looking for: ${lookingFor}.` : null,
    canOffer ? `Can offer: ${canOffer}.` : null,
    input.person?.profileSnippet ?? null,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function confidenceFor(intent: EventParticipantIntentDTO | null):
  | "high"
  | "low"
  | "medium" {
  if (!intent) {
    return "low";
  }

  if (intent.confidence >= 0.82) {
    return "high";
  }

  if (intent.confidence >= 0.62) {
    return "medium";
  }

  return "low";
}

function evidenceFor(input: {
  attendee: LiveContactAcquisitionAttendeeRecord;
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
  sourceLabel: string;
}): readonly ContactDraftEvidence[] {
  return input.attendee.evidenceIds.map((evidenceId) => {
    const evidence = input.evidenceById.get(evidenceId);

    return {
      evidenceId,
      source: {
        type: "event_import",
        id: input.attendee.source.id,
        label: input.sourceLabel,
      },
      sourceLabel: evidence?.sourceId ?? input.sourceLabel,
      excerpt:
        evidence?.summary ??
        `${input.attendee.displayName} was derived from live event attendee storage.`,
      capturedFields: ["displayName", "organization", "relationshipContext"],
      createdAt: evidence?.occurredAt ?? input.attendee.createdAt,
      createdBy: "live-contact-acquisition-draft-service",
    };
  });
}

function derivedDraftFor(input: {
  attendee: LiveContactAcquisitionAttendeeRecord;
  event: EventDTO | null;
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>;
  generatedAt: string;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
  provider: LiveContactAcquisitionDraftProvider;
}): ContactAcquisitionDraft {
  const sourceLabel =
    input.attendee.source.label ??
    input.event?.source.label ??
    "Live event attendee";
  const evidenceIds = unique([
    ...input.attendee.evidenceIds,
    ...(input.intent?.evidenceIds ?? []),
    ...(input.person?.evidenceIds ?? []),
  ]);
  const provenance = provenanceFor({
    evidenceIds,
    generatedAt: input.generatedAt,
    generationMethod: "live-store-derived-event-draft",
    provider: input.provider,
  });

  return {
    id: `event-draft:live:${input.attendee.eventId}:${input.attendee.id}`,
    status: "pending_confirmation",
    source: {
      type: "event_import",
      id: input.attendee.source.id,
      label: sourceLabel,
    },
    displayName: input.attendee.displayName,
    role: input.attendee.role ?? input.person?.role ?? "Attendee",
    organization:
      input.attendee.organization ?? input.person?.organization ?? "",
    relationshipContext: relationshipContextFor({
      event: input.event,
      intent: input.intent,
      person: input.person,
    }),
    suggestedNextAction:
      "Review the live event attendee evidence before confirming this contact draft.",
    confidence: confidenceFor(input.intent),
    createdAt: input.attendee.createdAt,
    confirmation: {
      required: true,
      state: "pending",
      question: `Confirm adding ${input.attendee.displayName} from live event attendee evidence?`,
    },
    evidence: evidenceFor({
      attendee: input.attendee,
      evidenceById: input.evidenceById,
      sourceLabel,
    }),
    provenance,
  };
}

function draftsFor(input: {
  graph: LiveContactAcquisitionDraftGraph;
  provider: LiveContactAcquisitionDraftProvider;
}): readonly ContactAcquisitionDraft[] {
  const existingDraftIds = new Set(
    input.graph.contactDrafts.map((draft) => draft.id),
  );
  const eventsById = new Map(input.graph.events.map((event) => [event.id, event]));
  const intentsByAttendeeId = new Map(
    input.graph.intents.map((intent) => [intent.attendeeId, intent]),
  );
  const peopleById = new Map(
    input.graph.networkPeople.map((person) => [person.id, person]),
  );
  const evidenceById = new Map(
    input.graph.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const derivedDrafts = input.graph.attendees
    .map((attendee) =>
      derivedDraftFor({
        attendee,
        event: eventFor(attendee, eventsById),
        evidenceById,
        generatedAt: input.graph.generatedAt,
        intent: intentFor(attendee, intentsByAttendeeId),
        person: personFor(attendee, peopleById),
        provider: input.provider,
      }),
    )
    .filter((draft) => !existingDraftIds.has(draft.id));

  return [...input.graph.contactDrafts, ...derivedDrafts];
}

function listPayloadFor(input: {
  drafts: readonly ContactAcquisitionDraft[];
  graph: LiveContactAcquisitionDraftGraph;
  provider: LiveContactAcquisitionDraftProvider;
  state?: "empty" | "pending" | "success";
}): ContactAcquisitionDraftPayload {
  const state =
    input.state ?? (input.drafts.length > 0 ? "success" : "empty");
  const evidenceIds = unique(
    input.drafts.flatMap((draft) => draft.provenance.evidenceIds),
  );
  const hasDerivedDraft = input.drafts.some(
    (draft) => draft.provenance.generationMethod === "live-store-derived-event-draft",
  );

  return {
    state,
    drafts: input.drafts,
    summary:
      state === "success"
        ? `${input.drafts.length} live contact acquisition draft(s) are staged for confirmation.`
        : "No live contact acquisition drafts are staged.",
    provenance: provenanceFor({
      evidenceIds,
      generatedAt: input.graph.generatedAt,
      generationMethod: hasDerivedDraft
        ? "live-store-derived-event-draft"
        : "live-store-query",
      provider: input.provider,
    }),
    nextAction:
      state === "success"
        ? "Review source evidence before confirming any live contact draft."
        : "Import event attendees or create a live draft before confirming contacts.",
  };
}

function scenarioResult(input: {
  drafts: readonly ContactAcquisitionDraft[];
  graph: LiveContactAcquisitionDraftGraph;
  provider: LiveContactAcquisitionDraftProvider;
  scenario: ContactAcquisitionDraftScenario;
}): ContactAcquisitionDraftResult | null {
  switch (input.scenario) {
    case "empty":
      return success(
        listPayloadFor({
          drafts: [],
          graph: input.graph,
          provider: input.provider,
          state: "empty",
        }),
      );
    case "pending":
      return success(
        listPayloadFor({
          drafts: input.drafts.slice(0, 1),
          graph: input.graph,
          provider: input.provider,
          state: "pending",
        }),
      );
    case "failure":
      return failure(
        "CONTACT_DRAFT_PIPELINE_FAILED",
        provenanceFor({
          evidenceIds: ["evidence:contact-draft-live-controlled-failure"],
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

function resolveActorLabel(actorLabel?: string | null): string {
  const normalizedActor = actorLabel?.trim();

  return normalizedActor ? normalizedActor : "Live operator";
}

async function readDrafts(input: {
  provider: LiveContactAcquisitionDraftProvider | null;
  scenario?: ContactAcquisitionDraftInput["scenario"];
  now: string;
}): Promise<ContactAcquisitionDraftResult> {
  if (!input.provider) {
    return failure(
      "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  const graph = await input.provider.readDraftGraph();
  const drafts = draftsFor({ graph, provider: input.provider });
  const scenario = scenarioResult({
    drafts,
    graph,
    provider: input.provider,
    scenario: normalizeListScenario(input.scenario),
  });

  if (scenario) {
    return scenario;
  }

  return success(
    listPayloadFor({
      drafts,
      graph,
      provider: input.provider,
    }),
  );
}

async function confirmDraft(input: {
  actorLabel?: string | null;
  draftId: string;
  now: string;
  provider: LiveContactAcquisitionDraftProvider | null;
  scenario?: ContactDraftConfirmationInput["scenario"];
}): Promise<ContactDraftConfirmationResult> {
  if (!input.provider) {
    return failure(
      "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
  }

  switch (normalizeConfirmationScenario(input.scenario)) {
    case "failure":
      return failure(
        "CONTACT_DRAFT_PIPELINE_FAILED",
        provenanceFor({
          evidenceIds: ["evidence:contact-draft-live-controlled-failure"],
          generatedAt: input.now,
          generationMethod: "live-store-confirmation",
          provider: input.provider,
        }),
      );
    case "blocked":
      return failure(
        "CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED",
        provenanceFor({
          evidenceIds: ["evidence:contact-draft-live-confirmation-blocked"],
          generatedAt: input.now,
          generationMethod: "live-store-confirmation",
          provider: input.provider,
        }),
      );
    case "success":
    default:
      break;
  }

  const graph = await input.provider.readDraftGraph();
  const draft = draftsFor({ graph, provider: input.provider }).find(
    (candidate) => candidate.id === input.draftId,
  );

  if (!draft) {
    return failure(
      "CONTACT_DRAFT_NOT_FOUND",
      provenanceFor({
        evidenceIds: ["evidence:contact-draft-live-not-found"],
        generatedAt: graph.generatedAt,
        generationMethod: "live-store-query",
        provider: input.provider,
      }),
    );
  }

  if (draft.status !== "pending_confirmation") {
    return failure(
      "CONTACT_DRAFT_ALREADY_CONFIRMED",
      provenanceFor({
        evidenceIds: draft.provenance.evidenceIds,
        generatedAt: graph.generatedAt,
        generationMethod: "live-store-query",
        provider: input.provider,
      }),
    );
  }

  const actorLabel = resolveActorLabel(input.actorLabel);
  const createdEvidence: ContactDraftEvidence = {
    evidenceId: `evidence:contact-draft-confirmed:${draft.id}`,
    source: draft.source,
    sourceLabel: "Live contact acquisition draft confirmation",
    excerpt: `${actorLabel} confirmed ${draft.displayName} after reviewing live source evidence.`,
    capturedFields: ["confirmation", "source", "evidenceIds"],
    createdAt: input.now,
    createdBy: "live-contact-acquisition-draft-service",
  };
  const evidenceIds = unique([
    ...draft.provenance.evidenceIds,
    createdEvidence.evidenceId,
  ]);
  const confirmedDraft: ContactAcquisitionDraft = {
    ...draft,
    status: "confirmed",
    confirmation: {
      ...draft.confirmation,
      state: "confirmed",
      actorLabel,
      confirmedAt: input.now,
    },
    evidence: [...draft.evidence, createdEvidence],
    provenance: provenanceFor({
      evidenceIds,
      generatedAt: input.now,
      generationMethod: "live-store-confirmation",
      provider: input.provider,
      writeExecuted: true,
    }),
  };
  const savedDraft = await input.provider.upsertContactDraft(
    confirmedDraft,
    input.now,
  );

  return confirmationSuccess({
    state: "confirmed",
    confirmedDraft: savedDraft,
    contactCandidate: {
      candidateId: `contact-candidate:${savedDraft.id}`,
      displayName: savedDraft.displayName,
      role: savedDraft.role,
      organization: savedDraft.organization,
      relationshipContext: savedDraft.relationshipContext,
      source: savedDraft.source,
      evidenceIds: savedDraft.provenance.evidenceIds,
      readyForContactWrite: true,
      contactWriteExecuted: false,
    },
    createdEvidence,
    confirmedAt: input.now,
    provenance: savedDraft.provenance,
    nextAction:
      "Send this candidate to the contact record service only after preserving the source and evidence ids.",
  });
}

export function createLiveContactAcquisitionDraftService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveContactAcquisitionDraftServiceOptions = {}): ContactAcquisitionDraftService {
  return {
    listContactDrafts(input = {}) {
      return readDrafts({
        now: now(),
        provider,
        scenario: input.scenario,
      });
    },

    confirmContactDraft(input) {
      return confirmDraft({
        actorLabel: input.actorLabel,
        draftId: input.draftId,
        now: now(),
        provider,
        scenario: input.scenario,
      });
    },
  };
}
