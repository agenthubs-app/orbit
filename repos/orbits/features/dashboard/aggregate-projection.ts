import type {
  DashboardAggregatePayload,
  DashboardAggregateScenario,
  DashboardHighValueRelationship,
} from "./contract";
import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../shared/domain/contracts";

const supportedScenarios = new Set<DashboardAggregateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

export function normalizeDashboardAggregateScenario(
  scenario?: string | null,
): DashboardAggregateScenario {
  if (scenario && supportedScenarios.has(scenario as DashboardAggregateScenario)) {
    return scenario as DashboardAggregateScenario;
  }

  return "success";
}

export function normalizeDashboardActivityLimit(
  limit?: number | null,
): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

export function dashboardContactsById(
  contacts: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

export function dashboardPriorityScore(connection: ConnectionDTO): number {
  return Math.round(
    connection.businessRelevanceScore ??
      connection.relationshipStrength ??
      Math.min(95, 60 + connection.valueTypes.length * 10),
  );
}

export function dashboardValueType(
  connection: ConnectionDTO,
): DashboardHighValueRelationship["valueType"] {
  if (connection.valueTypes.includes("commercial_opportunity")) {
    return "commercial_opportunity";
  }

  if (connection.valueTypes.includes("referral_path")) {
    return "referral_path";
  }

  return "strategic_fit";
}

export function dashboardDueLabel(task: TaskDTO, generatedAt: string): string {
  if (!task.dueAt) {
    return "No due date";
  }

  const dueTime = new Date(task.dueAt).getTime();
  const baseTime = new Date(generatedAt).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(baseTime)) {
    return "Due this week";
  }

  const days = Math.ceil((dueTime - baseTime) / 86_400_000);

  if (days <= 0) {
    return "Due today";
  }

  if (days === 1) {
    return "Due tomorrow";
  }

  return `Due in ${days} days`;
}

export function applyDashboardActivityLimit(
  payload: DashboardAggregatePayload,
  activityLimit?: number | null,
): DashboardAggregatePayload {
  const limit = normalizeDashboardActivityLimit(activityLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    recentActivity: payload.recentActivity.slice(0, limit),
  };
}
