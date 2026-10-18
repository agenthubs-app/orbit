import type { AiPageContextContract } from "../../shared/contract/ai-sessions";
import { isIndustryIdCode } from "../../shared/domain/industries";

export class AiPageContextError extends Error {
  constructor(readonly code: "PAGE_CONTEXT_INVALID" | "PAGE_CONTEXT_STALE") { super(code); }
}

/** Validate the route and supported facets before any actor-scoped read. */
export async function authorizeAiPageContext(input: {
  actorId: string;
  proposed: unknown;
  countContacts: (actorId: string, filters: { industry: string[] }) => Promise<number>;
}): Promise<AiPageContextContract> {
  const invalid = () => { throw new AiPageContextError("PAGE_CONTEXT_INVALID"); };
  const proposed = input.proposed;
  if (!input.actorId.trim() || typeof proposed !== "object" || proposed === null || Array.isArray(proposed)) invalid();
  const value = proposed as Record<string, unknown>;
  if (value.route !== "/app/contacts" || !Number.isSafeInteger(value.count) ||
    Number(value.count) < 0 || Number(value.count) > 100_000 ||
    typeof value.filters !== "object" || value.filters === null || Array.isArray(value.filters)) invalid();
  const filters = value.filters as Record<string, unknown>;
  if (Object.keys(filters).some((key) => key !== "industry")) invalid();
  const rawIndustry = filters.industry ?? [];
  if (!Array.isArray(rawIndustry) || rawIndustry.length > 10 ||
    rawIndustry.some((item) => typeof item !== "string" || (!isIndustryIdCode(item) && item !== "none"))) invalid();
  const industry = [...new Set(rawIndustry as string[])].sort();
  const actualCount = await input.countContacts(input.actorId, { industry });
  if (actualCount !== value.count) throw new AiPageContextError("PAGE_CONTEXT_STALE");
  return { route: "/app/contacts", filters: { industry }, count: actualCount };
}
