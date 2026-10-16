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
  /**
   * R17（host/DESIGN.md §10 A12，用户 2026-10-16「全按推荐」）：主办方在 Orbit 里建的活动（`created_by = 'host'`）
   * 不受总开关缺省关闭与白名单限制；kill switch 与能力开关仍可一键停用。属于生产行为，随合回部署授权生效。
   */
  hostCreated?: boolean;
}): EventPilotDecision {
  const env = input.env ?? process.env;
  const production = env.NODE_ENV === "production";
  if (enabledFlag(env.ORBIT_EVENT_PILOT_KILL_SWITCH, false)) {
    return { enabled: false, reason: "global_kill_switch" };
  }
  if (input.hostCreated === true) {
    return enabledFlag(env[capabilityFlag(input.capability)], true)
      ? { enabled: true, reason: "enabled" }
      : { enabled: false, reason: "capability_disabled" };
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
