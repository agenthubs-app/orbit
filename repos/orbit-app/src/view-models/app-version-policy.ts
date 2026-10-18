import { z } from "zod";

export type AppVersionGateDecision =
  | { kind: "allow"; diagnostic?: "policy-unavailable" | "policy-invalid" | "current-version-unavailable" }
  | { kind: "maintenance"; until?: string }
  | { kind: "force-update"; latestAppVersion: string };

type VersionParts = readonly [bigint, bigint, bigint];
const instant = z.string().datetime({ offset: true });

function versionParts(value: unknown): VersionParts | null {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  return value.split(".").map(BigInt) as unknown as VersionParts;
}

function olderThan(current: VersionParts, minimum: VersionParts): boolean {
  for (const index of [0, 1, 2] as const) {
    if (current[index] !== minimum[index]) return current[index] < minimum[index];
  }
  return false;
}

function validUntil(value: unknown): value is string {
  return instant.safeParse(value).success;
}

export function decideAppVersionGate(policy: unknown, currentVersion: string | undefined): AppVersionGateDecision {
  if (policy === null || policy === undefined) return { kind: "allow", diagnostic: "policy-unavailable" };
  if (typeof policy !== "object" || Array.isArray(policy)) return { kind: "allow", diagnostic: "policy-invalid" };

  const value = policy as Record<string, unknown>;
  const maintenance = value.maintenance;
  if (maintenance !== undefined && (maintenance === null || typeof maintenance !== "object" || Array.isArray(maintenance)
      || typeof (maintenance as Record<string, unknown>).active !== "boolean")) {
    return { kind: "allow", diagnostic: "policy-invalid" };
  }
  if (maintenance && typeof maintenance === "object" && !Array.isArray(maintenance)
      && (maintenance as Record<string, unknown>).active === true) {
    const until = (maintenance as Record<string, unknown>).until;
    return validUntil(until) ? { kind: "maintenance", until } : { kind: "maintenance" };
  }

  const minimum = versionParts(value.minSupportedAppVersion);
  const latest = versionParts(value.latestAppVersion);
  if (!minimum || !latest || olderThan(latest, minimum)) return { kind: "allow", diagnostic: "policy-invalid" };
  if (value.enforceMinimum !== undefined && typeof value.enforceMinimum !== "boolean") return { kind: "allow", diagnostic: "policy-invalid" };

  if (value.enforceMinimum !== true) return { kind: "allow" };
  const current = versionParts(currentVersion);
  if (!current) return { kind: "allow", diagnostic: "current-version-unavailable" };
  return olderThan(current, minimum)
    ? { kind: "force-update", latestAppVersion: value.latestAppVersion as string }
    : { kind: "allow" };
}
