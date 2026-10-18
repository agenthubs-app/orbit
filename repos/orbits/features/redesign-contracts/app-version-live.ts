import type { AppVersionContract } from "../../shared/contract/account";
import { z } from "zod";

const SEMVER = /^\d+\.\d+\.\d+$/u;
const GIT_SHA = /^[a-f\d]{7,40}$/iu;
const INSTANT = z.string().datetime({ offset: true });

function semverFromEnvironment(name: string): string | null {
  const value = process.env[name]?.trim();
  if (value && SEMVER.test(value)) return value;
  console.error(`[app-version] ${name} is missing or invalid; using a safe fallback`);
  return null;
}

function compareSemver(left: string, right: string): number {
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

/** Server-only policy. No mock fixture or client-provided value can enable enforcement. */
export function readLiveAppVersion(): AppVersionContract {
  const minimum = semverFromEnvironment("ORBIT_APP_MIN_SUPPORTED_VERSION");
  const latest = semverFromEnvironment("ORBIT_APP_LATEST_VERSION");
  const requestedEnforcement = process.env.ORBIT_APP_ENFORCE_MINIMUM?.trim() === "true";
  const enforceMinimum = requestedEnforcement && minimum !== null && latest !== null && compareSemver(minimum, latest) <= 0;
  if (requestedEnforcement && !enforceMinimum) {
    console.error("[app-version] minimum enforcement requested without a valid version range; leaving it disabled");
  }

  const maintenanceActive = process.env.ORBIT_APP_MAINTENANCE_ACTIVE?.trim() === "true";
  const until = process.env.ORBIT_APP_MAINTENANCE_UNTIL?.trim();
  const validUntil = until && INSTANT.safeParse(until).success ? until : undefined;
  if (until && !validUntil) console.error("[app-version] maintenance until is invalid; omitting the time");

  const build = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (build && !GIT_SHA.test(build)) console.error("[app-version] web build identity is invalid; omitting it");

  return {
    minSupportedAppVersion: minimum ?? "0.0.0",
    latestAppVersion: latest ?? "0.0.0",
    enforceMinimum,
    ...(maintenanceActive ? { maintenance: { active: true, ...(validUntil ? { until: validUntil } : {}) } } : {}),
    ...(build && GIT_SHA.test(build) ? { webBuildId: build } : {}),
  };
}
