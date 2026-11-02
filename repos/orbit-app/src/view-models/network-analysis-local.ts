import type { ContactSyncPayload } from "../api/contract/contact-local-directory";
import { analysisBucketKey, type NetworkAnalysisRow } from "../api/compute/network-analysis-model";
import type { NetworkAnalysisDistribution, NetworkAnalysisViewDTO } from "../api/contract/network-analysis-view";
import { localContactDirectory } from "../api/schema/contact-local-directory";

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" ? value as Record<string, unknown> : null);

function seniorityOf(detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail) return null;
  const direct = detail.seniorityLevel;
  if (typeof direct === "string") return direct;
  const contact = record(detail.contact);
  const nested = contact?.seniorityLevel;
  if (typeof nested === "string") return nested;
  // The detail read keeps it where the server stores it (contact.publicProfile.seniorityLevel, W0045).
  const profiled = record(contact?.publicProfile)?.seniorityLevel;
  return typeof profiled === "string" ? profiled : null;
}

function locationOf(detail: Record<string, unknown> | null | undefined): string | null {
  const location = record(detail?.contact)?.location;
  return typeof location === "string" ? location : null;
}

/**
 * LF3: the analysis rows from the device's contacts domain — the same projection as the server's
 * readNetworkAnalysisRows (the 人脈 list's cards with plan-related and follow-up merged, seniority from the
 * contact's detail), so shared/compute/network-analysis-model.ts gives the same view on both sides.
 */
export function localNetworkAnalysisRows(rows: readonly ContactSyncPayload[], merge: { goalIds: readonly string[]; followUpIds: readonly string[] }): NetworkAnalysisRow[] {
  const goal = new Set(merge.goalIds);
  const followUp = new Set(merge.followUpIds);
  return localContactDirectory(rows, { goalRelatedIds: merge.goalIds, followUpContactIds: merge.followUpIds }).flatMap((row) => {
    const card = row.card;
    if (!card) return [];
    return [{
      id: card.id, name: card.displayName, organization: card.organization, role: card.role, status: card.status,
      primaryIndustryId: card.primaryIndustryId ?? null, city: card.region?.city ?? null, location: locationOf(row.detail as Record<string, unknown> | null), countryCode: card.region?.countryCode ?? null, metKind: card.metKind ?? null,
      seniorityLevel: seniorityOf(row.detail as Record<string, unknown> | null), addedAt: card.addedAt ?? null,
      lastInteractionAt: card.lastInteractionAt ?? null, goalRelated: goal.has(card.id), needsFollowUp: followUp.has(card.id),
      nextActionPreview: card.nextActionPreview,
    }];
  });
}

/**
 * Sprint 0148: the App's analysis page shows the people without an industry / region as their own `none` bucket
 * (the home card's 未填写), instead of inside `rest`; `rest` keeps only the named groups after the top three.
 * The shared view folds every unset person into `rest`, so `rest` minus the unset count is exactly the named rest.
 * Lists opened from this view pass `unsetApart` so each list equals its row.
 */
export function withUnsetApart(view: NetworkAnalysisViewDTO, rows: readonly NetworkAnalysisRow[]): NetworkAnalysisViewDTO {
  if (!view.structure) return view;
  const split = (distribution: NetworkAnalysisDistribution, dimension: "industry" | "region"): NetworkAnalysisDistribution => {
    const unset = rows.filter((row) => analysisBucketKey(row, dimension) === "none").length;
    const rest = distribution.buckets.find((bucket) => bucket.id === "rest");
    if (!unset || !rest) return distribution;
    const namedRest = rest.count - unset;
    return { ...distribution, buckets: [...distribution.buckets.filter((bucket) => bucket.id !== "rest"), ...(namedRest > 0 ? [{ id: "rest", count: namedRest }] : []), { id: "none", count: unset }] };
  };
  const industries = split(view.structure.industries, "industry");
  const regions = split(view.structure.regions, "region");
  return industries === view.structure.industries && regions === view.structure.regions ? view : { ...view, structure: { ...view.structure, industries, regions } };
}
