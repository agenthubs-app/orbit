import type { ContactSyncPayload } from "../api/contract/contact-local-directory";
import type { NetworkAnalysisRow } from "../api/compute/network-analysis-model";
import { localContactDirectory } from "../api/schema/contact-local-directory";

function seniorityOf(detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail) return null;
  const direct = detail.seniorityLevel;
  if (typeof direct === "string") return direct;
  const contact = detail.contact;
  const nested = contact && typeof contact === "object" ? (contact as Record<string, unknown>).seniorityLevel : undefined;
  return typeof nested === "string" ? nested : null;
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
      primaryIndustryId: card.primaryIndustryId ?? null, city: card.region?.city ?? null, metKind: card.metKind ?? null,
      seniorityLevel: seniorityOf(row.detail as Record<string, unknown> | null), addedAt: card.addedAt ?? null,
      lastInteractionAt: card.lastInteractionAt ?? null, goalRelated: goal.has(card.id), needsFollowUp: followUp.has(card.id),
      nextActionPreview: card.nextActionPreview,
    }];
  });
}
