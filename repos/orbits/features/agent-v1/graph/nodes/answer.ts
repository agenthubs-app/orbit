/**
 * answer (main model): discussion answers without private material (agent-design AG03; answers that
 * cite records are AG05). When the first layer said plain chat and code agrees that every part is a
 * discussion, its reply is shown and no second call is made (设计稿 §3.3). Otherwise one call answers
 * the discussion parts (one repair if its output is unusable and the round has not repaired yet);
 * if the round's budget is used up they stay unfinished, saying why.
 */
import { datesIn, localizeAnswerDates, unsourcedDates, WEEKDAY_WORD, withoutUnsourcedDates } from "../../answer/dates";
import { numbersIn, seenAllowedBy, unsourcedCounts, withoutUnsourcedCounts, withoutWrongSeenCounts } from "../../answer/counts";
import { withoutOnly, withoutWrongDirection } from "../../answer/gap-copy";
import { localDayOf } from "../../propose/dates";
import { gapWords } from "../../answer/gap-copy";
import { formatWhen } from "../../answer/materials";
import { changeCheckNote, changeCheckOf, changeReasonLine, verifyChangeReasons, type ChangeReason } from "../../answer/change-check";
import { profileCheckNote, profileCheckOf, profileLine, verifyProfileUpdates, type ProfileUpdate } from "../../answer/profile-check";
import { groundedAnswerSystemPrompt, groundedAnswerUserText, GROUNDED_ANSWER_PROMPT_VERSION, type GroundedItem } from "../../answer/prompt";
import { parseAnswerOutput } from "../../answer/schema";
import { verifyCitations } from "../../answer/verify";
import { stripCardTalk, stripSaveTalk } from "../../entry/approval-claims";
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { settleDependencies } from "../../route/decide";
import { answerSystemPrompt, answerUserText } from "../../understand/prompt";
import { parseModelJson } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

/** run-03 repair 1: the reads that make a part a question about the person's profile. */
const PROFILE_CAPABILITIES = new Set<string>(["contact.read", "profile.read", "view.context"]);

type Segments ={ ok: true; segments: Map<string, string> } | { ok: false; error: string };

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

export function answerSegments(text: string, wanted: ReadonlySet<string>, dropCardTalk = false): Segments {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { error: parsed.error, ok: false };
  const segments = (parsed.value as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segments)) return { error: "segments must be a list", ok: false };
  const out = new Map<string, string>();
  const onlyCardTalk: string[] = [];
  for (const segment of segments) {
    const partId = typeof segment?.partId === "string" ? segment.partId : "";
    const raw = typeof segment?.text === "string" ? segment.text.trim() : "";
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
    const contacts = materials.length && asksProfile ? profileCheckOf(materials) : [];
    if (contacts.length) profileParts.set(part.localId, materials);
    // AG07 repair 2 (AE-SCL-006 R2): two dated records read, one speaking of a change: the answer names any
    // replacement in "changes", so code can state the newer record's reason.
    const changes = changeCheckOf(materials);
    if (changes) changeParts.set(part.localId, materials);
    return { constraints: source?.constraints ?? [], goal: source?.goal ?? quote, kind: materials.length ? "records" : "discussion", materials, notes: [...(run.readNotes.get(part.localId) ?? []), ...(contacts.length ? [profileCheckNote(contacts)] : []), ...(changes ? [changeCheckNote()] : [])], partId: part.localId, quote };
  });
  const allMaterials = [...new Map(items.flatMap((item) => item.materials).map((material) => [material.handle, material])).values()];
  const readParts = new Set(items.filter((item) => item.kind === "records").map((item) => item.partId));
  const wanted = new Set(items.map((item) => item.partId));
  const zone = state.timeZone || "Asia/Tokyo";
  const system = groundedAnswerSystemPrompt(state.language);
  const conversation = (run.context?.messages ?? []).map((message) => ({ role: message.role, text: message.text }));
  const user = groundedAnswerUserText({ conversation, items, message: input.message, timeZone: zone, today: formatWhen(state.asOf || deps.now(), zone) });
  emitTrace({ materials: allMaterials.map((material) => ({ handle: material.handle, partId: material.partId, ref: material.ref, sentences: material.sentences.length })), promptVersion: GROUNDED_ANSWER_PROMPT_VERSION, type: "answer.prompt" });
  const dateSources = [input.message, ...conversation.map((message) => message.text), ...dayWindow(state.asOf || deps.now(), zone), ...allMaterials.flatMap((material) => [material.header, ...material.sentences.map((sentence) => sentence.text)])];
  const weekdayNotes = allMaterials.filter((material) => material.sentences.some((sentence) => WEEKDAY_WORD.test(sentence.text)) && !material.sentences.some((sentence) => datesIn(sentence.text).size)).map((material) => material.header);
  const check = (text: string) => {
    const parsed = parseAnswerOutput(text);
    if (parsed.ok === false) return { changes: null, error: parsed.error, profiles: null, verification: null };
    const cleaned = { ...parsed.value, segments: parsed.value.segments.map((segment) => ({ ...segment, text: withoutCardTalk(segment.text, segment.partId, dropCardTalk) })) };
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
      const days = unsourcedDates(segment.text, dateSources, { weekdayNotes });
      if (days.length) verification.problems.push(`${partId}: the answer names ${days.join(", ")} (month-day), but no material, message or today's date gives it; say a day the way the material says it (e.g. "by Friday"), never as a date you worked out`);
    }
    return { changes, error: null, profiles, verification };
  };
  let repairs = state.repairs;
  let result: MainModelResult = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "first", requestId: input.requestId, system, user });
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
      const delivered = withoutWrongDirection(seen.text, direction);
      run.answers.set(part.localId, localizeAnswerDates(someUnread ? withoutOnly(delivered, state.language) : delivered, state.language));
      if (segment.cites.length) part.cites = segment.cites.map((cite) => cite.ref);
      if (profileParts.has(part.localId)) {
        const updates = checked?.profiles?.get(part.localId);
        if (!updates) emitTrace({ partId: part.localId, type: "answer.profile_check_missing" });
        const line = updates ? profileLine(state.language, updates, zone) : null;
        if (line && updates) {
          run.gapLines.set(part.localId, [line, ...(run.gapLines.get(part.localId) ?? [])]);
          part.cites = [...new Set([...(part.cites ?? []), ...updates.map((item) => item.source.ref)])];
          emitTrace({ fields: updates.map((item) => ({ contact: item.contact.ref, field: item.field, source: item.source.ref })), partId: part.localId, type: "answer.profile_outdated" });
        }
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

/** AG07 run-02: the days around today an answer may name without a record ("yesterday", "this Friday"), as "YYYY-MM-DD". */
function dayWindow(asOf: string, timeZone: string): string[] {
  const today = Date.parse(`${localDayOf(asOf, timeZone)}T00:00:00.000Z`);
  return Array.from({ length: 9 }, (_, index) => new Date(today + (index - 1) * 86_400_000).toISOString().slice(0, 10));
}

export function answerNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const resume = state.touched !== null;
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    // AG05: parts that read and have something to answer from (a click on a reading resumes into one).
    const reading = parts.filter((part) => part.route === "read" && part.status === "answered" && (run.materials.get(part.localId)?.length ?? 0) > 0 && (!resume || state.touched!.includes(part.localId)));
    // AG04: resuming a paused request makes no model call (§3.9) unless it now reads; its parts are written by code.
    if (resume && !reading.length) return {};
    const discussion = resume ? [] : parts.filter((part) => part.route === "answer" && part.status === "answered");
    if (reading.length) return groundedAnswer(scope, state, parts, [...discussion, ...reading]);
    const due = discussion;
    if (!due.length) return {};
    const dropCardTalk = !run.cardPrepared;
    if (state.plainChat && run.plainReply && parts.every((part) => part.route === "answer")) {
      const plain = withoutCardTalk(run.plainReply, due[0].localId, dropCardTalk);
      // AG08 (AE-UND-006): nothing was read, so a count of the user's records has no source unless the user said it.
      const plainCounts = plain ? unsourcedCounts(plain, numbersIn([input.message, ...(run.context?.messages ?? []).map((message) => message.text)])) : [];
      if (plainCounts.length) emitTrace({ counts: plainCounts, parts: due.map((part) => part.localId), type: "answer.unsourced_counts_dropped" });
      const reply = plain ? withoutUnsourcedCounts(plain, plainCounts) : plain;
      if (reply) {
        run.answers.set(due[0].localId, localizeAnswerDates(reply, state.language));
        emitTrace({ note: "plain chat: the first layer's reply is shown, no second call", parts: due.map((part) => part.localId), type: "answer.plain_reply" });
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
    const user = answerUserText({ conversation, items, message: input.message });
    let repairs = state.repairs;
    let result: MainModelResult = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "first", requestId: input.requestId, system, user });
    let checked: Segments | null = result.ok === true ? answerSegments(result.text, wanted, dropCardTalk) : null;
    if (checked && checked.ok === false && repairs < 1) {
      repairs += 1;
      emitTrace({ error: checked.error, type: "answer.invalid" });
      result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "answer", purpose: "repair", requestId: input.requestId, system, user: `${user}\n\nYour previous output could not be used (${checked.error}). Output the corrected JSON object only.` });
      checked = result.ok === true ? answerSegments(result.text, wanted, dropCardTalk) : null;
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
      const second = retry.ok === true ? answerSegments(retry.text, wanted, dropCardTalk) : null;
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
        run.answers.set(part.localId, localizeAnswerDates(seen.text, state.language));
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
