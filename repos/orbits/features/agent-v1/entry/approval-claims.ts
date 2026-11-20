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
 *
 * AG05 (AG04 coordinator review): only wording that explicitly means Orbit's confirmation card or a
 * button on a card. "生日卡片上写什么", "在报名页点确认", "确认邮件", "click Confirm on the RSVP page" are
 * ordinary discussion and are kept.
 */
const CARD_TALK = /(确认卡|確認卡|確認カード|confirmation card|卡片?上的?[^。！？!?\n]{0,6}确认|カード[^。！？!?\n]{0,6}(確認|確定|Confirm)|confirm(ation)? button on (the|this|a|your) card|(the|this|your) card'?s confirm)/iu;

/**
 * AG07 repair 2 (AE-XL-011): a model sentence about what Orbit saved, will save or cannot save ("I can't store notes
 * here, so this won't be saved", "已经帮你记下了", "保存できません"). What is written is said by code from the
 * frozen card; a model never says it, so such a sentence never contradicts the card it ships with. Sentences about
 * the user's own records ("You saved the draft on Nov 12", "没有记录显示…") are kept.
 * AG10 run-02 (AE-AMB-012): first-person claims anywhere in the sentence ("这件事我记下了", "帮你记了", "存好了") too — a card
 * offer or an entry is not a write.
 */
const SAVE_TALK = /(\b(?:I|I've|I have|I'll|I will|I can't|I cannot|we|Orbit)\b[^.!?\n]{0,30}\b(?:save|saved|store|stored|keep a record|log(?:ged)?|recorded|record (?:it|that|this|the)|note(?:d)? (?:it|that|this|down))\b|\b(?:can't|cannot|won't|will not|isn't|is not|wasn't|was not|nothing (?:is|was|will be))\b[^.!?\n]{0,20}\b(?:saved|stored|save|store)\b|(?:不能|无法|没法|不会|没办法)(?:帮你)?[^。！？\n]{0,6}(?:保存|存下|记下|存储|存起来)|已经?(?:帮你)?(?:保存|记下|存好|记好)|保存(?:でき|し)(?:ません|ない)|保存しました|記録しました|メモしました|メモしておきました|(?:^|[，,、：:；\s])(?:好的|嗯|收到)?[，,]?(?:我)?(?:已经?)?(?:帮你)?(?:记下了|记住了|记好了|已记录|记录下来了|存好了)|(?:我|俺)(?:已经?)?(?:帮你|替你|给你)?(?:记下了|记住了|记好了|记了|存好了|存下了|保存了|记录下来了)|(?:帮你|替你)(?:记了|记下了|记好了|存了|保存了)|(?:メモ|記録)して?おきます|控えておきます|覚えておきます|^\s*(?:(?:ok(?:ay)?|got it|sure|alright)[,.!\s—-]*)?noted\b|\bkeep (?:that|this|it) in mind\b)/iu;

/**
 * AG07 run-03 (AE-CTX-005): a short sentence that only introduces the next one (「お礼の前に一件だけ。」, "One more thing
 * first."); when the sentence it introduced is dropped, it goes too.
 */
const LEAD_IN_ONLY = /^[^。！？!?\n]{0,14}(?:一件だけ|ひとつだけ|一つだけ|一点だけ|その前に|ちなみに|念のため|もう一つ|one more thing|one thing first|before that|quick note|by the way|顺便说一句|先说一句|还有一件事|另外一点|提醒一下)[^。！？!?\n]{0,8}[。.!！:：]?\s*$/iu;

/** The text without its sentences about a confirmation card, and the sentences dropped. */
/**
 * AG12 run-02 (AE-CTX-005 R1): a request to confirm or say OK ("確定してよければ教えてください。", "确认的话告诉我一声。",
 * "Let me know if you want to confirm it.") refers to the card a dropped sentence spoke of; when one is dropped, these go
 * too. Without a dropped card sentence they are kept.
 */
const CONFIRM_REQUEST = /((?:确认|確定|确定|执行|没问题|可以)的话[^。！？!?\n]{0,10}(?:告诉我|说一声|跟我说|回复我|回我)|要不要(?:我)?(?:帮你)?确认|(?:確定|確認|実行)して(?:も)?(?:よければ|よろしければ|いい(?:か|場合|なら))|(?:よろしければ|よければ)[^。！？!?\n]{0,12}(?:教えて|お知らせ|お伝え)|\blet me know if (?:you(?:'d| would)? (?:want|like) (?:me )?to (?:confirm|go ahead|proceed)|(?:it's|that's|this is) (?:ok|okay|fine))|\bshall i (?:confirm|go ahead|proceed)\b|\bsay (?:the word|ok|yes) (?:and|if)\b)/iu;

export function stripCardTalk(text: string): { text: string; dropped: string[] } {
  const first = stripSentences(text, CARD_TALK);
  if (!first.dropped.length) return first;
  const second = stripSentences(first.text, CONFIRM_REQUEST);
  return { dropped: [...first.dropped, ...second.dropped], text: second.text };
}

/** The text without its sentences about what was or was not saved (AG07 repair 2), and the sentences dropped. */
export function stripSaveTalk(text: string): { text: string; dropped: string[] } {
  return stripSentences(text, SAVE_TALK);
}

function stripSentences(text: string, pattern: RegExp): { text: string; dropped: string[] } {
  const sentences = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const sentence of sentences) {
    // English sentences end with ". "; split them further so one card sentence does not take its neighbours.
    const parts = /[A-Za-z]/u.test(sentence) ? sentence.split(/(?<=\.)[ \t]+/u) : [sentence];
    for (const piece of parts) {
      if (pattern.test(piece)) {
        dropped.push(piece.trim());
        // Its lead-in goes with it (blank lines between them are kept as they are).
        const last = kept.length - 1;
        if (last >= 0 && kept[last].trim().length <= 30 && LEAD_IN_ONLY.test(kept[last].trim())) dropped.push(kept.splice(last, 1)[0].trim());
      } else kept.push(piece);
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
