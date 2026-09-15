import {
  PROFILE_ERROR_DEFINITIONS,
  type ManualProfile,
  type ManualProfileUpdateInput,
  type ProfileCompleteness,
  type ProfileCompletenessField,
  type ProfileFailure,
  type ProfilePayload,
  type ProfileResult,
  type ProfileScenario,
  type ProfileSuccess,
} from "./contract";
import type { ProfileService } from "./service";
import type {
  LiveProfileGraph,
  LiveProfileProvider,
  LiveProfileRecord,
} from "./storage/profile-live-record-provider";
import { parseOrbitLanguage } from "../../shared/i18n/orbit-language";
import { mergeIndustrySelection, validateIndustrySelection } from "../../shared/domain/industries";
import { calculateProfileOnboarding, isValidProfileBirthDate } from "./onboarding";
import { ProfileMutationError, validateProfileMutation } from "./storage/profile-mutations";

export interface LiveProfileServiceOptions {
  now?: () => string;
  provider?: LiveProfileProvider | null;
}

const supportedScenarios = new Set<ProfileScenario>([
  "complete",
  "empty",
  "pending",
]);

const completenessFields: readonly ProfileCompletenessField[] = [
  "displayName",
  "headline",
  "relationshipGoal",
  "homeMarket",
  "targetRelationshipTypes",
  "preferredIntroChannels",
];

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: ProfilePayload): ProfileSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ProfileFailure["error"]["code"],
  input: {
    collectedAt: string;
    evidenceIds?: readonly string[];
    provider?: LiveProfileProvider | null;
  },
): ProfileFailure {
  const definition = PROFILE_ERROR_DEFINITIONS[code];
  const evidenceIds = input.evidenceIds ?? [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-record-store:profiles:unconfigured",
        sourceLabel: input.provider?.sourceLabel ?? "Unconfigured live profile store",
        evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "actor-scoped-profile",
      },
      evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ProfileScenario | string | null,
): ProfileScenario {
  return scenario && supportedScenarios.has(scenario as ProfileScenario)
    ? (scenario as ProfileScenario)
    : "complete";
}

function hasValue(
  profile: ManualProfile,
  field: ProfileCompletenessField,
): boolean {
  const value = profile[field];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "string") {
    return Boolean(value.trim());
  }

  return false;
}

function scoreCompleteness(profile: ManualProfile | null): ProfileCompleteness {
  if (!profile) {
    return {
      score: 0,
      status: "not-started",
      completedFields: [],
      missingFields: completenessFields,
      nextBestField: "displayName",
    };
  }

  const completedFields = completenessFields.filter((field) =>
    hasValue(profile, field),
  );
  const missingFields = completenessFields.filter(
    (field) => !completedFields.includes(field),
  );
  const score = Math.round(
    (completedFields.length / completenessFields.length) * 100,
  );

  return {
    score,
    status:
      score === 0 ? "not-started" : missingFields.length === 0 ? "ready" : "action-needed",
    completedFields,
    missingFields,
    nextBestField: missingFields[0] ?? null,
  };
}

function accountNameFor(
  graph: LiveProfileGraph,
  accountId: string,
): string | undefined {
  return graph.accounts.find((account) => account.id === accountId)?.name;
}

function marketFromTimezone(timezone?: string): string {
  if (timezone === "Asia/Tokyo") {
    return "Tokyo";
  }

  return timezone?.split("/").at(-1)?.replace(/_/g, " ") ?? "Local market";
}

function currentProfile(
  graph: LiveProfileGraph,
  actorId: string,
): LiveProfileRecord | null {
  return (
    graph.profiles.find((profile) => profile.accountId === actorId) ??
    null
  );
}

function manualProfileFor(input: {
  accountName?: string;
  profile: LiveProfileRecord;
}): ManualProfile {
  const organization = input.profile.organization ?? input.accountName ?? "";
  const role = input.profile.role ?? "";
  const publicProfile = input.profile.publicProfile;

  return {
    id: input.profile.id,
    displayName: input.profile.displayName,
    ...(input.profile.birthDate !== undefined ? { birthDate: input.profile.birthDate } : {}),
    headline: input.profile.headline ?? "",
    organization,
    role,
    handles: input.profile.handles,
    industry: publicProfile?.industry,
    primaryIndustryId: publicProfile?.primaryIndustryId,
    secondaryIndustryId: publicProfile?.secondaryIndustryId,
    seniorityLevel: publicProfile?.seniorityLevel,
    bio: publicProfile?.bio,
    offering: publicProfile?.offering,
    seeking: publicProfile?.seeking,
    topics: publicProfile?.topics,
    spokenLanguages: input.profile.spokenLanguages,
    homeMarket: input.profile.homeMarket ?? "",
    relationshipGoal: input.profile.relationshipGoal ?? "",
    targetRelationshipTypes: input.profile.targetRelationshipTypes,
    preferredFollowUpWindow: input.profile.preferredFollowUpWindow ?? "",
    preferredLanguage: input.profile.preferredLanguage ?? "zh",
    preferredIntroChannels: input.profile.preferredIntroChannels,
    updatedAt: input.profile.updatedAt,
  };
}

function emptyPayload(input: {
  collectedAt: string;
  provider?: LiveProfileProvider | null;
}): ProfilePayload {
  return {
    state: "empty",
    profile: null,
    onboarding: calculateProfileOnboarding(null, input.collectedAt.slice(0, 10)),
    completeness: scoreCompleteness(null),
    editor: {
      canSave: false,
      lastSavedAt: null,
      dirtyFields: [],
      validationMessages: ["Add a display name to start profile onboarding."],
    },
    provenance: {
      source: input.provider?.source ?? "live-record-store:profiles:empty",
      sourceLabel: input.provider?.sourceLabel ?? "Empty live profile store",
      evidenceIds: ["evidence:profile-live-empty"],
      collectedAt: input.collectedAt,
      privacy: "actor-scoped-profile",
    },
    nextAction:
      "Start with a name, market, and relationship goal before creating relationship actions.",
  };
}

function payloadFor(input: {
  collectedAt: string;
  graph: LiveProfileGraph;
  profile: LiveProfileRecord;
  provider: LiveProfileProvider;
  state?: "success" | "pending";
}): ProfilePayload {
  const profile = manualProfileFor({
    accountName: accountNameFor(input.graph, input.profile.accountId),
    profile: input.profile,
  });
  const completeness = scoreCompleteness(profile);

  return {
    state: input.state ?? "success",
    profile,
    completeness,
    onboarding: calculateProfileOnboarding(profile, input.collectedAt.slice(0, 10)),
    editor: {
      canSave: input.state !== "pending",
      lastSavedAt: profile.updatedAt,
      dirtyFields: [],
      validationMessages:
        input.state === "pending"
          ? ["Manual review is pending for this live profile."]
          : [],
    },
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds: input.profile.evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "actor-scoped-profile",
    },
    nextAction:
      completeness.status === "ready"
        ? "Use the completed live profile to personalize relationship follow-up."
        : "Complete the next live profile field before scoring relationship actions.",
  };
}

function normalizeText(value: string | undefined, fallback: string): string {
  return value === undefined ? fallback : value.trim();
}

function normalizeStringList(
  value: readonly string[] | undefined,
  fallback: readonly string[],
): readonly string[] {
  const filtered = value
    ?.map((item) => item.trim())
    .filter((item) => item.length > 0);

  return filtered ?? fallback;
}

function normalizeProfileTags(
  value: readonly string[] | undefined,
  fallback: readonly string[],
): readonly string[] {
  if (value === undefined) return fallback;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const display = item.normalize("NFKC").replace(/\s+/gu, " ").trim();
    const key = display.toLowerCase();
    if (!display || seen.has(key)) continue;
    seen.add(key);
    normalized.push(display);
  }
  return normalized;
}

function normalizeProfileHandles(
  value: ManualProfileUpdateInput["handles"],
  fallback: ManualProfileUpdateInput["handles"],
): ManualProfileUpdateInput["handles"] {
  if (value === undefined) return fallback;
  const normalized = Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, item?.trim()] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
  return normalized;
}

function profileInkSignalFieldsAreValid(update: ManualProfileUpdateInput): boolean {
  const bio = update.bio?.trim() ?? "";
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<unknown> };
  }).Segmenter;
  const visibleCharacters = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(bio)).length
    : Array.from(bio).length;
  return visibleCharacters <= 80
    && normalizeProfileTags(update.offering, []).length <= 5
    && normalizeProfileTags(update.seeking, []).length <= 5;
}

function mergeProfile(input: {
  actorId: string;
  base: LiveProfileRecord | null;
  graph: LiveProfileGraph;
  update: ManualProfileUpdateInput;
  updatedAt: string;
}): LiveProfileRecord {
  const baseManual = input.base
    ? manualProfileFor({
        accountName: accountNameFor(input.graph, input.base.accountId),
        profile: input.base,
      })
    : null;
  const profileId = input.base?.id ?? `profile:${input.actorId}`;
  const accountId = input.actorId;
  const displayName = normalizeText(
    input.update.displayName,
    baseManual?.displayName ?? "",
  );
  const role = normalizeText(input.update.role, baseManual?.role ?? "");
  const organization = normalizeText(
    input.update.organization,
    baseManual?.organization ?? accountNameFor(input.graph, accountId) ?? "",
  );

  return {
    id: profileId,
    accountId,
    displayName,
    ...(input.update.birthDate !== undefined
      ? { birthDate: input.update.birthDate }
      : input.base?.birthDate !== undefined ? { birthDate: input.base.birthDate } : {}),
    role,
    timezone: input.base?.timezone ?? "Asia/Tokyo",
    headline: normalizeText(
      input.update.headline,
      baseManual?.headline ?? "",
    ),
    handles: normalizeProfileHandles(input.update.handles, input.base?.handles),
    organization,
    homeMarket: normalizeText(
      input.update.homeMarket,
      baseManual?.homeMarket ?? "",
    ),
    relationshipGoal: normalizeText(
      input.update.relationshipGoal,
      baseManual?.relationshipGoal ?? "",
    ),
    targetRelationshipTypes: normalizeStringList(
      input.update.targetRelationshipTypes,
      baseManual?.targetRelationshipTypes ?? [],
    ),
    preferredFollowUpWindow: normalizeText(
      input.update.preferredFollowUpWindow,
      baseManual?.preferredFollowUpWindow ?? "",
    ),
    preferredIntroChannels: normalizeStringList(
      input.update.preferredIntroChannels,
      baseManual?.preferredIntroChannels ?? [],
    ),
    preferredLanguage:
      input.update.preferredLanguage ?? baseManual?.preferredLanguage ?? "zh",
    spokenLanguages: normalizeProfileTags(
      input.update.spokenLanguages,
      baseManual?.spokenLanguages ?? [],
    ),
    publicProfile: {
      ...mergeIndustrySelection(baseManual ?? {}, input.update),
      bio: normalizeText(input.update.bio, baseManual?.bio ?? ""),
      industry: normalizeText(input.update.industry, baseManual?.industry ?? ""),
      offering: normalizeProfileTags(
        input.update.offering,
        baseManual?.offering ?? [],
      ),
      seeking: normalizeProfileTags(
        input.update.seeking,
        baseManual?.seeking ?? [],
      ),
      seniorityLevel:
        input.update.seniorityLevel ?? baseManual?.seniorityLevel,
      topics: normalizeStringList(
        input.update.topics,
        baseManual?.topics ?? [],
      ),
    },
    evidenceIds: input.base?.evidenceIds ?? [`evidence:profile:${profileId}`],
    createdAt: input.base?.createdAt ?? input.updatedAt,
    updatedAt: input.updatedAt,
  };
}

export function createLiveProfileService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveProfileServiceOptions = {}): ProfileService {
  async function loadProfile(input: {
    actorId: string;
    collectedAt: string;
  }): Promise<
    | {
        success: true;
        graph: LiveProfileGraph;
        profile: LiveProfileRecord | null;
      }
    | ProfileFailure
  > {
    if (!provider) {
      return failure("PROFILE_LIVE_STORE_UNCONFIGURED", {
        collectedAt: input.collectedAt,
        provider,
      });
    }

    const graph = await provider.readProfileGraph(input.actorId);

    return {
      success: true,
      graph,
      profile: currentProfile(graph, input.actorId),
    };
  }

  return {
    async getProfile(options = {}): Promise<ProfileResult> {
      const collectedAt = now();
      const scenario = normalizeScenario(options.scenario);
      const actorId = options.actorId?.trim();

      if (!actorId) {
        return failure("PROFILE_ACTOR_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (scenario === "empty") {
        return success(emptyPayload({ collectedAt, provider }));
      }

      const loaded = await loadProfile({ actorId, collectedAt });

      if (loaded.success === false) {
        return loaded;
      }

      if (!loaded.profile) {
        return success(emptyPayload({ collectedAt, provider }));
      }

      return success(
        payloadFor({
          collectedAt,
          graph: loaded.graph,
          profile: loaded.profile,
          provider,
          state: scenario === "pending" ? "pending" : "success",
        }),
      );
    },

    async getPendingManualReview(options = {}): Promise<ProfileSuccess> {
      const result = await this.getProfile({
        actorId: options.actorId,
        scenario: "pending",
      });

      if (result.success) {
        return result;
      }

      return success(emptyPayload({ collectedAt: now(), provider }));
    },

    scoreCompleteness,

    async updateProfile(input, options = {}): Promise<ProfileResult> {
      const collectedAt = now();
      const actorId = options.actorId?.trim();

      if (!actorId) {
        return failure("PROFILE_ACTOR_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!validateProfileMutation(input)) {
        return failure("PROFILE_MUTATION_INVALID", { collectedAt, provider });
      }

      if (input.birthDate !== undefined && input.birthDate !== null && !isValidProfileBirthDate(input.birthDate, collectedAt.slice(0, 10))) {
        return failure("PROFILE_BIRTH_DATE_INVALID", { collectedAt, provider });
      }

      if (!profileInkSignalFieldsAreValid(input)) {
        return failure("PROFILE_VALIDATION_FAILED", {
          collectedAt,
          evidenceIds: ["evidence:profile-ink-signal-validation-failure"],
          provider,
        });
      }

      if (!provider) {
        return failure("PROFILE_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      // A generic async get/upsert adapter cannot promise a conditional write.
      if (input.expectedUpdatedAt !== undefined && !provider.withProfileMutation) {
        return failure("PROFILE_SAVE_UNAVAILABLE", { collectedAt, provider });
      }

      const save = async (writeProvider: LiveProfileProvider): Promise<ProfileResult> => {
        const graph = await writeProvider.readProfileGraph(actorId);
        const profile = currentProfile(graph, actorId);
        if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== (profile?.updatedAt ?? null)) {
          return failure("PROFILE_VERSION_CONFLICT", { collectedAt, provider });
        }
        const displayName = input.displayName?.trim() ?? profile?.displayName.trim() ?? "";
        const languageIsValid = input.preferredLanguage === undefined || parseOrbitLanguage(input.preferredLanguage) !== null;
        if (!displayName || !languageIsValid) {
          return failure("PROFILE_VALIDATION_FAILED", {
            collectedAt, evidenceIds: ["evidence:profile-live-validation-failure"], provider,
          });
        }
        const updatedAt = profile && Date.parse(collectedAt) <= Date.parse(profile.updatedAt)
          ? new Date(Date.parse(profile.updatedAt) + 1).toISOString() : collectedAt;
        const mergedProfile = mergeProfile({ actorId, base: profile, graph, update: input, updatedAt });
        if (!validateIndustrySelection(mergedProfile.publicProfile ?? {}).valid) {
          return failure("PROFILE_VALIDATION_FAILED", {
            collectedAt, evidenceIds: ["evidence:profile-industry-validation-failure"], provider,
          });
        }
        const savedProfile = await writeProvider.upsertProfile(mergedProfile, actorId);
        return success(payloadFor({ collectedAt, graph, profile: savedProfile, provider }));
      };

      try {
        return provider.withProfileMutation
          ? await provider.withProfileMutation(input, actorId, save)
          : await save(provider);
      } catch (error) {
        if (error instanceof ProfileMutationError) {
          return failure(error.code, { collectedAt, provider });
        }
        throw error;
      }
    },
  };
}
