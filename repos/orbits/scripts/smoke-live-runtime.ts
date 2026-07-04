import { pathToFileURL } from "node:url";
import { defaultMockFixtures } from "../shared/mock/fixtures";
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

const expectedGeneratedEvents = defaultMockFixtures.events.map((event) => ({
  id: event.id,
  name: event.name,
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function recordArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
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
    requestInit?: RequestInit;
    path: string;
  },
): Promise<Record<string, unknown>> {
  const response = await options.fetchImpl(
    new URL(options.path, options.baseUrl),
    options.requestInit,
  );
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
  const eventRecords = recordArray(data.events);
  const events = eventRecords.length;
  const provenance = requireRecord(data.provenance, "/api/events provenance");
  const eventById = new Map(
    eventRecords.map((event) => [String(event.id ?? ""), event]),
  );
  const legacyEvents = eventRecords.filter((event) => {
    const id = String(event.id ?? "");
    const title = String(event.title ?? event.name ?? "");

    return (
      id === "demo-event-1" ||
      id === "demo-event-2" ||
      id === "event:manual:founder-investor-salon" ||
      /\b(smoke|diagnostic)\b/i.test(`${id} ${title}`)
    );
  });

  if (
    events <= 0 ||
    provenance.generationMethod !== "live-store-query" ||
    !String(provenance.source ?? "").includes("live-record-store:events")
  ) {
    throw new Error("/api/events did not return live database-backed events.");
  }

  if (legacyEvents.length > 0) {
    throw new Error(
      `/api/events returned legacy event records: ${legacyEvents
        .map((event) => String(event.id ?? event.title ?? "unknown"))
        .join(", ")}`,
      );
  }

  const missingGeneratedEvents = expectedGeneratedEvents.filter(
    (event) => !eventById.has(event.id),
  );
  const mismatchedGeneratedEvents = expectedGeneratedEvents.filter((event) => {
    const record = eventById.get(event.id);
    const title = String(record?.title ?? record?.name ?? "");

    return record !== undefined && title !== event.name;
  });

  if (missingGeneratedEvents.length > 0) {
    throw new Error(
      `/api/events missing generated event batch records: ${missingGeneratedEvents
        .map((event) => event.id)
        .join(", ")}`,
    );
  }

  if (mismatchedGeneratedEvents.length > 0) {
    throw new Error(
      `/api/events returned generated event records with mismatched titles: ${mismatchedGeneratedEvents
        .map((event) => event.id)
        .join(", ")}`,
    );
  }

  return {
    path: "/api/events",
    detail: `${events} events, ${expectedGeneratedEvents.length}/${expectedGeneratedEvents.length} generated event batch`,
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

function checkProactiveTurn(data: Record<string, unknown>): CheckedRoute {
  const message = requireRecord(
    data.message,
    "/api/ai/proactive-turns message",
  );
  const provenance = requireRecord(
    data.provenance,
    "/api/ai/proactive-turns provenance",
  );
  const safety = requireRecord(
    provenance.safety,
    "/api/ai/proactive-turns safety",
  );

  if (
    message.deliverySurface !== "orbit_ai_chat" ||
    message.turnKind !== "proactive" ||
    provenance.generationMethod !== "live-policy-proactive-turn" ||
    safety.notificationDelivered !== false ||
    safety.pushProviderRequested !== false ||
    safety.liveDatabaseWriteExecuted !== false
  ) {
    throw new Error(
      "/api/ai/proactive-turns did not return a safe Orbit AI chat proactive turn.",
    );
  }

  return {
    path: "/api/ai/proactive-turns",
    detail: "Orbit AI chat proactive turn",
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
  const checks: readonly {
    check: (data: Record<string, unknown>) => CheckedRoute;
    path: string;
    requestInit?: RequestInit;
  }[] = [
    { check: checkHealth, path: "/api/health" },
    { check: checkBootstrap, path: "/api/app/bootstrap" },
    { check: checkEvents, path: "/api/events" },
    { check: checkContacts, path: "/api/contacts" },
    {
      check: checkProactiveTurn,
      path: "/api/ai/proactive-turns",
      requestInit: {
        body: JSON.stringify({
          signal: {
            body: "Live runtime smoke verifies proactive turns stay inside Orbit AI chat.",
            evidenceIds: ["evidence:live-runtime-smoke:proactive"],
            signalId: "signal:live-runtime-smoke:proactive",
            sourceModule: "system",
            title: "Live runtime smoke proactive turn",
            type: "system_status",
          },
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    },
  ];
  const checkedRoutes: CheckedRoute[] = [];

  for (const { check, path, requestInit } of checks) {
    const data = await readLiveEnvelope({
      baseUrl,
      fetchImpl,
      path,
      requestInit,
    });
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
