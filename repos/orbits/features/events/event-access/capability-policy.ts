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
  ]),
  read_only_analyst: capabilities([
    "event.center.read",
    "analytics.read_aggregate",
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
