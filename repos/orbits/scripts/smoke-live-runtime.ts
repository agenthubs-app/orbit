import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./load-local-env";

interface ApiEnvelope {
  success?: unknown;
  data?: unknown;
  error?: unknown;
}

interface CheckedRoute {
  path: string;
  detail: string;
}

export interface LiveRuntimeSmokeOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

export interface LiveRuntimeSmokeResult {
  checkedRoutes: readonly CheckedRoute[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} did not return an object payload.`);
  }

  return value;
}

function resolveBaseUrl(rawBaseUrl: string | undefined): string {
  const baseUrl = rawBaseUrl?.trim() || "http://localhost:3000";

  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function readLiveEnvelope(
  options: {
    baseUrl: string;
    fetchImpl: typeof fetch;
    path: string;
  },
): Promise<Record<string, unknown>> {
  const response = await options.fetchImpl(new URL(options.path, options.baseUrl));
  const featureMode = response.headers.get("x-orbit-feature-mode");

  if (featureMode !== "live") {
    throw new Error(
      `${options.path} returned x-orbit-feature-mode=${featureMode ?? "<missing>"} instead of live.`,
    );
  }

  const envelope = (await response.json()) as ApiEnvelope;

  if (!response.ok || envelope.success !== true) {
    throw new Error(
      `${options.path} returned status ${response.status} with a non-success envelope.`,
    );
  }

  return requireRecord(envelope.data, `${options.path} data`);
}

function checkHealth(data: Record<string, unknown>): CheckedRoute {
  if (data.mode !== "live") {
    throw new Error("/api/health did not report mode=live.");
  }

  return {
    path: "/api/health",
    detail: "health reports live mode",
  };
}

function checkBootstrap(data: Record<string, unknown>): CheckedRoute {
  const connectionSummary = requireRecord(
    data.connectionSummary,
    "/api/app/bootstrap connectionSummary",
  );
  const totalContacts = Number(connectionSummary.totalContacts);
  const pendingTasks = arrayLength(data.pendingTasks);
  const upcomingEvents = arrayLength(data.upcomingEvents);

  if (!Number.isFinite(totalContacts) || totalContacts <= 0) {
    throw new Error("/api/app/bootstrap returned no live contact count.");
  }

  if (pendingTasks <= 0 || upcomingEvents <= 0) {
    throw new Error(
      "/api/app/bootstrap returned no live pending tasks or upcoming events.",
    );
  }

  return {
    path: "/api/app/bootstrap",
    detail: `${totalContacts} contacts, ${pendingTasks} tasks, ${upcomingEvents} events`,
  };
}

function checkEvents(data: Record<string, unknown>): CheckedRoute {
  const events = arrayLength(data.events);
  const provenance = requireRecord(data.provenance, "/api/events provenance");

  if (
    events <= 0 ||
    provenance.generationMethod !== "live-store-query" ||
    !String(provenance.source ?? "").includes("live-record-store:events")
  ) {
    throw new Error("/api/events did not return live database-backed events.");
  }

  return {
    path: "/api/events",
    detail: `${events} events`,
  };
}

function checkContacts(data: Record<string, unknown>): CheckedRoute {
  const contacts = arrayLength(data.contacts);
  const provenance = requireRecord(
    data.provenance,
    "/api/contacts provenance",
  );

  if (contacts <= 0 || provenance.databaseQueryExecuted !== true) {
    throw new Error(
      "/api/contacts did not return live database-backed contacts.",
    );
  }

  return {
    path: "/api/contacts",
    detail: `${contacts} contacts`,
  };
}

export async function runLiveRuntimeSmoke(
  options: LiveRuntimeSmokeOptions = {},
): Promise<LiveRuntimeSmokeResult> {
  const baseUrl = resolveBaseUrl(
    options.baseUrl ?? process.env.ORBIT_LIVE_BASE_URL,
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? console.log;
  const checks: readonly [
    string,
    (data: Record<string, unknown>) => CheckedRoute,
  ][] = [
    ["/api/health", checkHealth],
    ["/api/app/bootstrap", checkBootstrap],
    ["/api/events", checkEvents],
    ["/api/contacts", checkContacts],
  ];
  const checkedRoutes: CheckedRoute[] = [];

  for (const [path, check] of checks) {
    const data = await readLiveEnvelope({ baseUrl, fetchImpl, path });
    const checkedRoute = check(data);
    checkedRoutes.push(checkedRoute);
    log(`- ${checkedRoute.path}: ${checkedRoute.detail}`);
  }

  return { checkedRoutes };
}

async function main(): Promise<void> {
  loadLocalEnv();

  console.log(
    `Running live runtime smoke against ${resolveBaseUrl(
      process.env.ORBIT_LIVE_BASE_URL,
    )}`,
  );

  await runLiveRuntimeSmoke();
  console.log("Live runtime smoke passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
