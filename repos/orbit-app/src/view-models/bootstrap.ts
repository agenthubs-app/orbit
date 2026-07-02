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

export interface BootstrapMetric {
  label: string;
  value: number;
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

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|hybrid|fixture|provider|providers|command-center|command center)\b/i.test(
    value
  );
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function startupSummaryCopy(
  pendingFollowupCount: number,
  upcomingEventCount: number
): string {
  return `You have ${pendingFollowupCount} ${pluralize(
    pendingFollowupCount,
    "follow-up"
  )} and ${upcomingEventCount} upcoming ${pluralize(
    upcomingEventCount,
    "event"
  )}.`;
}

function userFacingSummaryCopy(
  providedSummary: string,
  pendingFollowupCount: number,
  upcomingEventCount: number
): string {
  if (!providedSummary) {
    return "Orbit is ready when your relationship data is connected.";
  }

  if (!containsImplementationLabel(providedSummary)) {
    return providedSummary;
  }

  return startupSummaryCopy(pendingFollowupCount, upcomingEventCount);
}

export function bootstrapToSummary(data: unknown): AppBootstrapSummary {
  const payload = isRecord(data) ? data : {};
  const account = isRecord(payload.account) ? payload.account : {};
  const profile = isRecord(payload.profile) ? payload.profile : {};
  const dashboardSummary = isRecord(payload.dashboardSummary)
    ? payload.dashboardSummary
    : {};
  const assistantActionCount = arrayLength(payload, "topAgentActions");
  const pendingFollowupCount =
    numberField(dashboardSummary, "pendingFollowups") ||
    arrayLength(payload, "pendingTasks");
  const upcomingEventCount = arrayLength(payload, "upcomingEvents");
  const providedSummary = stringField(payload, "summary");

  return {
    assistantActionCount,
    highValueRelationships: numberField(
      dashboardSummary,
      "highValueRelationships"
    ),
    nextAction: stringField(
      payload,
      "nextAction",
      "Open Orbit AI to decide the next relationship move."
    ),
    pendingFollowupCount,
    profileName: stringField(profile, "displayName", "Orbit user"),
    relationshipAssetCount: numberField(
      dashboardSummary,
      "relationshipAssets"
    ),
    summary: userFacingSummaryCopy(
      providedSummary,
      pendingFollowupCount,
      upcomingEventCount
    ),
    upcomingEventCount,
    workspaceName: stringField(account, "workspaceName", "Orbit")
  };
}

export function bootstrapMetrics(
  summary: AppBootstrapSummary
): BootstrapMetric[] {
  return [
    { label: "Events", value: summary.upcomingEventCount },
    { label: "Follow-ups", value: summary.pendingFollowupCount },
    { label: "Relationships", value: summary.relationshipAssetCount },
    { label: "Assistant actions", value: summary.assistantActionCount }
  ];
}
