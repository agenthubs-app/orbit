import {
  EVENT_ACCESS_CAPABILITIES,
  isEventAccessAssignmentState,
  isEventAccessCapability,
  isEventAccessRole,
  type EventAccessCapability,
  type EventAccessRole,
} from "./contract";

const OWNER_CAPABILITIES = Object.freeze([...EVENT_ACCESS_CAPABILITIES]);

function capabilities(
  values: readonly EventAccessCapability[],
): readonly EventAccessCapability[] {
  return Object.freeze([...values]);
}

const ROLE_CAPABILITIES: Readonly<
  Record<EventAccessRole, readonly EventAccessCapability[]>
> = Object.freeze({
  check_in: capabilities([
    "event.center.read",
    "check_in.roster.read_limited",
    "check_in.roster.write",
    // R17 A9（用户 2026-10-16「全按推荐」，照 b6 #20 表）：受付能看报告、能当日枠受付。
    "analytics.read_aggregate",
    "check_in.walk_in",
  ]),
  // R17：管理者 = operations ∪ reviewer + 编辑基本情報与概要（不含 roles.manage / owner.transfer / event.cancel）。
  manager: capabilities([
    "event.center.read",
    "operations.read_sensitive",
    "operations.read_summary",
    "operations.configure",
    "experience.configure",
    "experience.publish",
    "attendees.read_full",
    "attendees.export",
    "check_in.roster.read_limited",
    "check_in.roster.write",
    "check_in.walk_in",
    "generation.run",
    "generation.publish",
    "analytics.read_aggregate",
    "admission.read",
    "admission.decide",
    "event.edit",
  ]),
  operations: capabilities([
    "event.center.read",
    "operations.read_sensitive",
    "operations.configure",
    "experience.configure",
    "experience.publish",
    "attendees.read_full",
    "attendees.export",
    "check_in.roster.read_limited",
    "check_in.roster.write",
    "generation.run",
    "generation.publish",
    "analytics.read_aggregate",
    "operations.read_summary",
    "check_in.walk_in",
  ]),
  read_only_analyst: capabilities([
    "event.center.read",
    "analytics.read_aggregate",
    // R17 A9：閲覧能看概要。
    "operations.read_summary",
  ]),
  reviewer: capabilities([
    "event.center.read",
    "admission.read",
    "admission.decide",
  ]),
});

export interface EventAccessPrincipalFacts {
  readonly owner: unknown;
  readonly role: unknown;
  readonly state: unknown;
}

/** Total, default-deny evaluator. Owner comes only from Event Core. */
export function eventAccessCapabilities(
  input: EventAccessPrincipalFacts,
): readonly EventAccessCapability[] {
  if (input.owner === true) return OWNER_CAPABILITIES;
  if (
    !isEventAccessRole(input.role) ||
    !isEventAccessAssignmentState(input.state) ||
    input.state !== "active"
  ) {
    return Object.freeze([]);
  }
  return ROLE_CAPABILITIES[input.role];
}

export function canAccessEventCapability(
  input: EventAccessPrincipalFacts & { readonly capability: unknown },
): boolean {
  return (
    isEventAccessCapability(input.capability) &&
    eventAccessCapabilities(input).includes(input.capability)
  );
}
