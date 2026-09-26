// Neon's daily data transfer for the reconciliation row. The consumption API
// needs an API key and a plan that exposes it; without NEON_API_KEY and
// NEON_PROJECT_ID the reader is null and the day is recorded as "unavailable".
// Any HTTP error or unexpected body is "failed": a number is recorded only when
// Neon actually returned one. The key never leaves the Authorization header.

export type NeonUsage =
  | { status: "ok"; bytes: number }
  | { status: "unavailable" | "failed"; reason: string };

export type NeonUsageReader = (day: string) => Promise<NeonUsage>;

const ENDPOINT = "https://console.neon.tech/api/v2/consumption_history/projects";
const TIMEOUT_MS = 10_000;

export function createNeonUsageReader(input: {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}): NeonUsageReader | null {
  const env = input.env ?? process.env;
  const apiKey = env.NEON_API_KEY?.trim();
  const projectId = env.NEON_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  const fetchImpl = input.fetch ?? fetch;
  return async (day) => {
    const from = `${day}T00:00:00Z`;
    const to = new Date(Date.parse(from) + 86_400_000).toISOString().replace(".000Z", "Z");
    const url = `${ENDPOINT}?${new URLSearchParams({ project_ids: projectId, from, to, granularity: "daily" })}`;
    let body: unknown;
    try {
      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return { status: "failed", reason: `http_${response.status}` };
      body = await response.json();
    } catch {
      return { status: "failed", reason: "request_failed" };
    }
    const bytes = sumTransferBytes(body, projectId);
    return bytes === null ? { status: "failed", reason: "unexpected_response" } : { status: "ok", bytes };
  };
}

function sumTransferBytes(body: unknown, projectId: string): number | null {
  const projects = (body as { projects?: unknown })?.projects;
  if (!Array.isArray(projects)) return null;
  const project = projects.find((p) => (p as { project_id?: unknown })?.project_id === projectId);
  const periods = (project as { periods?: unknown } | undefined)?.periods;
  if (!Array.isArray(periods)) return null;
  let total = 0;
  let seen = false;
  for (const period of periods) {
    const consumption = (period as { consumption?: unknown })?.consumption;
    if (!Array.isArray(consumption)) continue;
    for (const entry of consumption) {
      const value = (entry as { data_transfer_bytes?: unknown })?.data_transfer_bytes;
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        total += value;
        seen = true;
      }
    }
  }
  return seen ? total : null;
}
