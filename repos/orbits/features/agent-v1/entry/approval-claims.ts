/**
 * agent-design AG02 (PLANNER 易错边界 2): approval flags and account ids a model writes into its
 * output are never accepted. They are removed before validation and reported as one
 * `model.approval_claims_rejected` event; a card is approved only by the user's click and owned by
 * the account the server authenticated. Kept dependency-free so the model providers can use it.
 */
import { emitTrace } from "../observability/trace";

const CLAIM_KEYS = /^(approved|approval|isApproved|userApproved|confirmed|userConfirmed|preApproved|autoApprove|autoApproved|skipConfirmation|approvedBy|accountId|actorId|userId|ownerUserId|ownerId|workspaceId)$/u;

/** The value with approval flags and account ids removed, and the paths where they were. */
export function stripApprovalClaims(value: unknown, path = "$"): { value: unknown; found: string[] } {
  if (Array.isArray(value)) {
    const found: string[] = [];
    const items = value.map((item, index) => {
      const result = stripApprovalClaims(item, `${path}[${index}]`);
      found.push(...result.found);
      return result.value;
    });
    return { found, value: items };
  }
  if (value && typeof value === "object") {
    const found: string[] = [];
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (CLAIM_KEYS.test(key)) {
        found.push(`${path}.${key}`);
        continue;
      }
      const result = stripApprovalClaims(item, `${path}.${key}`);
      found.push(...result.found);
      out[key] = result.value;
    }
    return { found, value: out };
  }
  return { found: [], value };
}

/** Removes and reports approval claims in what a model produced. */
export function rejectModelApprovalClaims<T>(value: T, where: string): T {
  const { found, value: cleaned } = stripApprovalClaims(value);
  if (found.length) {
    emitTrace({
      found,
      note: "approval flags and account ids from a model are never accepted; a card is approved only by the user's click and owned by the authenticated account",
      type: "model.approval_claims_rejected",
      where,
    });
  }
  return cleaned as T;
}
