/**
 * answer (main model): discussion answers without private material (agent-design AG03; answers that
 * cite records are AG05). When the first layer said plain chat and code agrees that every part is a
 * discussion, its reply is shown and no second call is made (设计稿 §3.3). Otherwise one call answers
 * the discussion parts (one repair if its output is unusable and the round has not repaired yet);
 * if the round's budget is used up they stay unfinished, saying why.
 */
import { datesIn, localizeAnswerDates, unsourcedDates, WEEKDAY_WORD, withoutUnsourcedDates } from "../../answer/dates";
import { listedCountNote, numbersIn, seenAllowedBy, unsourcedCounts, withListedTotals, withoutPartialCounts, withoutUnsourcedCounts, withoutWrongSeenCounts, type ListedKind } from "../../answer/counts";
import { withoutOnly, withoutWrongDirection } from "../../answer/gap-copy";
import { localDayOf } from "../../propose/dates";
import { gapWords } from "../../answer/gap-copy";
import { formatWhen } from "../../answer/materials";
import { changeCheckNote, changeCheckOf, changeReasonLine, verifyChangeReasons, type ChangeReason } from "../../answer/change-check";
import { profileCheckNote, profileCheckOf, profileLine, verifyProfileUpdates, type ProfileUpdate } from "../../answer/profile-check";
import { groundedAnswerSystemPrompt, groundedAnswerUserText, GROUNDED_ANSWER_PROMPT_VERSION, type GroundedItem } from "../../answer/prompt";
import { parseAnswerOutput } from "../../answer/schema";
import { verifyCitations } from "../../answer/verify";
import { composeStructured, inListOrder, needsLayout, stripMarkdown, textBlocks, type AnswerBlock } from "../../answer/blocks";
import { lateCount, listAnswer } from "../../answer/list-answer";
import { asksBeyondListing, cardFactsOf, leftOver, textSaysMore, withCodeLateCount, withCodeLateness, withListedPointsTrimmed, withoutFieldLabels, withoutFalseReadClaims, withoutInternalWords } from "../../answer/list-or-text";
import { withoutUnsupportedEventClaims, type EventClaimFacts } from "../../answer/event-claims";
import type { AgentAnswerRecordContract } from "../../../../shared/contract/agent-v1";
import { statusSaidIn } from "./resolve";
import { withoutForeignUrls } from "../../web/answer-urls";
import { withoutAbilityDenials, withoutOnlineDenials, withoutQuoteResidue, withoutTopicBasisClaims, withoutStrayScripts, withoutUnsupportedStatus, withEffectiveDates } from "../../answer/claims";
import { expiryLine } from "../../answer/change-check";
import { stripCardTalk, stripSaveTalk } from "../../entry/approval-claims";
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { settleDependencies } from "../../route/decide";
import { answerSystemPrompt, answerUserText } from "../../understand/prompt";
import { parseModelJson } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";
import { withStandingRules } from "../../domains/memory/turn";
import { quoteSourceWords, untranslatedProblem, untranslatedSourceWords } from "../../answer/source-words";

/** AG19 repair round 1: deliverables whose answer is the list of records itself (a comparison is a discussion of them). */
const LIST_READS = new Set<string>(["list", "ranked_list"]);

/** run-03 repair 1: the reads that make a part a question about the person's profile. */
const PROFILE_CAPABILITIES = new Set<string>(["contact.read", "profile.read", "view.context"]);

type Segments ={ ok: true; segments: Map<string, string> } | { ok: false; error: string };

/**
 * AG10 opening items: a model sentence claiming a topic ranking this turn did not do (AG08 交接 1), or saying the agent
 * cannot go online at all (AG09 交接, AE-WEB-004), is not delivered. Code's own lines say what was and was not done.
 */
function withoutFalseClaims(text: string, partIds: readonly string[], topicMatched: boolean, materials: string): string {
  const basis = withoutTopicBasisClaims(text, topicMatched);
  if (basis.dropped.length) emitTrace({ dropped: basis.dropped, note: "a model sentence claiming a topic ranking this turn did not do is not delivered; code says what the ranking used", parts: partIds, type: "answer.basis_claims_dropped" });
  const online = withoutOnlineDenials(basis.text);
  if (online.dropped.length) emitTrace({ dropped: online.dropped, note: "Orbit can go online; a sentence saying it cannot is not delivered", parts: partIds, type: "answer.online_denial_dropped" });
  // AG20b (TRIAGE R4): a limit Orbit does not have ("I can't access your schedule", "do it in your calendar app").
  const able = withoutAbilityDenials(online.text);
  if (able.dropped.length) emitTrace({ dropped: able.dropped, note: "Orbit reads and changes these records; a sentence saying it cannot is not delivered", parts: partIds, type: "answer.ability_denial_dropped" });
  // AG10 run-03 (AE-CTX-005): words in a script the user did not write and no material holds.
  const scripts = withoutStrayScripts(able.text, materials);
  if (scripts.dropped.length) emitTrace({ dropped: scripts.dropped, note: "a sentence with words in a stray script that no record, page or message holds is not delivered", parts: partIds, type: "answer.stray_script_dropped" });
  // AG12 run-02 (AE-AMB-011): no empty or unbalanced quote is left on screen by the rules before.
  const quotes = withoutQuoteResidue(scripts.text);
  if (quotes !== scripts.text) emitTrace({ parts: partIds, type: "answer.quote_residue_cleaned" });
  return quotes;
}

/**
 * run-02 repair round 1: with no card in this turn, sentences about a confirmation card are dropped
 * (stripCardTalk, next to the approval-claim guard). An answer left empty by that is unusable: it gets
 * the round's one repair like any other unusable output.
 */
function withoutCardTalk(text: string, partId: string, enabled: boolean): string {
  // AG07 repair 2 (AE-XL-011): what is or is not saved is said by code from the card, never by a model sentence.
  const saved = stripSaveTalk(text);
  if (saved.dropped.length) emitTrace({ dropped: saved.dropped, note: "a model sentence about what is or is not saved is not delivered; code says it from the card", partId, type: "model.save_talk_dropped" });
  if (!enabled) return saved.text;
  const { dropped, text: kept } = stripCardTalk(saved.text);
  if (dropped.length) emitTrace({ dropped, note: "this turn shows no card; a model sentence about a confirmation card is not delivered", partId, type: "model.card_talk_dropped" });
  return kept;
}

/**
 * AG12 run-03 (coordinator, AE-FN-008): no strip rule leaves a part that cited this turn's records with nothing sourced. When
 * the rules took every sentence of an answer that cited records, the cited sentences themselves are given, under code's
 * plain lead-in (zh/ja/en) — never the model's words that were not delivered.
 */
export function citedFallback(language: "zh" | "ja" | "en", materials: readonly { handle: string; ref: string; sentences: readonly { id: number; text: string }[] }[], cites: readonly { sourceRef?: string; ref?: string; sentenceIds: readonly number[] }[]): string | null {
  const sentences = cites.flatMap((cite) => {
    const material = materials.find((item) => item.handle === cite.sourceRef || item.ref === cite.ref || item.ref === cite.sourceRef);
    return material ? material.sentences.filter((sentence) => cite.sentenceIds.includes(sentence.id)).map((sentence) => sentence.text.trim()) : [];
  }).filter(Boolean);
  const unique = [...new Set(sentences)];
  if (!unique.length) return null;
  if (language === "en") return `The record says: ${unique.join(" ")}`;
  if (language === "ja") return `記録にはこう書かれています：${unique.join("")}`;
  return `记录里写的是：${unique.join("")}`;
}

export function answerSegments(text: string, wanted: ReadonlySet<string>, dropCardTalk = false, language: "zh" | "ja" | "en" = "zh"): Segments {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { error: parsed.error, ok: false };
  const segments = (parsed.value as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segments)) return { error: "segments must be a list", ok: false };
  const out = new Map<string, string>();
  const onlyCardTalk: string[] = [];
  for (const segment of segments) {
    const partId = typeof segment?.partId === "string" ? segment.partId : "";
    // AG19 (D4): lead and body in code's line convention; an answer given as one text is kept whole, symbols out.
    const raw = segment && typeof segment === "object" ? composeStructured(segment as Record<string, unknown>, language) ?? "" : "";
    const answer = raw ? withoutCardTalk(raw, partId, dropCardTalk) : "";
    if (raw && !answer) onlyCardTalk.push(partId);
    if (wanted.has(partId) && answer) out.set(partId, answer);
  }
  const missing = [...wanted].filter((id) => !out.has(id));
  if (!missing.length) return { ok: true, segments: out };
  const cardOnly = missing.filter((id) => onlyCardTalk.includes(id));
  return { error: cardOnly.length ? `the answer for ${cardOnly.join(", ")} only talks about a confirmation card, and this turn shows none; answer the item itself` : `no answer text for ${missing.join(", ")}`, ok: false };
}

/**
 * AG05: when some due parts read records (resolve gave them materials), one call answers every due part
 * with the grounded prompt; the parts that read cite this turn's materials and verifyCitations() checks
 * them. Not compliant: one repair (inside the round's budget, shared with understand's), then what passed
 * is delivered and a records part without a valid citation is left unfinished, saying why.
 */
async function groundedAnswer(scope: NodeScope, state: AgentGraphState, parts: GraphPart[], due: GraphPart[]): Promise<Partial<AgentGraphState>> {
  const { deps, input, run } = scope;
  const budget = { ...state.budget };
  const dropCardTalk = !run.cardPrepared;
  const understood = run.understood;
  const profileParts = new Map<string, GroundedItem["materials"]>();
  const changeParts = new Map<string, GroundedItem["materials"]>();
  const items: GroundedItem[] = [...due].sort((left, right) => left.quote[0] - right.quote[0]).map((part) => {
    const source = understood?.parts.find((item) => item.localId === part.localId);
    const quote = input.message.slice(part.quote[0], part.quote[1]);
    const materials = [...(run.materials.get(part.localId) ?? []), ...part.dependsOn.flatMap((id) => run.materials.get(id) ?? [])];
    // run-03 repair 1 (AE-SCL-004 R2): a part about how a person stands now, or about their profile, where a
    // profile and a newer dated record were both read, must say in "profile" whether the profile still holds.
    const asksProfile = Boolean(part.plan.readFilter?.current) || part.plan.readFilter?.order === "both" || (part.capabilities.length > 0 && part.capabilities.every((capability) => PROFILE_CAPABILITIES.has(capability)));
    // AG09: the profile and change checks are about the user's records; a public web page takes part in neither.
    const recordMaterials = materials.filter((material) => material.kind !== "web");
    const contacts = recordMaterials.length && asksProfile ? profileCheckOf(recordMaterials) : [];
    if (contacts.length) profileParts.set(part.localId, recordMaterials);
    // AG07 repair 2 (AE-SCL-006 R2): two dated records read, one speaking of a change: the answer names any
    // replacement in "changes", so code can state the newer record's reason.
    const changes = changeCheckOf(recordMaterials);
    if (changes) changeParts.set(part.localId, recordMaterials);
    // Production 2026-11-23 (「你有16条待办」 above 20 cards): how many of each kind this part read, in code's numbers.
    const counted = countNoteOf(scope, part, state.language);
    return { constraints: source?.constraints ?? [], goal: source?.goal ?? quote, kind: materials.length ? "records" : "discussion", materials, notes: [...(run.readNotes.get(part.localId) ?? []), ...(counted ? [counted] : []), ...(contacts.length ? [profileCheckNote(contacts)] : []), ...(changes ? [changeCheckNote()] : [])], partId: part.localId, quote };
  });
  const allMaterials = [...new Map(items.flatMap((item) => item.materials).map((material) => [material.handle, material])).values()];
  const readParts = new Set(items.filter((item) => item.kind === "records").map((item) => item.partId));
  const wanted = new Set(items.map((item) => item.partId));
  const zone = state.timeZone || "Asia/Tokyo";
  // AG09: the web rules are added only when a public web page is among the materials (the prompt is unchanged otherwise).
  const hasWeb = allMaterials.some((material) => material.kind === "web");
  const system = groundedAnswerSystemPrompt(state.language, { web: hasWeb });
  const conversation = (run.context?.messages ?? []).map((message) => ({ role: message.role, text: message.text }));
  // AG14: the user's saved rules for every answer go with the request (a block after it; nothing else changes).
  const user = withStandingRules(groundedAnswerUserText({ conversation, items, message: input.message, timeZone: zone, today: formatWhen(state.asOf || deps.now(), zone) }), run.memory);
  emitTrace({ materials: allMaterials.map((material) => ({ handle: material.handle, partId: material.partId, ref: material.ref, sentences: material.sentences.length })), promptVersion: GROUNDED_ANSWER_PROMPT_VERSION, type: "answer.prompt" });
  const dateSources = [input.message, ...conversation.map((message) => message.text), ...dayWindow(state.asOf || deps.now(), zone), ...allMaterials.flatMap((material) => [material.header, ...material.sentences.map((sentence) => sentence.text)])];
  const weekdayNotes = allMaterials.filter((material) => material.sentences.some((sentence) => WEEKDAY_WORD.test(sentence.text)) && !material.sentences.some((sentence) => datesIn(sentence.text).size)).map((material) => material.header);
  // The records' free text, and the names and titles that stay as they are (code-written "Field: value" lines, headers,
  // the user's message) — for untranslatedSourceWords.
  const FIELD_LINE = /^(?!Notes:|The user wrote:)[A-Z][A-Za-z «»]+: /u;
  const sourceSentences = allMaterials.flatMap((material) => material.sentences.map((sentence) => sentence.text)).filter((sentence) => !FIELD_LINE.test(sentence));
  const sourceNames = [input.message, ...allMaterials.flatMap((material) => [material.header, ...material.sentences.map((sentence) => sentence.text).filter((sentence) => FIELD_LINE.test(sentence))])];
  const check = (text: string) => {
    const parsed = parseAnswerOutput(text, state.language);
    if (parsed.ok === false) return { changes: null, error: parsed.error, profiles: null, verification: null };
    const cleaned = { ...parsed.value, segments: parsed.value.segments.map((segment) => {
      const kept = withoutCardTalk(segment.text, segment.partId, dropCardTalk);
      // AG12 run-03: a cited answer the card-talk rule emptied gives its cited sentences instead.
      const fallback = !kept.trim() && segment.text.trim() && segment.cites.length ? citedFallback(state.language, allMaterials, segment.cites) : null;
      if (fallback) emitTrace({ partId: segment.partId, type: "answer.cited_fallback", where: "card_talk" });
      return { ...segment, text: fallback ?? kept };
    }) };
    const verification = verifyCitations(cleaned, { materials: allMaterials, readParts, wanted });
    const profiles = new Map<string, ProfileUpdate[]>();
    for (const [partId, materials] of profileParts) {
      const segment = cleaned.segments.find((item) => item.partId === partId);
      if (!segment || !verification.segments.has(partId)) continue;
      if (!segment.profile) {
        verification.problems.push(`${partId}: give "profile" — [] if the contact profile still holds, otherwise the entries the Profile check under ${partId} asks for`);
        continue;
      }
      const checkedProfile = verifyProfileUpdates(segment.profile, materials);
      verification.problems.push(...checkedProfile.problems.map((problem) => `${partId}: ${problem}`));
      profiles.set(partId, checkedProfile.updates);
    }
    const changes = new Map<string, ChangeReason[]>();
    for (const [partId, materials] of changeParts) {
      const segment = cleaned.segments.find((item) => item.partId === partId);
      if (!segment || !verification.segments.has(partId)) continue;
      if (!segment.changes) {
        verification.problems.push(`${partId}: give "changes" — [] if your answer says no newer material replaces an older one, otherwise the entries the Change check under ${partId} asks for`);
        continue;
      }
      const checkedChanges = verifyChangeReasons(segment.changes, materials);
      verification.problems.push(...checkedChanges.problems.map((problem) => `${partId}: ${problem}`));
      changes.set(partId, checkedChanges.changes);
    }
    // AG07 run-02 (AE-CTX-003): a calendar day the answer names must come from this turn; a note that says only
    // "by Friday" is not a source for a date. One repair; what still has no source is not delivered.
    for (const [partId, segment] of verification.segments) {
      // AG14 UI run (AE-REF-007 R2): a Japanese or English answer says the Chinese records' words in its own language.
      if (state.language !== "zh") {
        const kept = untranslatedSourceWords({ language: state.language, material: sourceSentences, names: sourceNames, text: segment.text });
        if (kept.length) verification.problems.push(untranslatedProblem(partId, kept, state.language));
      }
      const days = unsourcedDates(segment.text, dateSources, { weekdayNotes });
      if (days.length) verification.problems.push(`${partId}: the answer names ${days.join(", ")} (month-day), but no material, message or today's date gives it; say a day the way the material says it (e.g. "by Friday"), never as a date you worked out`);
    }
    return { changes, error: null, profiles, verification };
  };
  let repairs = state.repairs;
  let result: MainModelResult = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "first", requestId: input.requestId, system, user });
  // AG19 repair round 1 (stability run: a connection cut off mid-answer failed the whole follow-up): a failed call
  // (connection cut, timeout, 429, 5xx) gets the round's one second chance, inside the same budget — as understand's does.
  if (result.ok === false && result.reason === "model_error" && result.retryable && repairs < 1) {
    repairs += 1;
    emitTrace({ note: "the answer call failed in transit; one retry", requestId: input.requestId, type: "answer.retry" });
    result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "retry", requestId: input.requestId, system, user });
  }
  let checked = result.ok === true ? check(result.text) : null;
  const problemsOf = (value: typeof checked) => (value?.error ? [value.error] : value?.verification?.problems ?? []);
  if (checked && problemsOf(checked).length && repairs < 1) {
    repairs += 1;
    emitTrace({ problems: problemsOf(checked), type: "answer.invalid" });
    const retry = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "repair", requestId: input.requestId, system, user: `${user}\n\nYour previous output could not be used:\n${problemsOf(checked).map((problem) => `- ${problem}`).join("\n")}\nOutput the corrected JSON object only.` });
    if (retry.ok === true) {
      const second = check(retry.text);
      // Keep whichever verified more parts (the repair can only add).
      if ((second.verification?.segments.size ?? 0) >= (checked.verification?.segments.size ?? 0)) checked = second;
    }
    result = retry.ok === true ? retry : result;
  }
  const verification = checked?.verification ?? null;
  if (verification?.problems.length) emitTrace({ problems: verification.problems, type: "answer.citations_rejected" });
  // AG14 (AE-REF-007): what the one repair still carries of the Chinese records' words is delivered as a quote of the
  // record, never as the answer's own words.
  if (verification && state.language !== "zh") {
    for (const [partId, segment] of verification.segments) {
      const kept = untranslatedSourceWords({ language: state.language, material: sourceSentences, names: sourceNames, text: segment.text });
      if (!kept.length) continue;
      emitTrace({ partId, type: "answer.source_words_quoted", words: kept.length });
      verification.segments.set(partId, { ...segment, text: quoteSourceWords(segment.text, kept, state.language) });
    }
  }
  const words = gapWords(state.language);
  for (const part of due) {
    const segment = verification?.segments.get(part.localId);
    if (segment) {
      const unsourced = unsourcedDates(segment.text, dateSources, { weekdayNotes });
      if (unsourced.length) emitTrace({ days: unsourced, partId: part.localId, type: "answer.unsourced_dates_dropped" });
      // AG07 run-02 (AE-SCL-007): a partial read from one end; a sentence saying the other end may be missing is not delivered.
      const direction = part.coverage?.find((item) => item.total !== null && item.total > item.seen)?.direction ?? null;
      // AG07 run-03 (AE-RD-005): some records could not be read: what was read is not said to be "only" that.
      const someUnread = (part.gaps ?? []).some((gap) => gap === "partial" || gap === "unreadable" || gap === "service_error");
      // AG08 (AG07 交接 (a)): a count of records stated in the answer comes from this turn's read, or the sentence goes.
      const partMaterials = run.materials.get(part.localId) ?? [];
      const allowed = numbersIn(dateSources);
      allowed.add(partMaterials.length);
      for (const kind of new Set(partMaterials.map((material) => material.ref.split(":")[0]))) allowed.add(partMaterials.filter((material) => material.ref.startsWith(`${kind}:`)).length);
      for (const item of part.coverage ?? []) {
        allowed.add(item.seen);
        if (item.total !== null) allowed.add(item.total);
      }
      const uncounted = unsourcedCounts(segment.text, allowed);
      if (uncounted.length) emitTrace({ counts: uncounted, partId: part.localId, type: "answer.unsourced_counts_dropped" });
      // AG09 (AG08 交接 2, AE-SCL-008): a sentence saying how many were seen must agree with this turn's coverage record.
      const coverage = [part, ...parts.filter((other) => part.dependsOn.includes(other.localId))].flatMap((item) => item.coverage ?? []);
      const seen = withoutWrongSeenCounts(withoutUnsourcedCounts(withoutUnsourcedDates(segment.text, unsourced), uncounted), seenAllowedBy(coverage));
      if (seen.dropped.length) emitTrace({ coverage: coverage.map((item) => ({ kind: item.kind, seen: item.seen, total: item.total })), dropped: seen.dropped, partId: part.localId, type: "answer.seen_counts_dropped" });
      // AG09 (AG09-4): a sentence naming a web address that the user did not give and this request did not search or open is not delivered (a link a page asked to open).
      const linked = hasWeb ? withoutForeignUrls(seen.text, run.webUrls) : { dropped: [], text: seen.text };
      if (linked.dropped.length) emitTrace({ dropped: linked.dropped, partId: part.localId, type: "answer.foreign_urls_dropped" });
      const delivered = withoutWrongDirection(linked.text, direction);
      // AG09 run-02 (AE-RD-005): a partial read (records that could not be read, or a page whose total is unknown) does not
      // state an exact or total count ("有一次", "1回だけ", "only once"); a total the read itself gave may stay.
      const partialRead = someUnread || coverage.some((item) => !item.complete && item.total === null);
      // With records that could not be read, the read's own total counts only the readable ones: no total is known then.
      const knownTotals = new Set(someUnread ? [] : coverage.flatMap((item) => (item.total !== null ? [item.total] : [])));
      const counted = partialRead ? withoutPartialCounts(delivered, state.language, knownTotals) : { changed: [], text: delivered };
      if (counted.changed.length) emitTrace({ changed: counted.changed, partId: part.localId, type: "answer.partial_counts_neutralized" });
      // AG13 opening 2 (AE-FN-008): "这件事还待办" / "already done" / "cancelled" needs a record read this turn that says so.
      const statusSources = allMaterials.flatMap((material) => material.sentences.map((sentence) => sentence.text));
      const statused = withoutUnsupportedStatus(counted.text, statusSources);
      if (statused.dropped.length) emitTrace({ dropped: statused.dropped, note: "a status no record read this turn supports is not delivered", partId: part.localId, type: "answer.unsupported_status_dropped" });
      const dated = withEffectiveDates(statused.text, statusSources);
      if (dated.changed.length) emitTrace({ changed: dated.changed, partId: part.localId, type: "answer.effective_date" });
      // AG19 repair round 1 (judges, AE-ANS-003 R3): a comparative claim about the events read (shortest, cheapest, the
      // only one …) or "no price is given" must follow from their fields, or the sentence is not delivered.
      const eventsRead = [...new Set([...partMaterials, ...part.dependsOn.flatMap((id) => run.materials.get(id) ?? [])].map((material) => material.ref))].map((ref) => run.eventFacts.get(ref)).filter((facts): facts is EventClaimFacts => Boolean(facts));
      const eventChecked = withoutUnsupportedEventClaims(dated.text, eventsRead, zone);
      if (eventChecked.dropped.length) emitTrace({ dropped: eventChecked.dropped, events: eventsRead.length, note: "a statement about the events read that their fields do not support is not delivered", partId: part.localId, type: "answer.event_claims_dropped" });
      let claimed = withoutFalseClaims(eventChecked.text, [part.localId], run.topicMatched, user);
      // AG12 run-03 (AE-FN-008): the rules above left nothing of an answer that cited records: its cited sentences instead.
      if (!claimed.replace(/[\s。.、，,：:]/gu, "") && segment.text.trim() && segment.cites.length) {
        const fallback = citedFallback(state.language, allMaterials, segment.cites);
        if (fallback) {
          claimed = fallback;
          emitTrace({ partId: part.localId, type: "answer.cited_fallback", where: "delivery" });
        }
      }
      // Hotfix 2026-11-20 (AE-RD-012 turn 2): a count of the overdue to-dos read this turn is code's number (the cards mark them).
      const todoCards = (part.reads ?? []).map((read) => run.recordCards.get(read.ref)).filter((card): card is AgentAnswerRecordContract => card?.kind === "todo");
      const todoRead = (part.coverage ?? []).filter((item) => item.kind === "todo");
      if (todoCards.length && todoRead.length && todoRead.every((item) => item.complete)) {
        const recounted = withCodeLateCount(claimed, { dueLate: todoCards.filter((card) => card.subTone === "late").length, late: lateCount(todoCards, state.language) });
        if (recounted.changed.length) emitTrace({ changed: recounted.changed, partId: part.localId, type: "answer.late_count_corrected" });
        claimed = recounted.text;
      }
      // Hotfix 1c (AE-RD-012 turn 2): how late a to-do is, where the answer names it, is the card's (code's) figure.
      const lateness = withCodeLateness(claimed, todoCards);
      if (lateness.changed.length) emitTrace({ changed: lateness.changed, partId: part.localId, type: "answer.lateness_corrected" });
      claimed = lateness.text;
      // Hotfix 1c (AE-SCL-008): a material's English field label is not shown in a zh or ja answer; nor our words (材料, 我读到的).
      claimed = withoutInternalWords(withoutFieldLabels(claimed, state.language), state.language);
      // Hotfix 1c (AE-UND-015): "could not be read" must agree with this turn's coverage record.
      const readAllFine = (part.coverage ?? []).length > 0 && (part.coverage ?? []).every((item) => item.complete) && !someUnread;
      const readClaims = withoutFalseReadClaims(claimed, readAllFine);
      if (readClaims.dropped.length) emitTrace({ dropped: readClaims.dropped, partId: part.localId, type: "answer.false_read_claims_dropped" });
      if (readClaims.text.trim()) claimed = readClaims.text;
      run.answers.set(part.localId, localizeAnswerDates(someUnread ? withoutOnly(claimed, state.language) : claimed, state.language, state.asOf || deps.now()));
      run.modelAnswers.add(part.localId);
      // AG09: a web page is not a record of the user's: its citations stay out of the records' sourceRefs (the page is listed in the answer's web record).
      if (segment.cites.length) part.cites = segment.cites.map((cite) => cite.ref).filter((ref) => !ref.startsWith("web:"));
      // Hotfix 1c (AE-ANS-019 run-05: the model cited 3 of the 4 overdue to-dos read for "what to handle today"): such a part
      // shows every record it read, in the read's order after the ones the answer named.
      if (run.showAllRead.has(part.localId) && part.cites) {
        const read = (part.reads ?? []).map((item) => item.ref).filter((ref) => run.recordCards.has(ref));
        const added = read.filter((ref) => !part.cites!.includes(ref));
        if (added.length) {
          part.cites = [...part.cites, ...added];
          emitTrace({ added, partId: part.localId, type: "answer.all_read_shown" });
        }
      }
      // Production 2026-11-23 (「你有16条待办都还没完成」 above 20 cards): a total the model states for a kind of record is the
      // number of that kind's cards this part shows (or the read's own count); the sentence stays with code's number.
      if (run.modelAnswers.has(part.localId)) {
        const totals = withListedTotals(run.answers.get(part.localId) ?? "", listedTotalsOf(scope, part));
        if (totals.changed.length) {
          run.answers.set(part.localId, totals.text);
          emitTrace({ changed: totals.changed, partId: part.localId, type: "answer.listed_total_corrected" });
        }
      }
      // AG19 repair round 1 (decision 1, D1): a list-type read is written by code from the records the answer picked —
      // the lead says how many, of what kind and for which window, each record is its card and is not written out again.
      // The order is code's, not the one the model happened to cite them in: schedule items and events by their time,
      // to-dos by deadline then planned day, notes newest first (answer/blocks.ts inListOrder); otherwise the read's own.
      const readOrder = (part.reads ?? []).map((read) => read.ref);
      const inOrder = inListOrder([...new Set(part.cites ?? [])].map((ref) => ({ index: readOrder.indexOf(ref) < 0 ? Number.MAX_SAFE_INTEGER : readOrder.indexOf(ref), key: run.recordSort.get(ref) ?? "", kind: ref.slice(0, ref.indexOf(":")), ref }))).map((item) => item.ref);
      const listed = LIST_READS.has(part.plan.deliverable) && part.route === "read" ? inOrder.map((ref) => run.recordCards.get(ref)).filter((card): card is AgentAnswerRecordContract => Boolean(card)) : [];
      // Hotfix 2026-11-20 (answer/list-or-text.ts): only when the list says everything the model's answer said — the message
      // asks only which records there are, and nothing is left of the model's text beyond the cards and the records' fields.
      const listQuote = input.message.slice(part.quote[0], part.quote[1]);
      const facts = allMaterials.filter((material) => (part.cites ?? []).includes(material.ref)).flatMap((material) => cardFactsOf(material.sentences.map((sentence) => sentence.text)));
      const keepsText = listed.length > 0 && (asksBeyondListing(listQuote) || textSaysMore(segment.text, listed, facts));
      if (keepsText) emitTrace({ beyond: asksBeyondListing(listQuote), cards: listed.length, left: leftOver(segment.text, listed, facts).slice(0, 80), partId: part.localId, type: "answer.list_kept_text" });
      // Hotfix 1c (live, 「今天先处理哪些事？」 with 16 stale to-dos: all 16 in the text and on the cards): a kept text that walks
      // through more records than a list shows first keeps the past-deadline ones in its points; the rest are the cards.
      if (keepsText) {
        const trimmed = withListedPointsTrimmed(run.answers.get(part.localId) ?? "", listed, state.language);
        if (trimmed.dropped) {
          run.answers.set(part.localId, trimmed.text);
          emitTrace({ dropped: trimmed.dropped, partId: part.localId, type: "answer.points_left_to_cards" });
        }
      }
      if (listed.length && listed.length === new Set(part.cites ?? []).size && !keepsText) {
        const quote = input.message.slice(part.quote[0], part.quote[1]);
        // Hotfix 2026-11-20 (AE-SCL-008): the lead says how many match in all when the cards are only some of them.
        const todoCoverage = (part.coverage ?? []).filter((item) => item.kind === "todo");
        const total = todoCoverage.length && todoCoverage.every((item) => item.total !== null) ? todoCoverage.reduce((sum, item) => sum + (item.total ?? 0), 0) : null;
        const written = listAnswer({ cards: listed, from: part.plan.readFilter?.from, language: state.language, quote, status: part.plan.readFilter?.status === "open" || part.plan.readFilter?.status === "completed" ? part.plan.readFilter.status : statusSaidIn(quote), to: part.plan.readFilter?.to, total });
        run.answers.set(part.localId, written.text);
        run.answerBlocks.set(part.localId, written.blocks);
        run.modelAnswers.delete(part.localId);
        emitTrace({ cards: listed.length, partId: part.localId, type: "answer.list_by_code" });
      }
      if (profileParts.has(part.localId)) {
        const updates = checked?.profiles?.get(part.localId);
        if (!updates) emitTrace({ partId: part.localId, type: "answer.profile_check_missing" });
        const line = updates ? profileLine(state.language, updates, zone) : null;
        if (line && updates) {
          run.gapLines.set(part.localId, [line, ...(run.gapLines.get(part.localId) ?? [])]);
          part.cites = [...new Set([...(part.cites ?? []), ...updates.map((item) => item.source.ref)])];
          emitTrace({ fields: updates.map((item) => ({ contact: item.contact.ref, field: item.field, source: item.source.ref })), partId: part.localId, type: "answer.profile_outdated" });
          // AG20a (decision 2): kept for the next turn's "那把她的资料也更新了" (deliver writes them into the session state).
          const idOf = (ref: string) => ref.slice(ref.indexOf(":") + 1);
          for (const item of updates) run.staleProfiles.push({ at: item.source.at ?? "", contactId: idOf(item.contact.ref), field: item.field, name: run.readNames.get(idOf(item.contact.ref))?.name ?? "", sourceId: idOf(item.source.ref), sourceType: item.source.ref.slice(0, item.source.ref.indexOf(":")), value: item.newValue });
        }
      }
      // AG12 run-02 (AE-SCL-016 R2): a cited record that says an earlier value has expired — said by code when the answer does not.
      const cited = allMaterials.filter((material) => segment.cites.some((cite) => cite.ref === material.ref));
      const expired = expiryLine(state.language, cited, `${run.answers.get(part.localId) ?? ""}\n${(run.gapLines.get(part.localId) ?? []).join("\n")}`, zone);
      if (expired) {
        run.gapLines.set(part.localId, [...(run.gapLines.get(part.localId) ?? []), expired]);
        emitTrace({ partId: part.localId, records: cited.map((material) => material.ref), type: "answer.expiry_said" });
      }
      if (changeParts.has(part.localId)) {
        const changes = checked?.changes?.get(part.localId);
        if (!changes) emitTrace({ partId: part.localId, type: "answer.change_check_missing" });
        const line = changes ? changeReasonLine(state.language, changes, segment.text, zone) : null;
        if (line && changes) {
          run.gapLines.set(part.localId, [...(run.gapLines.get(part.localId) ?? []), line]);
          part.cites = [...new Set([...(part.cites ?? []), ...changes.filter((item) => item.reason).map((item) => item.source.ref)])];
          emitTrace({ changes: changes.map((item) => ({ older: item.older.ref, reason: Boolean(item.reason), source: item.source.ref })), partId: part.localId, type: "answer.change_reason" });
        }
      }
      continue;
    }
    const budgetOut = result.ok === false && result.reason === "budget";
    if (readParts.has(part.localId) && !budgetOut && result.ok === true) {
      // Nothing about the user's records goes out without a valid source.
      part.status = "unfinished";
      part.reason = "unverified";
      run.gapLines.set(part.localId, [...(run.gapLines.get(part.localId) ?? []).filter((line) => line !== words.fromNotes()), words.unverified(input.message.slice(part.quote[0], part.quote[1]))]);
      continue;
    }
    part.status = budgetOut ? "unfinished" : "failed";
    part.reason = budgetOut ? "budget" : result.ok === true ? "model_output_invalid" : "model_error";
  }
  settleDependencies(parts);
  return { budget, parts, repairs };
}

const LISTED_KINDS = new Set<string>(["todo", "schedule", "memo", "event", "contact"]);

/** Production 2026-11-23: per kind, how many records this part read (its own materials), the overdue ones, the read's total. */
function countNoteOf(scope: NodeScope, part: GraphPart, language: "zh" | "ja" | "en"): string | null {
  const refs = [...new Set((scope.run.materials.get(part.localId) ?? []).filter((material) => material.kind !== "web").map((material) => material.ref))];
  const kinds = [...new Set(refs.map((ref) => ref.slice(0, ref.indexOf(":"))))];
  return listedCountNote(kinds.map((kind) => {
    const mine = refs.filter((ref) => ref.startsWith(`${kind}:`));
    const cards = mine.map((ref) => scope.run.recordCards.get(ref)).filter((card): card is AgentAnswerRecordContract => Boolean(card));
    const coverage = (part.coverage ?? []).filter((item) => item.kind === kind);
    const total = coverage.length && coverage.every((item) => item.total !== null) ? coverage.reduce((sum, item) => sum + (item.total ?? 0), 0) : null;
    return { kind, late: kind === "todo" ? lateCount(cards, language) : 0, read: mine.length, total };
  }));
}

/** Production 2026-11-23: per kind, the cards this part shows (its citations) and the counts its read gave (seen, total). */
function listedTotalsOf(scope: NodeScope, part: GraphPart): Partial<Record<ListedKind, { listed: number; also: number[] }>> {
  const out: Partial<Record<ListedKind, { listed: number; also: number[] }>> = {};
  const cards = [...new Set(part.cites ?? [])].map((ref) => scope.run.recordCards.get(ref)).filter((card): card is AgentAnswerRecordContract => Boolean(card));
  for (const kind of new Set(cards.map((card) => card.kind))) {
    if (!LISTED_KINDS.has(kind)) continue;
    const also = (part.coverage ?? []).filter((item) => item.kind === kind).flatMap((item) => [item.seen, ...(item.total !== null ? [item.total] : [])]);
    out[kind as ListedKind] = { also, listed: cards.filter((card) => card.kind === kind).length };
  }
  return out;
}

/** A numbered line of a reply ("1. …", "2、…", "（3）…", "4) …"). */
const NUMBERED_LINE = /^\s*(?:\d{1,2}\s*[.．、)）]|[（(]\d{1,2}[)）])\s*/u;

/**
 * Hotfix 2026-11-20: the first layer's plain reply laid out by code from its own lines — numbered lines read as points, the
 * opening line is the conclusion when more follows. A reply whose lines give no structure is one paragraph.
 */
export function replyLayout(text: string, language: "zh" | "ja" | "en"): AnswerBlock[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const structured = lines.length > 1 && lines.filter((line) => NUMBERED_LINE.test(line) || /^\s*[・•●▪◦\-–—*+]\s*/u.test(line)).length >= 2;
  if (!structured) return [{ text, type: "paragraph" }];
  const blocks = textBlocks(lines.map((line) => line.replace(NUMBERED_LINE, "・")).join("\n"), language, { conclusion: true });
  return blocks.length > 1 ? blocks : [{ text, type: "paragraph" }];
}

/** AG07 run-02: the days around today an answer may name without a record ("yesterday", "this Friday"), as "YYYY-MM-DD". */
function dayWindow(asOf: string, timeZone: string): string[] {
  const today = Date.parse(`${localDayOf(asOf, timeZone)}T00:00:00.000Z`);
  return Array.from({ length: 9 }, (_, index) => new Date(today + (index - 1) * 86_400_000).toISOString().slice(0, 10));
}

/** AG21b (R36): words that ask for every record of a kind ("所有没完成的待办", "全部列出来", "すべて", "all my open to-dos"). */
const SHOW_ALL = /(全部|所有|全都|统统|一个不落|都列出来|都列一下|都给我看|すべて|全て|全部の|一覧|\ball (?:of )?(?:my|the)\b|\bevery\b|\beverything\b|\blist all\b|\bshow (?:me )?all\b)/iu;

export function asksForEverything(quote: string): boolean {
  return SHOW_ALL.test(quote);
}

/** AG21b (R36): a list read the user asked to see whole, every record read has its card, nothing asked beyond the list. */
function listsAllByCode(scope: NodeScope, part: GraphPart): boolean {
  const quote = scope.input.message.slice(part.quote[0], part.quote[1]);
  const materials = scope.run.materials.get(part.localId) ?? [];
  if (!LIST_READS.has(part.plan.deliverable) || part.route !== "read" || !asksForEverything(quote) || asksBeyondListing(quote) || part.dependsOn.length) return false;
  return materials.length > 0 && materials.every((material) => material.kind !== "web" && scope.run.recordCards.has(material.ref));
}

/** AG21b (R36): the listing written by code — every record read as its card, in list order; the lead counts them. */
function writeAllListed(scope: NodeScope, state: AgentGraphState, part: GraphPart): void {
  const { input, run } = scope;
  const quote = input.message.slice(part.quote[0], part.quote[1]);
  const readOrder = (part.reads ?? []).map((read) => read.ref);
  const refs = [...new Set((run.materials.get(part.localId) ?? []).map((material) => material.ref))];
  const ordered = inListOrder(refs.map((ref) => ({ index: readOrder.indexOf(ref) < 0 ? Number.MAX_SAFE_INTEGER : readOrder.indexOf(ref), key: run.recordSort.get(ref) ?? "", kind: ref.slice(0, ref.indexOf(":")), ref }))).map((item) => item.ref);
  const cards = ordered.map((ref) => run.recordCards.get(ref)).filter((card): card is AgentAnswerRecordContract => Boolean(card));
  const coverage = part.coverage ?? [];
  const total = coverage.length && coverage.every((item) => item.total !== null) ? coverage.reduce((sum, item) => sum + (item.total ?? 0), 0) : null;
  const status = part.plan.readFilter?.status === "open" || part.plan.readFilter?.status === "completed" ? part.plan.readFilter.status : statusSaidIn(quote);
  const written = listAnswer({ cards, from: part.plan.readFilter?.from, language: state.language, quote, status, to: part.plan.readFilter?.to, total });
  run.answers.set(part.localId, written.text);
  run.answerBlocks.set(part.localId, written.blocks);
  part.cites = ordered;
  emitTrace({ cards: cards.length, partId: part.localId, total, type: "answer.all_listed_by_code" });
}

export function answerNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const resume = state.touched !== null;
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    // AG05: parts that read and have something to answer from (a click on a reading resumes into one).
    const reading = parts.filter((part) => (part.route === "read" || part.route === "web_lookup") && part.status === "answered" && (run.materials.get(part.localId)?.length ?? 0) > 0 && (!resume || state.touched!.includes(part.localId)));
    // AG04: resuming a paused request makes no model call (§3.9) unless it now reads; its parts are written by code.
    if (resume && !reading.length) return {};
    // AG09: a part that only gave the web address another part reads (reason web_context) is not answered on its own.
    // AG20b (R4): a part code already answered (a write tag the review did not confirm) is not written again by a model.
    const discussion = resume ? [] : parts.filter((part) => part.route === "answer" && part.status === "answered" && part.reason !== "web_context" && !run.codeAnswers.has(part.localId));
    // AG21b (R36): "show me all …" is a listing of every record read: code writes it (the cards in order, the lead with the
    // count), no model call — a call given forty records to write out runs past its time limit, every time.
    const listedByCode = reading.filter((part) => listsAllByCode(scope, part));
    for (const part of listedByCode) writeAllListed(scope, state, part);
    const toWrite = reading.filter((part) => !listedByCode.includes(part));
    if (listedByCode.length && !toWrite.length && !discussion.length) return { parts };
    if (toWrite.length) return groundedAnswer(scope, state, parts, [...discussion, ...toWrite]);
    const due = discussion;
    if (!due.length) return {};
    const dropCardTalk = !run.cardPrepared;
    if (state.plainChat && run.plainReply && parts.every((part) => part.route === "answer")) {
      const plain = withoutCardTalk(run.plainReply, due[0].localId, dropCardTalk);
      // AG08 (AE-UND-006): nothing was read, so a count of the user's records has no source unless the user said it.
      const plainCounts = plain ? unsourcedCounts(plain, numbersIn([input.message, ...(run.context?.messages ?? []).map((message) => message.text)])) : [];
      if (plainCounts.length) emitTrace({ counts: plainCounts, parts: due.map((part) => part.localId), type: "answer.unsourced_counts_dropped" });
      const reply = plain ? withoutFalseClaims(withoutUnsourcedCounts(plain, plainCounts), due.map((part) => part.localId), run.topicMatched, [input.message, ...(run.context?.messages ?? []).map((message) => message.text)].join("\n")) : plain;
      // AG19 (D4): the first layer's reply is a model's text too: its Markdown symbols are taken out.
      const shown = reply ? stripMarkdown(localizeAnswerDates(withoutQuoteResidue(reply), state.language, state.asOf || deps.now()), state.language) : "";
      if (shown) {
        run.answers.set(due[0].localId, shown);
        run.modelAnswers.add(due[0].localId);
        // Hotfix 2026-11-20 (the AG19 decision: layout is code's, never a further model call; AE-UND-013 went to 5 calls): a reply
        // of more than two sentences is laid out by code from its own lines — an opening line, numbered or bulleted lines as
        // points (AE-ANS-007) — and one that has no such structure is one paragraph, as it is.
        const layout = due.length === 1 && needsLayout(shown, state.language) ? replyLayout(shown, state.language) : null;
        if (layout) run.answerBlocks.set(due[0].localId, layout);
        emitTrace({ note: "plain chat: the first layer's reply is shown, no second call", parts: due.map((part) => part.localId), ...(layout ? { layout: layout.map((block) => block.type) } : {}), type: "answer.plain_reply" });
        return {};
      }
      // Nothing left but card talk: the answer step writes it instead.
    }
    const budget = { ...state.budget };
    const understood = run.understood!;
    const items = due.map((part) => {
      const source = understood.parts.find((item) => item.localId === part.localId)!;
      return { constraints: source.constraints, goal: source.goal, partId: part.localId, quote: source.sourceQuote };
    });
    const wanted = new Set(items.map((item) => item.partId));
    const system = answerSystemPrompt(state.language);
    // §3.10: the same window the first layer saw — recent messages as text, long replies cut, none when idle.
    const conversation = (run.context?.messages ?? []).map((message) => ({ role: message.role, text: message.text }));
    // AG14: the user's saved rules for every answer go with the request (a block after it; nothing else changes).
    const user = withStandingRules(answerUserText({ conversation, items, message: input.message }), run.memory);
    let repairs = state.repairs;
    let result: MainModelResult = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "first", requestId: input.requestId, system, user });
    // AG19 repair round 1: the same one second chance for a call that failed in transit.
    if (result.ok === false && result.reason === "model_error" && result.retryable && repairs < 1) {
      repairs += 1;
      emitTrace({ note: "the answer call failed in transit; one retry", requestId: input.requestId, type: "answer.retry" });
      result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "retry", requestId: input.requestId, system, user });
    }
    let checked: Segments | null = result.ok === true ? answerSegments(result.text, wanted, dropCardTalk, state.language) : null;
    if (checked && checked.ok === false && repairs < 1) {
      repairs += 1;
      emitTrace({ error: checked.error, type: "answer.invalid" });
      result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "repair", requestId: input.requestId, system, user: `${user}\n\nYour previous output could not be used (${checked.error}). Output the corrected JSON object only.` });
      checked = result.ok === true ? answerSegments(result.text, wanted, dropCardTalk, state.language) : null;
    }
    // AG07 run-02 (AE-CTX-003): a discussion answer has no records; a calendar day it names must come from the
    // message, the conversation or today. One repair; a sentence still naming a day with no source is not delivered.
    const discussionSources = [input.message, ...conversation.map((message) => message.text), ...dayWindow(state.asOf || deps.now(), state.timeZone || "Asia/Tokyo")];
    const datesProblem = (value: Segments | null): string | null => {
      if (!value || value.ok === false) return null;
      const days = [...new Set([...value.segments.values()].flatMap((text) => unsourcedDates(text, discussionSources)))];
      return days.length ? `the answer names ${days.join(", ")} (month-day), but nothing in the message, the conversation or today's date gives it; do not work out dates — say them as they were said` : null;
    };
    const undated = datesProblem(checked);
    if (undated && repairs < 1) {
      repairs += 1;
      emitTrace({ error: undated, type: "answer.invalid" });
      const retry = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "repair", requestId: input.requestId, system, user: `${user}\n\nYour previous output could not be used (${undated}). Output the corrected JSON object only.` });
      const second = retry.ok === true ? answerSegments(retry.text, wanted, dropCardTalk, state.language) : null;
      if (retry.ok === true && second?.ok === true) {
        checked = second;
        result = retry;
      }
    }
    for (const part of due) {
      if (checked && checked.ok === true) {
        const text = checked.segments.get(part.localId)!;
        const unsourced = unsourcedDates(text, discussionSources);
        if (unsourced.length) emitTrace({ days: unsourced, partId: part.localId, type: "answer.unsourced_dates_dropped" });
        // AG08 (AG07 交接 (a), AE-UND-006): a discussion read nothing; a count of the user's records it states has no source.
        const uncounted = unsourcedCounts(text, numbersIn([input.message, ...conversation.map((message) => message.text)]));
        if (uncounted.length) emitTrace({ counts: uncounted, partId: part.localId, type: "answer.unsourced_counts_dropped" });
        // AG09 (AG08 交接 2): a discussion read nothing, so no sentence may say how many records it saw.
        const seen = withoutWrongSeenCounts(withoutUnsourcedCounts(withoutUnsourcedDates(text, unsourced), uncounted), new Set());
        if (seen.dropped.length) emitTrace({ coverage: [], dropped: seen.dropped, partId: part.localId, type: "answer.seen_counts_dropped" });
        run.answers.set(part.localId, localizeAnswerDates(withoutFalseClaims(seen.text, [part.localId], run.topicMatched, user), state.language, state.asOf || deps.now()));
        run.modelAnswers.add(part.localId);
        continue;
      }
      const budgetOut = result.ok === false && result.reason === "budget";
      part.status = budgetOut ? "unfinished" : "failed";
      part.reason = budgetOut ? "budget" : result.ok === true ? "model_output_invalid" : "model_error";
    }
    settleDependencies(parts);
    return { budget, parts, repairs };
  };
}
