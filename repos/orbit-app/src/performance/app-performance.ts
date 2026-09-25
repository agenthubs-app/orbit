export type AppPerformanceMetric =
  | "app.startup"
  | "app.auth_restore"
  | "app.navigation"
  | "app.resource"
  | "app.snapshot"
  | "app.react_commit";

export type AppPerformanceScenario =
  | "app.startup"
  | "app.auth_restore"
  | "app.home"
  | "app.notes"
  | "app.inbox"
  | "app.schedule"
  | "app.profile";

export interface AppPerformanceSample {
  commit: string;
  durationMs: number;
  environment: "app-release-simulator";
  failed: boolean;
  metric: AppPerformanceMetric;
  run: number;
  scenario: AppPerformanceScenario;
  unit: "milliseconds";
}

export type AppPerformanceInput = Omit<
  AppPerformanceSample,
  "durationMs" | "failed"
>;

export interface AppPerformanceScope {
  actorId: string | null;
  baseUrl: string;
}

export interface AppPerformanceRecorder {
  drain: () => readonly AppPerformanceSample[];
  mark: (sample: AppPerformanceSample) => void;
  measure: <T>(input: AppPerformanceInput, work: () => Promise<T>) => Promise<T>;
  setScope: (scope: AppPerformanceScope) => void;
}

const METRICS = new Set<AppPerformanceMetric>([
  "app.startup",
  "app.auth_restore",
  "app.navigation",
  "app.resource",
  "app.snapshot",
  "app.react_commit",
]);

const SCENARIOS = new Set<AppPerformanceScenario>([
  "app.startup",
  "app.auth_restore",
  "app.home",
  "app.notes",
  "app.inbox",
  "app.schedule",
  "app.profile",
]);

const INPUT_FIELDS = [
  "commit",
  "environment",
  "metric",
  "run",
  "scenario",
  "unit",
] as const;

const SAMPLE_FIELDS = [...INPUT_FIELDS, "durationMs", "failed"] as const;
const EMPTY_SAMPLES: readonly AppPerformanceSample[] = Object.freeze([]);

export function appPerformanceScenarioForPath(
  path: string,
): AppPerformanceScenario | null {
  const pathname = path.split("?", 1)[0] ?? "";
  if (pathname === "/api/mobile/contacts-dashboard") return "app.home";
  if (pathname === "/api/notes" || pathname.startsWith("/api/notes/")) return "app.notes";
  if (
    pathname === "/api/chat/relationship-inbox" ||
    pathname.startsWith("/api/chat/relationship-inbox/") ||
    pathname === "/api/relationship-communication/conversation-summaries" ||
    pathname.startsWith("/api/relationship-communication/conversations/")
  ) return "app.inbox";
  if (pathname === "/api/schedule-items" || pathname.startsWith("/api/schedule-items/")) return "app.schedule";
  if (pathname === "/api/profile" || pathname.startsWith("/api/profile/")) return "app.profile";
  return null;
}

export function appPerformanceInput(
  metric: AppPerformanceMetric,
  scenario: AppPerformanceScenario,
): AppPerformanceInput {
  const configuredRun = Number(process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN_NUMBER);
  const run = Number.isInteger(configuredRun) && configuredRun >= 1 && configuredRun <= 10
    ? configuredRun
    : 1;
  return {
    commit: process.env.EXPO_PUBLIC_ORBIT_BUILD_SHA ?? "unknown",
    environment: "app-release-simulator",
    metric,
    run,
    scenario,
    unit: "milliseconds",
  };
}

function assertFields(value: object, expected: readonly string[]): void {
  const fields = Object.keys(value);
  for (const field of fields) {
    if (!expected.includes(field)) {
      throw new Error(`App performance sample has unexpected field ${field}.`);
    }
  }
  if (fields.length !== expected.length) {
    throw new Error("App performance sample is missing required fields.");
  }
}

function assertInput(input: AppPerformanceInput): void {
  assertFields(input, INPUT_FIELDS);
  if (input.environment !== "app-release-simulator") {
    throw new Error("App performance samples require the Release Simulator environment.");
  }
  if (!METRICS.has(input.metric)) {
    throw new Error("App performance sample requires a supported app performance metric.");
  }
  if (!SCENARIOS.has(input.scenario)) {
    throw new Error("App performance sample requires a stable app performance scenario.");
  }
  if (!Number.isInteger(input.run) || input.run < 1 || input.run > 10) {
    throw new Error("App performance sample requires a formal run number from 1 through 10.");
  }
  if (input.unit !== "milliseconds") {
    throw new Error("App performance duration samples require milliseconds.");
  }
}

function assertSample(sample: AppPerformanceSample): void {
  assertFields(sample, SAMPLE_FIELDS);
  const { durationMs: _durationMs, failed: _failed, ...input } = sample;
  assertInput(input);
  if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
    throw new Error("App performance sample requires a finite non-negative durationMs.");
  }
  if (typeof sample.failed !== "boolean") {
    throw new Error("App performance sample requires a boolean failed value.");
  }
}

export function createAppPerformanceRecorder({
  enabled,
  now,
  sink,
}: {
  enabled: boolean;
  now: () => number;
  sink?: (sample: AppPerformanceSample) => void;
}): AppPerformanceRecorder {
  let samples: AppPerformanceSample[] | null = enabled ? [] : null;
  let scopeKey: string | null = null;

  const mark = (sample: AppPerformanceSample): void => {
    if (!samples) {
      return;
    }
    assertSample(sample);
    const recorded = { ...sample };
    samples.push(recorded);
    try {
      sink?.(recorded);
    } catch {
      // Measurement output is subordinate to the user-facing operation.
    }
  };

  return {
    drain() {
      if (!samples || samples.length === 0) {
        return EMPTY_SAMPLES;
      }
      const drained = samples;
      samples = [];
      return drained;
    },
    mark,
    async measure<T>(input: AppPerformanceInput, work: () => Promise<T>): Promise<T> {
      if (!samples) {
        return work();
      }
      assertInput(input);
      const startedAt = now();
      try {
        const result = await work();
        mark({ ...input, durationMs: now() - startedAt, failed: false });
        return result;
      } catch (error) {
        mark({ ...input, durationMs: now() - startedAt, failed: true });
        throw error;
      }
    },
    setScope(scope) {
      if (!samples) {
        return;
      }
      const nextScopeKey = `${scope.baseUrl}\u0000${scope.actorId ?? "signed-out"}`;
      if (scopeKey !== null && scopeKey !== nextScopeKey) {
        samples = [];
      }
      scopeKey = nextScopeKey;
    },
  };
}

export function formatAppPerformanceLog(sample: AppPerformanceSample): string {
  assertSample(sample);
  return `ORBIT_PERF ${JSON.stringify(sample)}`;
}

const PRODUCTION_ENABLED =
  typeof process !== "undefined" &&
  process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN === "1";
const productionRecorder = PRODUCTION_ENABLED
  ? createAppPerformanceRecorder({
      enabled: true,
      now: () => globalThis.performance.now(),
      sink: (sample) => console.error(formatAppPerformanceLog(sample)),
    })
  : null;

export function isAppPerformanceEnabled(): boolean {
  return PRODUCTION_ENABLED;
}

export function markAppPerformance(sample: AppPerformanceSample): void {
  if (!productionRecorder) {
    return;
  }
  productionRecorder.mark(sample);
}

export function measureAppPerformance<T>(
  input: AppPerformanceInput,
  work: () => Promise<T>,
): Promise<T> {
  if (!productionRecorder) {
    return work();
  }
  return productionRecorder.measure(input, work);
}

export function drainAppPerformanceSamples(): readonly AppPerformanceSample[] {
  if (!productionRecorder) {
    return EMPTY_SAMPLES;
  }
  return productionRecorder.drain();
}

export function setAppPerformanceScope(scope: AppPerformanceScope): void {
  if (!productionRecorder) {
    return;
  }
  productionRecorder.setScope(scope);
}
