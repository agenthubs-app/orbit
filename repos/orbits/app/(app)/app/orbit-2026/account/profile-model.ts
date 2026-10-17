import type { ManualProfileUpdateInput, ProfileCompleteness } from "../../../../../features/profile/contract";
import { projectPublicProfile } from "../../../../../features/profile/public-projection";
import type { ManualProfileContract } from "../../../../../shared/contract/profile";

const cardKeys = ["companyRole", "offering", "seeking", "intro"] as const;
export type CardKey = (typeof cardKeys)[number];

export function cardProgress(completeness: ProfileCompleteness): { score: number; missing: CardKey[]; hasCard: boolean } {
  if (!completeness.card) return { score: completeness.score, missing: [], hasCard: false };
  const missing = cardKeys.filter(key => completeness.card?.items.some(item => item.key === key && !item.done));
  return { score: completeness.card.score, missing, hasCard: true };
}

export function previewForProfile(profile: ManualProfileContract) {
  return projectPublicProfile(profile);
}

export function profileSaveInput(profile: ManualProfileContract, edit: ManualProfileUpdateInput, mutationId: string): ManualProfileUpdateInput {
  return { ...edit, expectedUpdatedAt: profile.updatedAt, mutationId };
}
