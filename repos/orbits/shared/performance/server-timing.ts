export interface ServerTimingSpan {
  durationMs: number;
  name: string;
}

export type TimedRouteHandler<TContext = unknown> = (
  request: Request,
  context?: TContext,
) => Promise<Response>;

const ORBIT_TIMING_NAME = /^orbit-[a-z0-9-]+$/u;

function assertSpan(span: ServerTimingSpan): void {
  if (!ORBIT_TIMING_NAME.test(span.name)) {
    throw new Error("Server-Timing names must use the redacted orbit-* namespace.");
  }
  if (!Number.isFinite(span.durationMs) || span.durationMs < 0) {
    throw new Error("Server-Timing durations must be finite and non-negative.");
  }
}

export function parseServerTiming(value: string | null): readonly ServerTimingSpan[] {
  if (value === null || value.trim() === "") return [];
  const spans = value.split(",").map((part) => {
    const match = /^\s*(orbit-[a-z0-9-]+);dur=(\d+(?:\.\d+)?)\s*$/u.exec(part);
    if (!match) throw new Error("Server-Timing must contain only orbit-* names and numeric dur values.");
    const span = { durationMs: Number(match[2]), name: match[1]! };
    assertSpan(span);
    return span;
  });
  if (new Set(spans.map(({ name }) => name)).size !== spans.length) {
    throw new Error("Server-Timing cannot contain duplicate span names.");
  }
  return spans;
}

export function withServerTiming(
  response: Response,
  spans: readonly ServerTimingSpan[],
): Response {
  const names = new Set<string>();
  for (const span of spans) {
    assertSpan(span);
    if (names.has(span.name)) throw new Error("Server-Timing cannot contain duplicate span names.");
    names.add(span.name);
  }
  const headers = new Headers(response.headers);
  headers.set(
    "Server-Timing",
    spans.map(({ durationMs, name }) => `${name};dur=${Number(durationMs.toFixed(3))}`).join(", "),
  );
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function withTotalServerTiming<TContext = unknown>(
  handler: TimedRouteHandler<TContext>,
  { now = () => globalThis.performance.now() }: { now?: () => number } = {},
): TimedRouteHandler<TContext> {
  return async (request, context) => {
    const startedAt = now();
    const response = await handler(request, context);
    return withServerTiming(response, [
      { durationMs: now() - startedAt, name: "orbit-total" },
    ]);
  };
}
