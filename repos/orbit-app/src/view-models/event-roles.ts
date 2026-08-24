export type EventDelegatedRole =
  | "operations"
  | "check_in"
  | "reviewer"
  | "read_only_analyst";
export type EventPrincipalRole = "owner" | EventDelegatedRole;

export interface EventRoleMemberView {
  assignedLabel: string | null;
  reason: string | null;
  revision: number;
  role: EventPrincipalRole;
  roleLabel: string;
  subjectActorId: string;
}

export interface EventRolesView {
  eventId: string;
  members: EventRoleMemberView[];
  title: string;
}

export interface EventRoleAssignmentView {
  eventId: string;
  owner: boolean;
  revision: number;
  role: EventDelegatedRole | null;
  state: "active" | "revoked" | null;
  subjectActorId: string;
}

export const EVENT_ROLE_OPTIONS: readonly {
  description: string;
  label: string;
  value: EventDelegatedRole;
}[] = [
  { description: "配置运营与现场流程", label: "运营", value: "operations" },
  { description: "受限名单与到场记录", label: "签到", value: "check_in" },
  { description: "报名审阅与准入决定", label: "审核", value: "reviewer" },
  { description: "仅查看汇总分析", label: "只读分析", value: "read_only_analyst" }
];

const roleLabels: Record<EventPrincipalRole, string> = {
  check_in: "签到",
  operations: "运营",
  owner: "活动负责人",
  read_only_analyst: "只读分析",
  reviewer: "审核"
};
const roles = ["owner", ...EVENT_ROLE_OPTIONS.map((option) => option.value)] as const;
const actorIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is EventPrincipalRole {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

function isDelegatedRole(value: unknown): value is EventDelegatedRole {
  return EVENT_ROLE_OPTIONS.some((option) => option.value === value);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function memberToView(value: unknown): EventRoleMemberView | null {
  if (
    !isRecord(value) ||
    value.state !== "active" ||
    typeof value.subjectActorId !== "string" ||
    !actorIdPattern.test(value.subjectActorId) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    !isRole(value.role) ||
    (value.reason !== null && typeof value.reason !== "string") ||
    (value.assignedAt !== null && typeof value.assignedAt !== "string")
  ) {
    return null;
  }
  return {
    assignedLabel: value.assignedAt ? formatTime(value.assignedAt) : null,
    reason:
      value.role === "owner"
        ? "由活动主办方身份自动生成"
        : value.reason?.trim() || null,
    revision: value.revision,
    role: value.role,
    roleLabel: roleLabels[value.role],
    subjectActorId: value.subjectActorId
  };
}

export function eventRoleMembersToView(payload: unknown): EventRolesView {
  if (!isRecord(payload) || !isRecord(payload.event)) {
    return { eventId: "", members: [], title: "活动角色" };
  }
  const eventId = typeof payload.event.eventId === "string" ? payload.event.eventId : "";
  const title =
    typeof payload.event.title === "string" && payload.event.title.trim()
      ? payload.event.title.trim()
      : "活动角色";
  const members = Array.isArray(payload.members)
    ? payload.members
        .map(memberToView)
        .filter((member): member is EventRoleMemberView => member !== null)
    : [];
  return { eventId, members, title };
}

export function eventRoleAssignmentToView(payload: unknown): EventRoleAssignmentView | null {
  if (
    !isRecord(payload) ||
    typeof payload.eventId !== "string" ||
    typeof payload.owner !== "boolean" ||
    typeof payload.revision !== "number" ||
    !Number.isSafeInteger(payload.revision) ||
    !(payload.role === null || isDelegatedRole(payload.role)) ||
    !(payload.state === null || payload.state === "active" || payload.state === "revoked") ||
    typeof payload.subjectActorId !== "string"
  ) return null;
  return payload as unknown as EventRoleAssignmentView;
}

export function eventRoleMutationMatches(
  payload: unknown,
  expected: {
    role?: EventDelegatedRole;
    state: "active" | "revoked";
    subjectActorId: string;
  }
): boolean {
  const assignment = eventRoleAssignmentToView(payload);
  return Boolean(
    assignment &&
      !assignment.owner &&
      assignment.subjectActorId === expected.subjectActorId &&
      assignment.state === expected.state &&
      (expected.role === undefined || assignment.role === expected.role)
  );
}

export function validateEventRoleDraft(actorId: string, reason: string): string | null {
  if (!actorIdPattern.test(actorId.trim())) {
    return "请输入准确的账号 ID。";
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 1_000) {
    return "请填写 1–1000 个字符的操作原因。";
  }
  return null;
}

export function buildEventRoleGrantBody(
  expectedRevision: number,
  reason: string,
  role: EventDelegatedRole
) {
  return { expectedRevision, reason: reason.trim(), role };
}

export function buildEventRoleRevokeBody(expectedRevision: number, reason: string) {
  return { expectedRevision, reason: reason.trim() };
}
