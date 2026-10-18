import type { AiPageContextContract } from "../../../../../shared/contract/ai-sessions";
import { isIndustryIdCode } from "../../../../../shared/domain/industries";

/** Only the contact list's supported facet can be carried across navigation. */
export function contactPageContextSource(returnTo: string): string[] | null {
  if (!returnTo.startsWith("/app/contacts") || returnTo.startsWith("//")) return null;
  let url: URL;
  try { url = new URL(returnTo, "https://orbit.local"); } catch { return null; }
  if (url.origin !== "https://orbit.local" || url.pathname !== "/app/contacts" || url.hash) return null;
  if ([...url.searchParams.keys()].some((key) => key !== "industry")) return null;
  const industry = url.searchParams.getAll("industry");
  if (industry.length > 10 || industry.some((value) => !isIndustryIdCode(value) && value !== "none")) return null;
  return [...new Set(industry)].sort();
}

/** The server recomputes this count for the current actor before using it. */
export async function loadContactPageContext(
  industry: string[],
  request: typeof fetch = fetch,
): Promise<AiPageContextContract> {
  const params = new URLSearchParams();
  for (const value of industry) params.append("industry", value);
  const response = await request(`/api/contacts/summary${params.size ? `?${params}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("PAGE_CONTEXT_UNAVAILABLE");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("data" in body)) throw new Error("PAGE_CONTEXT_UNAVAILABLE");
  const data = (body as { data: unknown }).data;
  if (!data || typeof data !== "object" || !("total" in data)) throw new Error("PAGE_CONTEXT_UNAVAILABLE");
  const count = (data as { total: unknown }).total;
  if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > 100_000) throw new Error("PAGE_CONTEXT_UNAVAILABLE");
  return { route: "/app/contacts", filters: { industry }, count: Number(count) };
}
