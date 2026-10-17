import type {
  ManualProfile,
  ProfileCompleteness,
  ProfileCompletenessField,
} from "./contract";

export const PROFILE_COMPLETENESS_FIELDS: readonly ProfileCompletenessField[] = [
  "displayName",
  "headline",
  "relationshipGoal",
  "homeMarket",
  "targetRelationshipTypes",
  "preferredIntroChannels",
];

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

function cardCompleteness(profile: ManualProfile | null): NonNullable<ProfileCompleteness["card"]> {
  const items = [
    { key: "companyRole", weight: 25, done: Boolean(profile?.organization?.trim() && profile?.role?.trim()) },
    { key: "offering", weight: 25, done: Boolean(profile?.offering?.some(value => value.trim())) },
    { key: "seeking", weight: 25, done: Boolean(profile?.seeking?.some(value => value.trim())) },
    { key: "intro", weight: 25, done: Boolean(profile?.bio?.trim()) },
  ];
  return { score: items.reduce((score, item) => score + (item.done ? item.weight : 0), 0), items };
}

export function scoreProfileCompleteness(
  profile: ManualProfile | null,
  emptyFallback?: () => ProfileCompleteness,
): ProfileCompleteness {
  if (!profile) {
    return {
      ...(emptyFallback?.() ?? {
        score: 0,
        status: "not-started",
        completedFields: [],
        missingFields: PROFILE_COMPLETENESS_FIELDS,
        nextBestField: "displayName",
      }),
      card: cardCompleteness(null),
    };
  }

  const completedFields = PROFILE_COMPLETENESS_FIELDS.filter((field) =>
    hasValue(profile, field),
  );
  const missingFields = PROFILE_COMPLETENESS_FIELDS.filter(
    (field) => !completedFields.includes(field),
  );
  const score = Math.round(
    (completedFields.length / PROFILE_COMPLETENESS_FIELDS.length) * 100,
  );

  return {
    card: cardCompleteness(profile),
    score,
    status:
      score === 0 ? "not-started" : missingFields.length === 0 ? "ready" : "action-needed",
    completedFields,
    missingFields,
    nextBestField: missingFields[0] ?? null,
  };
}
