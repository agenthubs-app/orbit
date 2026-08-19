export const EVENT_PILOT_CAPABILITIES = [
  "experience",
  "proactive_reminders",
  "effective_connection_roi",
] as const;

export type EventPilotCapability =
  (typeof EVENT_PILOT_CAPABILITIES)[number];

export interface EventPilotDecision {
  enabled: boolean;
  reason:
    | "enabled"
    | "global_disabled"
    | "global_kill_switch"
    | "capability_disabled"
    | "event_not_allowlisted";
}

type EventPilotEnvironment = Readonly<Record<string, string | undefined>>;

function enabledFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || !value.trim()) return fallback;
  return value.trim().toLowerCase() === "true";
}

function allowlistedEvents(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((eventId) => eventId.trim())
      .filter(Boolean),
  );
}

function capabilityFlag(capability: EventPilotCapability): string {
  return `ORBIT_EVENT_PILOT_${capability.toUpperCase()}_ENABLED`;
}

/**
 * Production is fail-closed: the global switch and an exact event allowlist are
 * both required. Tests and local development remain enabled unless a switch is
 * explicitly disabled, so rollout configuration never leaks into fixtures.
 */
export function eventPilotDecision(input: {
  capability: EventPilotCapability;
  eventId: string;
  env?: EventPilotEnvironment;
}): EventPilotDecision {
  const env = input.env ?? process.env;
  const production = env.NODE_ENV === "production";
  if (enabledFlag(env.ORBIT_EVENT_PILOT_KILL_SWITCH, false)) {
    return { enabled: false, reason: "global_kill_switch" };
  }
  if (!enabledFlag(env.ORBIT_EVENT_PILOT_ENABLED, !production)) {
    return { enabled: false, reason: "global_disabled" };
  }
  if (!enabledFlag(env[capabilityFlag(input.capability)], true)) {
    return { enabled: false, reason: "capability_disabled" };
  }
  const allowlist = allowlistedEvents(env.ORBIT_EVENT_PILOT_EVENT_IDS);
  if (allowlist.size === 0 ? production : !allowlist.has(input.eventId.trim())) {
    return { enabled: false, reason: "event_not_allowlisted" };
  }
  return { enabled: true, reason: "enabled" };
}
