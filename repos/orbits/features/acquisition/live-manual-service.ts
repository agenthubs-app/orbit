import { createHash } from "node:crypto";

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
import type { ContactDTO } from "../../shared/domain/contracts";
import type { ContactRecordWriteProvider } from "../contacts/contact-write-contract";
import {
  composeBilingualSearchText,
  type EnglishTranslationResult,
} from "../orbit-ai/language-normalization-service";

// translate-on-ingest 依赖：只需要把一段文本翻成英文。用结构化接口而不是直接依赖
// orbit-ai 服务实例，保持 acquisition 与 orbit-ai 解耦（真正的实现由工厂注入）。
export interface ManualContactNoteTranslator {
  translateToEnglish: (text: string) => Promise<EnglishTranslationResult>;
}

export interface LiveManualContactCreationServiceOptions {
  actorId?: string;
  contactProvider?: ContactRecordWriteProvider | null;
  now?: () => string;
  provider?: LiveContactAcquisitionDraftProvider | null;
  // 录入时把中文/日文 note 翻成英文，合成 "原文 / English" 可搜索文本，供关系检索的
  // 英文子串匹配命中。缺 provider key（或已是英文）时不翻译，只存原文，绝不阻塞写入。
  normalizationService?: ManualContactNoteTranslator | null;
}

// 录入侧翻译：把原文 note 合成 "原文 / English"。fail-closed —— 无 translator 或
// 未翻译时原样返回，写入永远不会因为翻译失败而中断。
async function searchableNoteFor(
  note: string,
  normalizationService?: ManualContactNoteTranslator | null,
): Promise<string> {
  if (!normalizationService) {
    return note;
  }

  const { englishText } = await normalizationService.translateToEnglish(note);

  return composeBilingualSearchText(note, englishText);
}

type StoredManualContactDraft = ContactAcquisitionDraft & {
  contactId?: string;
  contactWriteExecuted?: boolean;
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
  contactWriteExecuted?: boolean;
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
    contactWriteExecuted: input.contactWriteExecuted ?? false,
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
    ...(nonEmpty(stored.contactId) ? { contactId: stored.contactId } : {}),
    contactWriteExecuted: stored.contactWriteExecuted === true,
  };
}

function provenanceFromContactDraft(
  draft: ContactAcquisitionDraft,
): ManualContactCreationProvenance {
  const stored = draft as StoredManualContactDraft;

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
    contactWriteExecuted: stored.contactWriteExecuted === true,
    externalNetworkRequested: false,
  };
}

function contactDraftFromManualInput(input: {
  actorId: string;
  generatedAt: string;
  provider: LiveContactAcquisitionDraftProvider;
  source: ManualContactSourceReference;
  displayName: string;
  role: string;
  organization: string;
  idempotencyNote: string;
  note: string;
  tags: readonly string[];
  followUpHint: string;
}): StoredManualContactDraft {
  const seed = [
    input.actorId,
    input.displayName,
    input.organization,
    input.role,
    input.idempotencyNote,
    input.followUpHint,
    ...[...input.tags].sort(),
  ]
    .map((value) => value.normalize("NFKC").trim().toLocaleLowerCase())
    .join("\u0000");
  const draftId = `manual-draft:live:${createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 24)}`;
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
      writeTargets: ["contact"],
    },
    evidence: [evidence],
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds: [evidenceId],
      collectedAt: input.generatedAt,
      privacy: "live-contact-acquisition-drafts",
      generationMethod: "live-store-query",
      liveDatabaseReadExecuted: true,
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
  const contactWritten = draft.contactWriteExecuted === true && draft.contactId;

  return {
    state: "success",
    draft,
    summary: contactWritten
      ? "This manual source was already confirmed into an actor-owned contact."
      : "One live manual contact draft was staged in the shared contact draft queue without creating a contact.",
    provenance: draft.provenance,
    nextAction: contactWritten
      ? "Open the saved contact to continue the relationship workflow."
      : "Review the manual note evidence before confirming this contact candidate.",
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

interface ManualContactWriteOutcome {
  contactId: string;
  contactWriteExecuted: boolean;
  duplicateLookupExecuted: boolean;
}

function normalizedComparisonValue(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function contactIdFor(actorId: string, draftId: string): string {
  const digest = createHash("sha256")
    .update(actorId)
    .update("\u0000")
    .update(draftId)
    .digest("hex")
    .slice(0, 24);

  return `contact:manual:${digest}`;
}

function contactForManualDraft(input: {
  actorLabel: string;
  confirmedAt: string;
  contactId: string;
  draft: ManualContactDraft;
}): ContactDTO {
  const profileSnippet = [
    input.draft.relationshipContext,
    input.draft.followUpHint,
    input.draft.tags.length > 0 ? `Tags: ${input.draft.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: input.contactId,
    displayName: input.draft.displayName.trim(),
    ...(nonEmpty(input.draft.organization)
      ? { organization: input.draft.organization.trim() }
      : {}),
    ...(nonEmpty(input.draft.role) ? { role: input.draft.role.trim() } : {}),
    ...(profileSnippet ? { profileSnippet } : {}),
    stage: "captured",
    source: {
      id: input.draft.source.id,
      label: `${input.draft.source.label} · confirmed by ${input.actorLabel}`,
      type: "manual",
    },
    evidenceIds: Array.from(
      new Set([
        ...input.draft.provenance.evidenceIds
          .map((id) => id.trim())
          .filter(Boolean),
        `evidence:manual-contact-confirmed:${input.draft.id}`,
      ]),
    ) as [string, ...string[]],
    createdAt: input.confirmedAt,
    updatedAt: input.confirmedAt,
  };
}

function duplicateManualContact(
  contacts: readonly ContactDTO[],
  draft: ManualContactDraft,
): ContactDTO | null {
  const displayName = normalizedComparisonValue(draft.displayName);
  const organization = normalizedComparisonValue(draft.organization);

  return (
    contacts.find(
      (contact) =>
        normalizedComparisonValue(contact.displayName) === displayName &&
        normalizedComparisonValue(contact.organization) === organization,
    ) ?? null
  );
}

async function writeManualContact(input: {
  actorId: string;
  actorLabel: string;
  confirmedAt: string;
  contactProvider: ContactRecordWriteProvider;
  draft: ManualContactDraft;
}): Promise<
  | { success: true; outcome: ManualContactWriteOutcome }
  | {
      success: false;
      code:
        | "MANUAL_CONTACT_DUPLICATE_REVIEW_REQUIRED"
        | "MANUAL_CONTACT_WRITE_FAILED";
    }
> {
  const contactId = contactIdFor(input.actorId, input.draft.id);

  try {
    const existing = await input.contactProvider.getContact(
      contactId,
      input.actorId,
    );

    if (existing) {
      return {
        success: true,
        outcome: {
          contactId: existing.id,
          contactWriteExecuted: false,
          duplicateLookupExecuted: false,
        },
      };
    }

    const duplicate = duplicateManualContact(
      await input.contactProvider.listContacts(input.actorId),
      input.draft,
    );

    if (duplicate) {
      return {
        success: false,
        code: "MANUAL_CONTACT_DUPLICATE_REVIEW_REQUIRED",
      };
    }

    const saved = await input.contactProvider.saveContact(
      contactForManualDraft({
        actorLabel: input.actorLabel,
        confirmedAt: input.confirmedAt,
        contactId,
        draft: input.draft,
      }),
      input.actorId,
    );

    return {
      success: true,
      outcome: {
        contactId: saved.id,
        contactWriteExecuted: true,
        duplicateLookupExecuted: true,
      },
    };
  } catch {
    return { success: false, code: "MANUAL_CONTACT_WRITE_FAILED" };
  }
}

function candidateFromDraft(
  draft: ManualContactDraft,
  outcome: ManualContactWriteOutcome,
): ManualContactCandidate {
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
    readyForContactWrite: false,
    contactId: outcome.contactId,
    contactWriteExecuted: outcome.contactWriteExecuted,
    duplicateLookupExecuted: outcome.duplicateLookupExecuted,
  };
}

function confirmedContactDraft(input: {
  actorLabel: string;
  confirmedAt: string;
  draft: ContactAcquisitionDraft;
  outcome: ManualContactWriteOutcome;
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
    contactId: input.outcome.contactId,
    contactWriteExecuted:
      input.outcome.contactWriteExecuted || stored.contactWriteExecuted === true,
    status: "confirmed",
    confirmation: {
      ...input.draft.confirmation,
      state: "confirmed",
      actorLabel: input.actorLabel,
      confirmedAt: input.confirmedAt,
      writeTargets: ["contact"],
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
      contactWriteExecuted:
        input.outcome.contactWriteExecuted || stored.contactWriteExecuted === true,
      externalNetworkRequested: false,
    },
  };
}

export function createLiveManualContactCreationService({
  actorId,
  contactProvider,
  now = () => new Date().toISOString(),
  provider,
  normalizationService,
}: LiveManualContactCreationServiceOptions = {}): ManualContactCreationService {
  const normalizedActorId = actorId?.trim() ?? "";

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

      if (!normalizedActorId) {
        return failure(
          "MANUAL_CONTACT_ACTOR_REQUIRED",
          provenanceFor({
            evidenceIds: ["evidence:manual-contact-live-actor-required"],
            generatedAt,
            generationMethod: "live-store-manual-contact-draft",
            provider,
          }),
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

      // displayName/organization 仍从原文 note 用正则派生（正则依赖英文 "from" 结构，
      // 不能喂翻译后的文本）；只有落库的 note 换成可搜索的双语文本。
      const displayName = displayNameFrom(input);
      const organization = organizationFrom(input);
      const role = roleFrom(input);
      const source = sourceFor(input.source, displayName);
      const searchableNote = await searchableNoteFor(note, normalizationService);
      const contactDraft = contactDraftFromManualInput({
        actorId: normalizedActorId,
        generatedAt,
        provider,
        source,
        displayName,
        role,
        organization,
        idempotencyNote: note,
        note: searchableNote,
        tags: tagsFor(input.tags),
        followUpHint: nonEmpty(input.followUpHint) ?? "",
      });
      const graph = await provider.readDraftGraph();
      const existingDraft = graph.contactDrafts.find(
        (draft) => draft.id === contactDraft.id && draft.source.type === "manual",
      );

      if (existingDraft) {
        return success(creationPayload(manualDraftFromContactDraft(existingDraft)));
      }

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

      if (!normalizedActorId) {
        return failure(
          "MANUAL_CONTACT_ACTOR_REQUIRED",
          provenanceFor({
            evidenceIds: ["evidence:manual-contact-live-actor-required"],
            generatedAt: confirmedAt,
            generationMethod: "live-store-confirmation",
            provider,
            readExecuted: false,
            writeExecuted: false,
          }),
        );
      }

      if (!contactProvider) {
        return failure(
          "MANUAL_CONTACT_WRITE_UNCONFIGURED",
          provenanceFor({
            evidenceIds: ["evidence:manual-contact-write-unconfigured"],
            generatedAt: confirmedAt,
            generationMethod: "live-store-confirmation",
            provider,
            readExecuted: false,
            writeExecuted: false,
          }),
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

      const manualDraft = manualDraftFromContactDraft(existingDraft);
      const contactWrite = await writeManualContact({
        actorId: normalizedActorId,
        actorLabel: actorLabelFor(input.actorLabel),
        confirmedAt,
        contactProvider,
        draft: manualDraft,
      });

      if (contactWrite.success === false) {
        return failure(
          contactWrite.code,
          provenanceFor({
            evidenceIds: existingDraft.provenance.evidenceIds,
            generatedAt: confirmedAt,
            generationMethod: "live-store-confirmation",
            provider,
            readExecuted: true,
            writeExecuted: false,
          }),
        );
      }

      const storedExisting = existingDraft as StoredManualContactDraft;
      const alreadyFullyConfirmed =
        existingDraft.status === "confirmed" &&
        storedExisting.contactId === contactWrite.outcome.contactId &&
        storedExisting.contactWriteExecuted === true;
      const updated = alreadyFullyConfirmed
        ? storedExisting
        : existingDraft.status === "confirmed"
          ? {
              ...storedExisting,
              contactId: contactWrite.outcome.contactId,
              contactWriteExecuted: true,
              provenance: {
                ...storedExisting.provenance,
                contactWriteExecuted: true,
              },
            }
          : confirmedContactDraft({
              actorLabel: actorLabelFor(input.actorLabel),
              confirmedAt,
              draft: existingDraft,
              outcome: contactWrite.outcome,
              provider,
            });
      const saved = alreadyFullyConfirmed
        ? storedExisting
        : await provider.upsertContactDraft(updated, confirmedAt);
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
        contactCandidate: candidateFromDraft(
          confirmedDraft,
          contactWrite.outcome,
        ),
        createdEvidence,
        confirmedAt,
        provenance: confirmedDraft.provenance,
        nextAction:
          "Open the saved actor-owned contact to continue the relationship workflow.",
      });
    },
  };
}
