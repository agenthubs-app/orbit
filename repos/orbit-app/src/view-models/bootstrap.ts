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
  return /\b(live|mock|hybrid|fixture|provider|providers|payload|source-backed|command-center|command center)\b/i.test(
    value
  );
}

function startupSummaryCopy(
  pendingFollowupCount: number,
  upcomingEventCount: number
): string {
  return `你有 ${pendingFollowupCount} 个跟进事项和 ${upcomingEventCount} 场活动需要看。`;
}

function userFacingSummaryCopy(
  providedSummary: string,
  pendingFollowupCount: number,
  upcomingEventCount: number
): string {
  if (!providedSummary) {
    return "连接人脉数据后，Orbit 会在这里整理当天重点。";
  }

  if (!containsImplementationLabel(providedSummary)) {
    return providedSummary;
  }

  return startupSummaryCopy(pendingFollowupCount, upcomingEventCount);
}

function userFacingNextActionCopy(value: string): string {
  if (!value || containsImplementationLabel(value)) {
    return "先看今天最值得处理的一件事。";
  }

  return value;
}

function userFacingWorkspaceName(value: string): string {
  if (!value || containsImplementationLabel(value) || /\bgenerated\b/i.test(value)) {
    return "Orbit";
  }

  return value;
}

function userFacingProfileName(profile: Record<string, unknown>): string {
  const displayName = stringField(profile, "displayName");
  const organization = stringField(profile, "organization");
  const id = stringField(profile, "id");

  if (
    id === "profile_orbit_generated_operator" ||
    displayName === "小雨" ||
    displayName === "赵翔" ||
    displayName === "Xinyi Zhao" ||
    organization === "OPPO Japan Research"
  ) {
    return "小雨";
  }

  return displayName || "小雨";
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
    nextAction: userFacingNextActionCopy(stringField(payload, "nextAction")),
    pendingFollowupCount,
    profileName: userFacingProfileName(profile),
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
    workspaceName: userFacingWorkspaceName(
      stringField(account, "workspaceName", "Orbit")
    )
  };
}

export function bootstrapMetrics(
  summary: AppBootstrapSummary
): BootstrapMetric[] {
  return [
    { label: "活动", value: summary.upcomingEventCount },
    { label: "跟进", value: summary.pendingFollowupCount },
    { label: "人脉", value: summary.relationshipAssetCount },
    { label: "待确认", value: summary.assistantActionCount }
  ];
}
