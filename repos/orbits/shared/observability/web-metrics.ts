/**
 * P0 browser measurement (docs/2026-11-21-data-access-redesign.md §5 P0): what the person waited for
 * — first load (TTFB, FCP, LCP, JS bytes, long tasks) and in-app page changes (click → address bar
 * → skeleton gone). The browser sends a small beacon to `/telemetry/web`; the server validates it
 * and writes one log line. No account, no concrete ids, no database.
 */

export const WEB_METRICS_PATH = "/telemetry/web";
export const WEB_METRICS_MAX_BYTES = 2_048;

const NUMBER_FIELDS = [
  "ttfbMs",
  "fcpMs",
  "lcpMs",
  "domReadyMs",
  "jsKb",
  "longTaskMs",
  "longTasks",
  "urlMs",
  "contentMs",
  "viewportW",
] as const;
const ROUTE_PATTERN = /^\/[A-Za-z0-9/_\-[\]]{0,160}(\?tab=[a-z-]{1,24})?$/u;

export type WebMetricKind = "load" | "nav";

export interface WebMetric {
  kind: WebMetricKind;
  route: string;
  from?: string;
  navType?: string;
  skeleton?: boolean;
  timedOut?: boolean;
  ttfbMs?: number;
  fcpMs?: number;
  lcpMs?: number;
  domReadyMs?: number;
  jsKb?: number;
  longTaskMs?: number;
  longTasks?: number;
  urlMs?: number;
  contentMs?: number;
  viewportW?: number;
}

/**
 * `/app/tasks/123456789?x=1` → `/app/tasks/[id]`; a `tab` query is kept because it selects the screen.
 * Ids are digit runs of 6+, uuids, or long mixed tokens; everything else in the path is app vocabulary.
 */
export function webMetricRoute(pathname: string, search = ""): string {
  const path = pathname
    .split("/")
    .map((segment) =>
      /^\d{6,}$/u.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(segment) ||
      (segment.length >= 16 && /\d/u.test(segment)) ||
      /%/u.test(segment)
        ? "[id]"
        : segment,
    )
    .join("/")
    .slice(0, 160);
  const tab = new URLSearchParams(search).get("tab");
  return tab && /^[a-z-]{1,24}$/u.test(tab) ? `${path}?tab=${tab}` : path;
}

/** Accepts only the known shape; anything else is dropped (returns null). */
export function parseWebMetric(raw: unknown): WebMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (input.kind !== "load" && input.kind !== "nav") return null;
  if (typeof input.route !== "string" || !ROUTE_PATTERN.test(input.route)) return null;
  const metric: WebMetric = { kind: input.kind, route: input.route };
  if (typeof input.from === "string" && ROUTE_PATTERN.test(input.from)) metric.from = input.from;
  if (typeof input.navType === "string" && /^[a-z_]{1,16}$/u.test(input.navType)) metric.navType = input.navType;
  if (typeof input.skeleton === "boolean") metric.skeleton = input.skeleton;
  if (typeof input.timedOut === "boolean") metric.timedOut = input.timedOut;
  for (const field of NUMBER_FIELDS) {
    const value = input[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 600_000) {
      metric[field] = Math.round(value);
    }
  }
  return metric;
}
