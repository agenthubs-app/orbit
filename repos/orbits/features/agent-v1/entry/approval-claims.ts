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

/**
 * AG04 run-02 repair round 1: a model's words about a confirmation card. Only code may say how a card
 * is confirmed, and only when the turn shows one (the AG02 boundary); a model answer that talks about a
 * card the user cannot see misleads (AE-BND-008, AE-UND-002, AE-AMB-011). The answer step drops such
 * sentences when the turn has no card.
 */
const CARD_TALK = /(确认卡|確認卡|确认卡片|確認カード|確認ボタン|卡片上|卡上的|点(击|一下)?[「“"]?确认|按(下)?[「“"]?确认|カードの[「“"]?(確認|Confirm)|confirmation card|confirm button|press(es|ing)? ["“']?Confirm)/iu;

/** The text without its sentences about a confirmation card, and the sentences dropped. */
export function stripCardTalk(text: string): { text: string; dropped: string[] } {
  const sentences = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const sentence of sentences) {
    // English sentences end with ". "; split them further so one card sentence does not take its neighbours.
    const parts = /[A-Za-z]/u.test(sentence) ? sentence.split(/(?<=\.)\s+/u) : [sentence];
    for (const piece of parts) {
      if (CARD_TALK.test(piece)) dropped.push(piece.trim());
      else kept.push(piece);
    }
  }
  const joined = kept.map((piece, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(piece) ? ` ${piece}` : piece)).join("");
  return { dropped, text: joined.replace(/[ \t]+\n/gu, "\n").trim() };
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
