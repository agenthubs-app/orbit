// Neon's daily data transfer for the reconciliation row, from the v2 project
// consumption endpoint (GET /consumption_history/v2/projects; Launch, Scale,
// Agent, Business and Enterprise plans). That endpoint requires org_id and an
// explicit metrics list; the transfer metrics are public_network_transfer_bytes
// and private_network_transfer_bytes (the legacy /consumption_history/projects
// endpoint exposes neither). Sources:
//   https://api-docs.neon.tech/reference/getconsumptionhistoryperprojectv2
//   https://neon.com/docs/guides/consumption-metrics
//
// Without NEON_API_KEY, NEON_PROJECT_ID and NEON_ORG_ID the reader is null and
// the day is recorded as "unavailable". A plan without the endpoint (403) is
// also "unavailable". Any other HTTP error, a missing day or an unexpected body
// is "failed": a number is recorded only when Neon actually returned one. The
// key never leaves the Authorization header.

export type NeonUsage =
  | { status: "ok"; bytes: number }
  | { status: "unavailable" | "failed"; reason: string };

export type NeonUsageReader = (day: string) => Promise<NeonUsage>;

const ENDPOINT = "https://console.neon.tech/api/v2/consumption_history/v2/projects";
export const NEON_TRANSFER_METRICS = ["public_network_transfer_bytes", "private_network_transfer_bytes"] as const;
const TIMEOUT_MS = 10_000;

export function createNeonUsageReader(input: {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}): NeonUsageReader | null {
  const env = input.env ?? process.env;
  const apiKey = env.NEON_API_KEY?.trim();
  const projectId = env.NEON_PROJECT_ID?.trim();
  const orgId = env.NEON_ORG_ID?.trim();
  if (!apiKey || !projectId || !orgId) return null;
  const fetchImpl = input.fetch ?? fetch;
  return async (day) => {
    const from = `${day}T00:00:00Z`;
    const to = new Date(Date.parse(from) + 86_400_000).toISOString().replace(".000Z", "Z");
    const query = new URLSearchParams({
      org_id: orgId,
      project_ids: projectId,
      metrics: NEON_TRANSFER_METRICS.join(","),
      from,
      to,
      granularity: "daily",
    });
    // The documented form is a comma-separated list in one parameter value.
    const url = `${ENDPOINT}?${query.toString().replaceAll("%2C", ",")}`;
    let body: unknown;
    try {
      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 403) return { status: "unavailable", reason: "plan_unsupported" };
      if (!response.ok) return { status: "failed", reason: `http_${response.status}` };
      body = await response.json();
    } catch {
      return { status: "failed", reason: "request_failed" };
    }
    return transferBytesForDay(body, projectId, from);
  };
}

function transferBytesForDay(body: unknown, projectId: string, dayStart: string): NeonUsage {
  const projects = (body as { projects?: unknown })?.projects;
  if (!Array.isArray(projects)) return { status: "failed", reason: "unexpected_response" };
  const project = projects.find((p) => (p as { project_id?: unknown })?.project_id === projectId);
  if (!project) return { status: "failed", reason: "no_data" };
  const periods = (project as { periods?: unknown }).periods;
  if (!Array.isArray(periods)) return { status: "failed", reason: "unexpected_response" };
  const wanted = new Set<string>(NEON_TRANSFER_METRICS);
  const dayMs = Date.parse(dayStart);
  let total = 0;
  let found = false;
  for (const period of periods) {
    const consumption = (period as { consumption?: unknown })?.consumption;
    if (!Array.isArray(consumption)) continue;
    for (const entry of consumption) {
      const start = (entry as { timeframe_start?: unknown })?.timeframe_start;
      if (typeof start !== "string" || Date.parse(start) !== dayMs) continue;
      const metrics = (entry as { metrics?: unknown }).metrics;
      if (!Array.isArray(metrics)) return { status: "failed", reason: "unexpected_response" };
      found = true;
      // Metrics with a value of zero may be omitted, so an absent transfer metric counts as 0.
      for (const metric of metrics) {
        const name = (metric as { metric_name?: unknown })?.metric_name;
        const value = (metric as { value?: unknown })?.value;
        if (typeof name !== "string" || !wanted.has(name)) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          return { status: "failed", reason: "unexpected_response" };
        }
        total += value;
      }
    }
  }
  return found ? { status: "ok", bytes: total } : { status: "failed", reason: "no_data" };
}
