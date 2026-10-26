import { createHash } from "node:crypto";

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
  type ContactDraftDiscardInput,
  type ContactDraftDiscardResult,
  type ContactDraftEvidence,
} from "./contract";
import type { ContactAcquisitionDraftService } from "./service";
import type {
  LiveContactAcquisitionAttendeeRecord,
  LiveContactAcquisitionDraftGraph,
  LiveContactAcquisitionDraftProvider,
} from "./storage/contact-draft-live-record-provider";
import type {
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import type { ContactRecordWriteProvider } from "../contacts/contact-write-contract";

export interface LiveContactAcquisitionDraftServiceOptions {
  /**
   * QA-C2: with an actor and a contact store, the queue leaves out attendees who
   * are already in the network (one draft per person), and confirming an
   * event-attendee draft adds the person (or links the existing contact).
   */
  actorId?: string;
  contactProvider?: ContactRecordWriteProvider | null;
  now?: () => string;
  provider?: LiveContactAcquisitionDraftProvider | null;
}

/** A stored draft the reviewer set aside (破棄); kept so the derived one never comes back. */
type StoredContactDraft = ContactAcquisitionDraft & {
  contactId?: string;
  discardedAt?: string;
};

function isDiscarded(draft: ContactAcquisitionDraft): boolean {
  const discardedAt = (draft as StoredContactDraft).discardedAt;
  return typeof discardedAt === "string" && discardedAt.length > 0;
}

function comparable(value: string | undefined | null): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
}

function personKeyFor(attendee: LiveContactAcquisitionAttendeeRecord): string {
  return attendee.personId
    ? `person:${attendee.personId}`
    : `name:${comparable(attendee.displayName)}|${comparable(attendee.organization)}`;
}

/** The contact already in the actor's network for this attendee, if any. */
function existingContactFor(
  attendee: LiveContactAcquisitionAttendeeRecord,
  contacts: readonly ContactDTO[],
): ContactDTO | null {
  if (attendee.contactId) {
    const linked = contacts.find((contact) => contact.id === attendee.contactId);
    if (linked) return linked;
  }
  if (attendee.personId) {
    const samePerson = contacts.find((contact) => contact.personId === attendee.personId);
    if (samePerson) return samePerson;
  }
  const name = comparable(attendee.displayName);
  const organization = comparable(attendee.organization);
  return (
    contacts.find(
      (contact) =>
        comparable(contact.displayName) === name &&
        (!organization || !contact.organization || comparable(contact.organization) === organization),
    ) ?? null
  );
}

function derivedDraftIdFor(attendee: LiveContactAcquisitionAttendeeRecord): string {
  return `event-draft:live:${attendee.eventId}:${attendee.id}`;
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
  // QA-C2: the queue shows "From <label>"; the event's name reads better than the
  // attendee import's internal label (e.g. "<name>的活动意向").
  const sourceLabel =
    input.event?.name ??
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
    id: derivedDraftIdFor(input.attendee),
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
  contacts?: readonly ContactDTO[] | null;
  graph: LiveContactAcquisitionDraftGraph;
  provider: LiveContactAcquisitionDraftProvider;
}): readonly ContactAcquisitionDraft[] {
  const existingDraftIds = new Set(
    input.graph.contactDrafts.map((draft) => draft.id),
  );
  // QA-C2: the same person attends many events. List each person once; a person
  // whose draft was already confirmed or set aside (stored) does not come back
  // through another event, and with the network at hand people who are already
  // contacts are left out.
  const seenPeople = new Set(
    input.graph.attendees
      .filter((attendee) => existingDraftIds.has(derivedDraftIdFor(attendee)))
      .map(personKeyFor),
  );
  const attendees = input.graph.attendees.filter((attendee) => {
    if (existingDraftIds.has(derivedDraftIdFor(attendee))) return false;
    if (input.contacts && existingContactFor(attendee, input.contacts)) return false;
    const key = personKeyFor(attendee);
    if (seenPeople.has(key)) return false;
    seenPeople.add(key);
    return true;
  });
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
  const derivedDrafts = attendees
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

  const attendeesByDraftId = new Map(
    input.graph.attendees.map((attendee) => [derivedDraftIdFor(attendee), attendee]),
  );
  const storedDrafts = input.graph.contactDrafts.filter((draft) => {
    if (isDiscarded(draft)) return false;
    const attendee = attendeesByDraftId.get(draft.id);
    return !(
      draft.status === "pending_confirmation" &&
      attendee &&
      input.contacts &&
      existingContactFor(attendee, input.contacts)
    );
  });

  return [...storedDrafts, ...derivedDrafts];
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

async function readNetwork(
  network: ActorNetwork | null,
): Promise<readonly ContactDTO[] | null> {
  return network ? network.contactProvider.listContacts(network.actorId) : null;
}

interface ActorNetwork {
  actorId: string;
  contactProvider: ContactRecordWriteProvider;
}

async function readDrafts(input: {
  network: ActorNetwork | null;
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

  const [graph, contacts] = await Promise.all([
    input.provider.readDraftGraph(),
    readNetwork(input.network),
  ]);
  const drafts = draftsFor({ contacts, graph, provider: input.provider });
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

function eventContactIdFor(actorId: string, personKey: string): string {
  const digest = createHash("sha256")
    .update(actorId)
    .update("\u0000")
    .update(personKey)
    .digest("hex")
    .slice(0, 24);

  return `contact:event:${digest}`;
}

/**
 * QA-C2: 確認して追加 on an event-attendee draft adds the person — or links the
 * contact already in the network (same contact id, person, or name + company).
 * The new contact's id is derived from the person, so a retry finds it again.
 */
async function contactForConfirmedDraft(input: {
  actorLabel: string;
  attendee: LiveContactAcquisitionAttendeeRecord | null;
  contacts: readonly ContactDTO[];
  draft: ContactAcquisitionDraft;
  event: EventDTO | null;
  network: ActorNetwork;
  now: string;
}): Promise<{ contactId: string; contactWriteExecuted: boolean }> {
  const attendee: LiveContactAcquisitionAttendeeRecord = input.attendee ?? {
    id: input.draft.id,
    eventId: "",
    displayName: input.draft.displayName,
    organization: input.draft.organization || undefined,
    status: "derived",
    source: { type: "event_import", id: input.draft.source.id },
    evidenceIds: ["evidence:contact-draft-confirmed"],
    createdAt: input.draft.createdAt,
    updatedAt: input.draft.createdAt,
  };
  const existing = existingContactFor(attendee, input.contacts);

  if (existing) {
    return { contactId: existing.id, contactWriteExecuted: false };
  }

  const contactId = eventContactIdFor(input.network.actorId, personKeyFor(attendee));
  const stored = await input.network.contactProvider.getContact(
    contactId,
    input.network.actorId,
  );

  if (stored) {
    return { contactId: stored.id, contactWriteExecuted: false };
  }

  const role = input.draft.role.trim();
  const organization = input.draft.organization.trim();
  const contact: ContactDTO = {
    id: contactId,
    ...(attendee.personId ? { personId: attendee.personId } : {}),
    displayName: input.draft.displayName.trim(),
    ...(organization ? { organization } : {}),
    ...(role && role !== "Attendee" ? { role } : {}),
    stage: "captured",
    source: {
      type: "event_import",
      id: input.draft.source.id,
      label: input.draft.source.label,
    },
    ...(input.event
      ? { metEventId: input.event.id, metEventTitle: input.event.name }
      : {}),
    evidenceIds: [
      ...new Set([
        ...input.draft.provenance.evidenceIds,
        `evidence:contact-draft-confirmed:${input.draft.id}`,
      ]),
    ] as unknown as ContactDTO["evidenceIds"],
    createdAt: input.now,
    updatedAt: input.now,
  };
  const saved = await input.network.contactProvider.saveContact(
    contact,
    input.network.actorId,
  );

  return { contactId: saved.id, contactWriteExecuted: true };
}

async function confirmDraft(input: {
  actorLabel?: string | null;
  draftId: string;
  network: ActorNetwork | null;
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

  const [graph, contacts] = await Promise.all([
    input.provider.readDraftGraph(),
    readNetwork(input.network),
  ]);
  const draft = draftsFor({ contacts, graph, provider: input.provider }).find(
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
  const attendee =
    graph.attendees.find((candidate) => derivedDraftIdFor(candidate) === draft.id) ??
    null;
  let contactOutcome: { contactId: string; contactWriteExecuted: boolean } | null =
    null;

  if (input.network && contacts && draft.source.type === "event_import") {
    try {
      contactOutcome = await contactForConfirmedDraft({
        actorLabel,
        attendee,
        contacts,
        draft,
        event: attendee
          ? graph.events.find((event) => event.id === attendee.eventId) ?? null
          : null,
        network: input.network,
        now: input.now,
      });
    } catch {
      return failure(
        "CONTACT_DRAFT_PIPELINE_FAILED",
        provenanceFor({
          evidenceIds: draft.provenance.evidenceIds,
          generatedAt: input.now,
          generationMethod: "live-store-confirmation",
          provider: input.provider,
        }),
      );
    }
  }

  const confirmedProvenance = provenanceFor({
    evidenceIds,
    generatedAt: input.now,
    generationMethod: "live-store-confirmation",
    provider: input.provider,
    writeExecuted: true,
  });
  const confirmedDraft: StoredContactDraft = {
    ...draft,
    status: "confirmed",
    confirmation: {
      ...draft.confirmation,
      state: "confirmed",
      actorLabel,
      confirmedAt: input.now,
      ...(contactOutcome ? { writeTargets: ["contact"] as const } : {}),
    },
    evidence: [...draft.evidence, createdEvidence],
    provenance: contactOutcome
      ? { ...confirmedProvenance, contactWriteExecuted: contactOutcome.contactWriteExecuted }
      : confirmedProvenance,
    ...(contactOutcome ? { contactId: contactOutcome.contactId } : {}),
  };

  // QA-C2: a derived (never stored) draft is stored first so the atomic
  // confirmer, which only updates a stored row, has one to update.
  if (!graph.contactDrafts.some((stored) => stored.id === draft.id)) {
    await input.provider.materializeContactDraft?.(draft, input.now);
  }

  const confirmationWrite = await input.provider.confirmContactDraft(
    confirmedDraft,
    input.now,
  );
  const savedDraft = confirmationWrite.draft;
  const savedEvidence =
    savedDraft.evidence.find(
      (evidence) => evidence.evidenceId === createdEvidence.evidenceId,
    ) ?? createdEvidence;
  const confirmedAt =
    savedDraft.confirmation.state === "confirmed"
      ? savedDraft.confirmation.confirmedAt
      : input.now;

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
      ...((savedDraft as StoredContactDraft).contactId
        ? { contactId: (savedDraft as StoredContactDraft).contactId }
        : {}),
      contactWriteExecuted: contactOutcome?.contactWriteExecuted ?? false,
    },
    createdEvidence: savedEvidence,
    confirmedAt,
    provenance: savedDraft.provenance,
    nextAction:
      "Send this candidate to the contact record service only after preserving the source and evidence ids.",
  });
}

/**
 * QA-C2: 破棄 sets a pending draft aside on the server (stored with
 * `discardedAt`), so the queue count drops and other devices stop listing it.
 * A derived draft is stored first; the write reuses the confirmer's
 * pending-only update, so a draft confirmed meanwhile is never set aside.
 */
async function discardDraft(input: {
  draftId: string;
  now: string;
  provider: LiveContactAcquisitionDraftProvider | null;
}): Promise<ContactDraftDiscardResult> {
  if (!input.provider) {
    return failure(
      "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(input.now),
    );
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

  if (!graph.contactDrafts.some((stored) => stored.id === draft.id)) {
    await input.provider.materializeContactDraft?.(draft, input.now);
  }

  const discarded: StoredContactDraft = { ...draft, discardedAt: input.now };
  const write = await input.provider.confirmContactDraft(discarded, input.now);

  if (!isDiscarded(write.draft)) {
    return failure(
      "CONTACT_DRAFT_ALREADY_CONFIRMED",
      provenanceFor({
        evidenceIds: draft.provenance.evidenceIds,
        generatedAt: input.now,
        generationMethod: "live-store-query",
        provider: input.provider,
      }),
    );
  }

  return {
    success: true,
    data: {
      state: "discarded",
      draftId: draft.id,
      discardedAt: (write.draft as StoredContactDraft).discardedAt ?? input.now,
    },
  };
}

export function createLiveContactAcquisitionDraftService({
  actorId,
  contactProvider = null,
  now = () => new Date().toISOString(),
  provider = null,
}: LiveContactAcquisitionDraftServiceOptions = {}): ContactAcquisitionDraftService {
  const normalizedActorId = actorId?.trim() ?? "";
  const network: ActorNetwork | null =
    normalizedActorId && contactProvider
      ? { actorId: normalizedActorId, contactProvider }
      : null;

  return {
    listContactDrafts(input = {}) {
      return readDrafts({
        network,
        now: now(),
        provider,
        scenario: input.scenario,
      });
    },

    confirmContactDraft(input) {
      return confirmDraft({
        actorLabel: input.actorLabel,
        draftId: input.draftId,
        network,
        now: now(),
        provider,
        scenario: input.scenario,
      });
    },

    discardContactDraft(input: ContactDraftDiscardInput) {
      return discardDraft({
        draftId: input.draftId,
        now: now(),
        provider,
      });
    },
  };
}
