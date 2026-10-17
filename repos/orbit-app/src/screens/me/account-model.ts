import type { ProfileCompletenessContract } from "../../api/contract/profile";

// The service owns scoring; old servers have no card-level missing-item list.
export function accountCardCompleteness(value: { score: number; card?: ProfileCompletenessContract["card"] }) {
  return value.card ?? { score: value.score, items: [] };
}
