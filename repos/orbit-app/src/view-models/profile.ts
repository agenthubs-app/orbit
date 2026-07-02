export interface ProfileSummary {
  displayName: string;
  headline: string;
  timezone: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function profileToSummary(data: unknown): ProfileSummary {
  const profile = isRecord(data)
    ? data.profile
    : null;

  if (!isRecord(profile)) {
    return {
      displayName: "Orbit profile",
      headline: "Complete your relationship profile",
      timezone: "Local"
    };
  }

  return {
    displayName: stringField(profile, "displayName", "Orbit user"),
    headline: stringField(profile, "headline", "Relationship profile"),
    timezone:
      stringField(profile, "timezone") ||
      stringField(profile, "homeMarket", "Local")
  };
}
