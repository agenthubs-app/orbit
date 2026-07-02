import type { ConnectionDTO, ContactDTO } from "../../shared/domain/contracts";
import {
  isRelationshipStage,
  isRelationshipValueType,
  type RelationshipStage,
  type RelationshipValueType,
} from "../../shared/domain/source-types";
import type { LiveConnectionEvidenceProvider } from "./live-service";
import {
  RELATIONSHIP_PROFILE_ERROR_DEFINITIONS,
  RELATIONSHIP_PROFILE_TYPES,
  type RelationshipMutualValue,
  type RelationshipNextAction,
  type RelationshipProfileErrorCode,
  type RelationshipProfileFailureForCode,
  type RelationshipProfileInvalidBodyFailure,
  type RelationshipProfilePayload,
  type RelationshipProfileRecord,
  type RelationshipProfileResult,
  type RelationshipProfileServiceResult,
  type RelationshipProfileType,
  type RelationshipProfileUpdateInput,
  type RelationshipStageAndProfileService,
  type RelationshipStageUpdateInput,
} from "./profile-contract";

export interface LiveRelationshipStageAndProfileServiceOptions {
  now?: () => string;
  provider?: LiveConnectionEvidenceProvider | null;
}

const supportedProfileTypes = new Set<RelationshipProfileType>(
  RELATIONSHIP_PROFILE_TYPES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

function failure<TCode extends RelationshipProfileErrorCode>(
  code: TCode,
  input: {
    collectedAt: string;
    databaseReadExecuted?: boolean;
    provider?: LiveConnectionEvidenceProvider | null;
  },
): RelationshipProfileFailureForCode<TCode> {
  const definition = RELATIONSHIP_PROFILE_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-record-store:connections:unconfigured",
        sourceLabel:
          input.provider?.sourceLabel ?? "Unconfigured relationship profile store",
        evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "demo-relationship-profile-only",
        generationMethod: "live-store-profile-preview",
        databaseReadExecuted: input.databaseReadExecuted ?? false,
        databaseWriteExecuted: false,
        productionAuditLogWriteExecuted: false,
        externalNetworkRequested: false,
        deviceRequested: false,
        aiProviderRequested: false,
        calendarProviderRequested: false,
        emailProviderRequested: false,
        notificationDelivered: false,
      },
      evidenceIds,
    },
  } as unknown as RelationshipProfileFailureForCode<TCode>;
}

function successPayload(
  payload: RelationshipProfilePayload,
): RelationshipProfileResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function contactFor(
  connection: ConnectionDTO,
  contacts: readonly ContactDTO[],
): ContactDTO | null {
  return contacts.find((contact) => contact.id === connection.contactId) ?? null;
}

function relationshipTypeFor(
  connection: ConnectionDTO,
): RelationshipProfileType {
  const valueTypes = new Set(connection.valueTypes);

  if (valueTypes.has("commercial_opportunity")) {
    return "customer_candidate";
  }

  if (valueTypes.has("strategic_fit")) {
    return "partner_candidate";
  }

  if (valueTypes.has("knowledge_exchange")) {
    return "mentor_or_advisor";
  }

  if (valueTypes.has("referral_path") || valueTypes.has("community_context")) {
    return "community_bridge";
  }

  return "partner_candidate";
}

function normalizeProfileType(
  relationshipType: RelationshipProfileUpdateInput["relationshipType"],
  fallback: RelationshipProfileType,
): RelationshipProfileType {
  const normalized = relationshipType?.trim();

  return normalized && supportedProfileTypes.has(normalized as RelationshipProfileType)
    ? (normalized as RelationshipProfileType)
    : fallback;
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeValueTypes(
  valueTypes: RelationshipProfileUpdateInput["mutualValue"] extends infer TInput
    ? TInput extends { valueTypes?: infer TValueTypes }
      ? TValueTypes
      : never
    : never,
  fallback: readonly RelationshipValueType[],
): readonly RelationshipValueType[] {
  if (!valueTypes || !Array.isArray(valueTypes) || valueTypes.length === 0) {
    return fallback;
  }

  const filtered = valueTypes.filter(isRelationshipValueType);

  return filtered.length > 0 ? filtered : fallback;
}

function mutualValueFor(input: {
  connection: ConnectionDTO;
  update?: RelationshipProfileUpdateInput;
}): RelationshipMutualValue {
  const fallback: RelationshipMutualValue = {
    contactReceives:
      input.connection.suggestedActions[0] ??
      "A concrete follow-up path from live relationship context.",
    orbitUserReceives: input.connection.summary,
    valueTypes: input.connection.valueTypes,
  };

  return {
    contactReceives: normalizeText(
      input.update?.mutualValue?.contactReceives,
      fallback.contactReceives,
    ),
    orbitUserReceives: normalizeText(
      input.update?.mutualValue?.orbitUserReceives,
      fallback.orbitUserReceives,
    ),
    valueTypes: normalizeValueTypes(
      input.update?.mutualValue?.valueTypes,
      fallback.valueTypes,
    ),
  };
}

function nextActionFor(input: {
  connection: ConnectionDTO;
  update?: RelationshipProfileUpdateInput;
}): RelationshipNextAction {
  const label =
    input.connection.suggestedActions[0] ??
    "Review live relationship profile evidence";

  return {
    label: normalizeText(input.update?.nextAction?.label, label),
    rationale: normalizeText(
      input.update?.nextAction?.rationale,
      `Recommended from live connection evidence for ${input.connection.id}.`,
    ),
    dueAt: normalizeText(input.update?.nextAction?.dueAt, ""),
  };
}

function evidenceIdsFor(input: {
  contact: ContactDTO | null;
  connection: ConnectionDTO;
}): string[] {
  return uniqueStrings([
    ...input.connection.evidenceIds,
    ...(input.contact?.evidenceIds ?? []),
  ]);
}

function profileRecordFor(input: {
  collectedAt: string;
  connection: ConnectionDTO;
  contact: ContactDTO | null;
  generationMethod: "live-store-stage-preview" | "live-store-profile-preview";
  relationshipStage: RelationshipStage;
  update?: RelationshipProfileUpdateInput;
}): RelationshipProfileRecord {
  const fallbackType = relationshipTypeFor(input.connection);
  const relationshipType = normalizeProfileType(
    input.update?.relationshipType,
    fallbackType,
  );
  const evidenceIds = evidenceIdsFor({
    contact: input.contact,
    connection: input.connection,
  });
  const context = normalizeText(input.update?.context, input.connection.summary);

  return {
    connectionId: input.connection.id,
    contactId: input.connection.contactId,
    displayName: input.contact?.displayName ?? input.connection.contactId,
    relationshipType,
    relationshipStage: input.relationshipStage,
    context,
    mutualValue: mutualValueFor({
      connection: input.connection,
      update: input.update,
    }),
    latestSummary: {
      text: `${input.contact?.displayName ?? input.connection.contactId} is profiled as ${relationshipType} from live connection evidence.`,
      generatedAt: input.collectedAt,
      evidenceIds,
      generationMethod: input.generationMethod,
      createdBy: "relationship-stage-profile-live-service",
    },
    nextAction: nextActionFor({
      connection: input.connection,
      update: input.update,
    }),
    databaseReadExecuted: true,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  connection: ConnectionDTO;
  contact: ContactDTO | null;
  generationMethod: "live-store-stage-preview" | "live-store-profile-preview";
  provider: LiveConnectionEvidenceProvider;
  relationshipStage: RelationshipStage;
  update?: RelationshipProfileUpdateInput;
}): RelationshipProfilePayload {
  const profile = profileRecordFor({
    collectedAt: input.collectedAt,
    connection: input.connection,
    contact: input.contact,
    generationMethod: input.generationMethod,
    relationshipStage: input.relationshipStage,
    update: input.update,
  });

  return {
    state: "success",
    profile,
    summary: "Live relationship profile preview was loaded from shared relationship storage.",
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds: profile.latestSummary.evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "demo-relationship-profile-only",
      generationMethod: input.generationMethod,
      databaseReadExecuted: true,
      databaseWriteExecuted: false,
      productionAuditLogWriteExecuted: false,
      externalNetworkRequested: false,
      deviceRequested: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    nextAction:
      "Review this live relationship profile preview before enabling persistence or automation.",
    updateSummary:
      input.generationMethod === "live-store-stage-preview"
        ? `Live preview changed relationship stage for ${profile.displayName} to ${profile.relationshipStage}.`
        : `Live preview changed relationship profile for ${profile.displayName} to ${profile.relationshipType}.`,
  };
}

export function createLiveRelationshipStageAndProfileService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveRelationshipStageAndProfileServiceOptions = {}): RelationshipStageAndProfileService {
  async function loadConnection(input: {
    collectedAt: string;
    connectionId: string;
  }): Promise<
    | {
        success: true;
        connection: ConnectionDTO;
        contact: ContactDTO | null;
      }
    | RelationshipProfileFailureForCode<
        "RELATIONSHIP_PROFILE_LIVE_STORE_UNCONFIGURED" | "RELATIONSHIP_PROFILE_NOT_FOUND"
      >
  > {
    if (!provider) {
      return failure("RELATIONSHIP_PROFILE_LIVE_STORE_UNCONFIGURED", {
        collectedAt: input.collectedAt,
        provider,
      });
    }

    const graph = await provider.readConnectionEvidenceGraph();
    const connection =
      graph.connections.find(
        (item) => item.id === input.connectionId.trim(),
      ) ?? null;

    if (!connection) {
      return failure("RELATIONSHIP_PROFILE_NOT_FOUND", {
        collectedAt: input.collectedAt,
        databaseReadExecuted: true,
        provider,
      });
    }

    return {
      success: true,
      connection,
      contact: contactFor(connection, graph.contacts),
    };
  }

  return {
    async updateStage(input): Promise<RelationshipProfileResult> {
      const collectedAt = now();
      const requestedStage = input.relationshipStage ?? "active";

      if (!isRelationshipStage(requestedStage)) {
        return failure("RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED", {
          collectedAt,
          provider,
        });
      }

      const loaded = await loadConnection({
        collectedAt,
        connectionId: input.connectionId,
      });

      if (loaded.success === false) {
        return loaded;
      }

      return successPayload(
        payloadFor({
          collectedAt,
          connection: loaded.connection,
          contact: loaded.contact,
          generationMethod: "live-store-stage-preview",
          provider,
          relationshipStage: requestedStage,
        }),
      );
    },

    async updateProfile(input): Promise<RelationshipProfileResult> {
      const collectedAt = now();
      const loaded = await loadConnection({
        collectedAt,
        connectionId: input.connectionId,
      });

      if (loaded.success === false) {
        return loaded;
      }

      return successPayload(
        payloadFor({
          collectedAt,
          connection: loaded.connection,
          contact: loaded.contact,
          generationMethod: "live-store-profile-preview",
          provider,
          relationshipStage: loaded.connection.stage,
          update: input,
        }),
      );
    },

    invalidRelationshipProfileBody(): RelationshipProfileServiceResult<RelationshipProfileInvalidBodyFailure> {
      return failure("RELATIONSHIP_PROFILE_INVALID_BODY", {
        collectedAt: now(),
        provider,
      });
    },
  };
}
