// R18a design-only profile state. Loaded by the API handler only outside production.
import { profilePublicFieldsWriteSchema } from "../../../shared/api-schema/profile-account";
import { profileBioWithinLimit } from "../../../shared/api-schema/profile-bio";
import { validateIndustrySelection } from "../../../shared/domain/industries";
import { demoAccountProfiles } from "../../../shared/mock/demo-world/account";
import { PROFILE_ERROR_DEFINITIONS, type ManualProfile, type ManualProfileUpdateInput, type ProfilePayload, type ProfileResult } from "../contract";
import { scoreProfileCompleteness } from "../completeness";
import { calculateProfileOnboarding, isValidProfileBirthDate } from "../onboarding";

export type AccountDesignVariant = "25" | "50" | "100";

const variants = {
  "25": demoAccountProfiles.new,
  "50": demoAccountProfiles.regular,
  "100": demoAccountProfiles.complete,
} as const;

const editableKeys = [
  "displayName", "birthDate", "headline", "organization", "role", "homeMarket",
  "relationshipGoal", "targetRelationshipTypes", "preferredFollowUpWindow",
  "preferredLanguage", "preferredIntroChannels", "handles", "industry", "seniorityLevel",
  "bio", "offering", "seeking", "topics", "spokenLanguages", "primaryIndustryId",
  "secondaryIndustryId", "publicFields",
] as const satisfies readonly (keyof ManualProfileUpdateInput)[];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function failure(code: keyof typeof PROFILE_ERROR_DEFINITIONS): ProfileResult {
  return {
    success: false,
    error: {
      ...PROFILE_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: {
        source: "r18a-design-fixture",
        sourceLabel: "R18a account design fixture",
        evidenceIds: ["evidence:r18a-design-fixture"],
        collectedAt: "2026-10-18T00:00:00.000Z",
        privacy: "demo-profile-only",
      },
      evidenceIds: ["evidence:r18a-design-fixture"],
    },
  };
}

function initial(actorId: string, variant: AccountDesignVariant): ProfilePayload {
  const source = variants[variant];
  const profile = clone(source.profile) as ManualProfile;
  profile.id = actorId;
  return {
    ...clone(source),
    state: source.state ?? "success",
    profile,
    onboarding: calculateProfileOnboarding(profile),
    provenance: {
      source: "r18a-design-fixture",
      sourceLabel: "R18a account design fixture",
      evidenceIds: ["evidence:r18a-design-fixture"],
      collectedAt: profile.updatedAt,
      privacy: "demo-profile-only",
    },
  };
}

function revisionAfter(previous: string, now: string): string {
  const next = Math.max(Date.parse(previous) + 1, Date.parse(now));
  return new Date(next).toISOString();
}

export function createAccountDesignFixtureStore(now: () => string = () => new Date().toISOString()) {
  const profiles = new Map<string, ProfilePayload>();
  const receipts = new Map<string, { fingerprint: string; result: ProfileResult }>();
  const keyFor = (actorId: string, variant: AccountDesignVariant) => `${actorId}\u0000${variant}`;

  function read(actorId: string, variant: AccountDesignVariant): { success: true; data: ProfilePayload } {
    const key = keyFor(actorId, variant);
    let payload = profiles.get(key);
    if (!payload) {
      payload = initial(actorId, variant);
      profiles.set(key, payload);
    }
    return { success: true, data: clone(payload) };
  }

  function update(actorId: string, variant: AccountDesignVariant, input: ManualProfileUpdateInput): ProfileResult {
    const key = keyFor(actorId, variant);
    const current = read(actorId, variant).data;
    const previous = current.profile;
    if (!previous) return failure("PROFILE_REQUIRED");

    if ((input.expectedUpdatedAt === undefined) !== (input.mutationId === undefined) ||
        (input.mutationId !== undefined && !input.mutationId.trim())) {
      return failure("PROFILE_MUTATION_INVALID");
    }
    const receiptKey = input.mutationId ? `${key}\u0000${input.mutationId}` : null;
    const fingerprint = JSON.stringify(input);
    const receipt = receiptKey ? receipts.get(receiptKey) : undefined;
    if (receipt) return receipt.fingerprint === fingerprint ? clone(receipt.result) : failure("PROFILE_MUTATION_ID_REUSED");
    if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== previous.updatedAt) {
      return failure("PROFILE_VERSION_CONFLICT");
    }
    if (input.publicFields !== undefined && !profilePublicFieldsWriteSchema.safeParse(input.publicFields).success) {
      return failure("PROFILE_VALIDATION_FAILED");
    }
    if (input.birthDate !== undefined && input.birthDate !== null && !isValidProfileBirthDate(input.birthDate, now().slice(0, 10))) {
      return failure("PROFILE_BIRTH_DATE_INVALID");
    }
    if (input.bio !== undefined && !profileBioWithinLimit(input.bio)) return failure("PROFILE_VALIDATION_FAILED");

    const nextProfile = clone(previous);
    for (const field of editableKeys) {
      if (input[field] !== undefined) Object.assign(nextProfile, { [field]: clone(input[field]) });
    }
    nextProfile.displayName = nextProfile.displayName.trim();
    if (!nextProfile.displayName || !validateIndustrySelection(nextProfile).valid) {
      return failure("PROFILE_VALIDATION_FAILED");
    }
    nextProfile.updatedAt = revisionAfter(previous.updatedAt, now());
    const completeness = scoreProfileCompleteness(nextProfile);
    const payload: ProfilePayload = {
      ...current,
      profile: nextProfile,
      completeness,
      onboarding: calculateProfileOnboarding(nextProfile),
      editor: { canSave: true, lastSavedAt: nextProfile.updatedAt, dirtyFields: [], validationMessages: [] },
      ...(input.mutationId ? { mutationId: input.mutationId } : {}),
      provenance: { ...current.provenance, collectedAt: nextProfile.updatedAt },
    };
    profiles.set(key, payload);
    const result: ProfileResult = { success: true, data: clone(payload) };
    if (receiptKey) receipts.set(receiptKey, { fingerprint, result: clone(result) });
    return result;
  }

  return { read, update };
}

export const accountDesignFixtureStore = createAccountDesignFixtureStore();
