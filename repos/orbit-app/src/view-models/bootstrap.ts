export interface AppBootstrapSummary {
  assistantActionCount: number;
  highValueRelationships: number;
  nextAction: string;
  pendingFollowupCount: number;
  profileName: string;
  relationshipAssetCount: number;
  summary: string;
  upcomingEventCount: number;
  workspaceName: string;
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

function numberField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function arrayLength(record: Record<string, unknown>, fieldName: string): number {
  const value = record[fieldName];
  return Array.isArray(value) ? value.length : 0;
}

export function bootstrapToSummary(data: unknown): AppBootstrapSummary {
  const payload = isRecord(data) ? data : {};
  const account = isRecord(payload.account) ? payload.account : {};
  const profile = isRecord(payload.profile) ? payload.profile : {};
  const dashboardSummary = isRecord(payload.dashboardSummary)
    ? payload.dashboardSummary
    : {};

  return {
    assistantActionCount: arrayLength(payload, "topAgentActions"),
    highValueRelationships: numberField(
      dashboardSummary,
      "highValueRelationships"
    ),
    nextAction: stringField(
      payload,
      "nextAction",
      "Open Orbit AI to decide the next relationship move."
    ),
    pendingFollowupCount:
      numberField(dashboardSummary, "pendingFollowups") ||
      arrayLength(payload, "pendingTasks"),
    profileName: stringField(profile, "displayName", "Orbit user"),
    relationshipAssetCount: numberField(
      dashboardSummary,
      "relationshipAssets"
    ),
    summary: stringField(
      payload,
      "summary",
      "Orbit is ready when your relationship data is connected."
    ),
    upcomingEventCount: arrayLength(payload, "upcomingEvents"),
    workspaceName: stringField(account, "workspaceName", "Orbit")
  };
}
