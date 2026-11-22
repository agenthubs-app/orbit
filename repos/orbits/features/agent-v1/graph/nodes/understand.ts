/**
 * understand (main model): the first layer (设计稿附录 C). One call; if the output does not pass the
 * checks, one repair call that is told what was wrong (§3.3). Each call first checks the round's
 * budget (models/main.ts). Still invalid after the repair: nothing is made up, deliver says so.
 */
import { capabilityKind } from "../../route/capabilities";
import { formatWhen } from "../../answer/materials";
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { hypothesisOf, isPronounClue, negationIn, negationOf } from "../../route/decide";
import { replyLanguageOf } from "../../route/handoff-copy";
import { repairUserText, understandSystemPrompt, understandUserText, UNDERSTAND_PROMPT_VERSION } from "../../understand/prompt";
import { coverEverySentence } from "../../understand/cover";
import { describedObjectSpan, groupClue, INDEFINITE_PERSON, questionWordClue, subjectInsideRecord, timeWordClue } from "../../understand/described-clue";
import { refusedCreates, retractedWrites } from "../../understand/negated-writes";
import { followsShownList } from "../../understand/follow-list";
import { asksTodaysPlate, dayOfWords, onlyWindowWords, ownWindow, plateFilter, swapsPeriod } from "../../understand/read-window";
import { localDayOf } from "../../propose/dates";
import { asksAgainAbout, bindMarkedReferences } from "../../references/marks";
import { recordKindOf } from "../../clarify/default-readings";
import type { UnderstandOutput } from "../../understand/schema";
import { parseModelJson, validateUnderstandOutput, type UnderstandValidationInput } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";
import { standingRuleNotes } from "../../domains/memory/turn";
import { mergePickIntoQuestion, recommendIsRanking } from "../../understand/merge-pick";
import { keepsLookingAt, keepsLookingIn } from "../../rule/parse";
import { PICK_WORDS } from "../../functions/basis";
import { roleGroupClue } from "../../understand/role-words";
import { conversationTurn, logOf } from "../../conversation/run";
import { conversationMode, openedMode } from "../../conversation/mode";
import { awaitWorldRead, needsWorldRead, startWorldRead } from "../../conversation/world-read";

/** "你", "我", "you", "me": the two people talking, never a contact to look up. */
const SPEAKER_WORDS = /^(?:你|您|我|咱们?|我们|你们|あなた|私|僕|you|me|i|we|us)$/iu;
/** The user alone ("我", "me", "myself"): never a contact to look up. "we" is not here — it can stand for a person named before it. */
const SELF_WORDS = /^(?:我|我自己|自己|本人|私|僕|自分|me|myself|i)$/iu;

function graphPartsOf(output: UnderstandOutput, scope: NodeScope, today: string): GraphPart[] {
  const context = scope.run.context!;
  const message = scope.input.message;
  // AG13 opening 3 (AE-RD-003): parts whose only contact clue is a word of time ("当时说了什么？"); they take the object of the
  // part before them in the same message.
  const timeClued = new Set<string>();
  const parts = output.parts.map((part) => {
    const start = message.indexOf(part.sourceQuote);
    const continued = part.continues ? context.openItemHandles.get(part.continues.ref) ?? null : null;
    // AG13 (AE-SCL-025): a part that only reads and names a schedule item reads schedule items too
    // ("明天这场周会关联了哪些人" tagged event.read only).
    const readsOnly = part.requiredCapabilities.length > 0 && part.requiredCapabilities.every((capability) => capabilityKind(capability) !== "write");
    // Release-2 gate 2 (AE-ANS-024, AE-ANS-026): someone not named ("回看与某位人脉的讨论", "Review a discussion with a contact")
    // is a person asked for and not said — the read asks which contact (gap-copy noContact). Not a reason to give up on
    // the whole message ("没看懂" with the words used as a name), nor to read every note without a person.
    const indefinite = readsOnly ? INDEFINITE_PERSON.exec(part.sourceQuote) : null;
    if (indefinite && !part.objectClues.some((clue) => clue.entity === "contact" && (clue.referenceId || !groupClue(clue)) && !INDEFINITE_PERSON.test(clue.text))) {
      part.objectClues = [...part.objectClues.filter((clue) => !(clue.entity === "contact" && INDEFINITE_PERSON.test(clue.text))), { entity: "contact", text: indefinite[0] } as (typeof part.objectClues)[number]];
      if (part.clarity === "none") part.clarity = "missing_one";
      emitTrace({ clue: indefinite[0], partId: part.localId, type: "understand.unnamed_person" });
    }
    // A meeting the user calls an event ("明天这场周会" tagged event) is one of their own schedule items too.
    const MEETING = /(周会|例会|会议|开会|定例|打ち合わせ|ミーティング|\bmeeting\b|\bstand-?up\b)/iu;
    const implied = readsOnly ? part.objectClues.flatMap((clue) => ((clue.entity === "schedule" || (clue.entity === "event" && MEETING.test(clue.text))) && !part.requiredCapabilities.includes("schedule.read" as never) ? ["schedule.read"] : [])) : [];
    if (implied.length) emitTrace({ added: [...new Set(implied)], partId: part.localId, type: "understand.read_implied_by_clue" });
    // AG13 repair round 7 (AE-UND-003): a create the user refuses in the same clause ("don't add anything to my to-dos")
    // is dropped before routing, so the refused part never proposes it.
    // AG20a R16 (TP-UND-005): a change taken back later in the same sentence ("…改到周五——算了不改了") is dropped the same way.
    const retracted = retractedWrites(part.sourceQuote, part.requiredCapabilities);
    if (retracted.length) emitTrace({ dropped: retracted, partId: part.localId, type: "understand.retracted_write" });
    const refusedCreate = refusedCreates(part.sourceQuote, part.requiredCapabilities);
    if (refusedCreate.length) emitTrace({ dropped: refusedCreate, partId: part.localId, type: "understand.refused_create" });
    const refused = [...refusedCreate, ...retracted];
    // Hotfix 2026-11-20 (understand/read-window.ts): a window comes from this message, never carried from an earlier turn
    // the message does not go on from; "what to handle today" is the open to-dos up to today (overdue included).
    const own = part.readFilter ? ownWindow(part.readFilter, message) : null;
    if (own?.dropped) emitTrace({ dropped: { from: part.readFilter!.from ?? null, to: part.readFilter!.to ?? null }, partId: part.localId, type: "understand.window_not_inherited" });
    const namesPerson = part.objectClues.some((clue) => clue.entity === "contact" && !clue.referenceId && !SPEAKER_WORDS.test(clue.text.trim()) && !questionWordClue(clue) && !groupClue(clue));
    const plate = readsOnly && !namesPerson && !part.readFilter?.text && part.requiredCapabilities.some((capability) => capability === "todo.read" || capability === "schedule.read") && asksTodaysPlate(part.sourceQuote);
    if (plate) emitTrace({ partId: part.localId, today, type: "understand.todays_plate" });
    // Hotfix 1c (AE-ENT-005): words of only a date, a time of day and a kind of record are a window, never search words —
    // in readFilter.text or as a record clue; with no window of the first layer's, they give the day.
    let windowed = own?.filter;
    const windowText = [windowed?.text, ...part.objectClues.filter((clue) => !clue.referenceId).map((clue) => clue.text)].find((words) => onlyWindowWords(words));
    if (windowText) {
      const day = dayOfWords(windowText, today);
      const { text: textWords, ...rest } = windowed ?? {};
      windowed = { ...rest, ...(textWords && !onlyWindowWords(textWords) ? { text: textWords } : {}), ...(day && !rest.from && !rest.to ? { from: day, to: day } : {}) };
      emitTrace({ day, partId: part.localId, type: "understand.window_words_not_text" });
    }
    // Hotfix 1c (live, 「那这周呢？」): a follow-up that only swaps the period is the question just answered with the new window —
    // no reading to choose; after "what to handle today" it is that question for the new window.
    const previousAsk = [...context.messages].reverse().find((item) => item.role === "user")?.text;
    const swapped = Boolean(previousAsk) && swapsPeriod(message);
    const swappedPlate = swapped && !namesPerson && asksTodaysPlate(previousAsk!);
    if (swapped) emitTrace({ partId: part.localId, plate: swappedPlate, type: "understand.period_swapped" });
    const readFilter = plate ? plateFilter(windowed, today) : swappedPlate ? plateFilter(windowed, windowed?.to ?? today) : windowed;
    return {
      asked: 0,
      capabilities: (swappedPlate ? ["todo.read", "schedule.read"] : [...new Set([...part.requiredCapabilities, ...implied])].filter((capability) => !refused.includes(capability))) as typeof part.requiredCapabilities,
      continues: part.continues && continued ? { kind: part.continues.kind, ref: continued.ref } : null,
      dependsOn: [...part.dependsOn],
      localId: part.localId,
      origin: null,
      plan: {
        clarity: swapped ? "clear" : part.clarity,
        dataOwner: part.dataOwner,
        dataSources: [...part.dataSources],
        deliverable: swappedPlate ? "list" : part.deliverable,
        hypothesis: hypothesisOf(part),
        intentBasis: part.intentBasis,
        // AG09 run-04 repair 2 (AE-JDG-007): a negation counts only when the user's own message carries one; a note the model
        // wrote around the user's words ("（假设，先不要真的改）") does not make one.
        negation: (negationOf(part) && negationIn(message)) || retracted.length > 0,
        persistence: part.persistence,
        readings: (swapped ? [] : part.readings ?? []).map((reading) => ({ capabilities: [...reading.capabilities], deliverable: reading.deliverable })),
        // The checkpoint keeps the words as offsets into this turn's message, never the words.
        ...(readFilter ? { readFilter: { ...readFilter, text: readFilter.text && message.includes(readFilter.text) ? [message.indexOf(readFilter.text), message.indexOf(readFilter.text) + readFilter.text.length] as [number, number] : undefined } } : {}),
        // AG08: the rank words as offsets too.
        ...(part.rank ? { rank: { ...part.rank, basis: spanOf(message, part.rank.basis), within: spanOf(message, part.rank.within) } } : {}),
        // AG09: what a web.search part looks up, the words as offsets too.
        ...(part.webTarget ? { webTarget: { qualifiers: [...part.webTarget.qualifiers], quote: spanOf(message, part.webTarget.quote) } } : {}),
      },
      quote: [start, start + part.sourceQuote.length],
      reading: null,
      reason: null,
      // AG12 run-03 (AE-WEB-004): an unnamed "那家公司" beside a clue naming a record is the subject inside that record.
      refs: part.objectClues.filter((clue) => {
        // AG19 repair round 1 (stability run, AE-ANS-002): "最近有哪些活动适合我" came back with a contact clue "我" and
        // was answered "我不确定你说的是哪一位联系人". The user alone (我、me、myself) is never a contact to look up.
        if (!clue.referenceId && clue.entity === "contact" && SELF_WORDS.test(clue.text.trim())) {
          emitTrace({ clue: clue.text, partId: part.localId, type: "understand.speaker_clue" });
          return false;
        }
        if (!clue.referenceId && timeWordClue(clue)) {
          timeClued.add(part.localId);
          emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.time_word_clue" });
          return false;
        }
        // AG13 (AE-EVT-010): "老周" inside 「联系老周聊独立出版」这条待办 is words of the to-do's title, not a person to look up.
        const writes = part.requiredCapabilities.some((capability) => capabilityKind(capability) === "write");
        // AG13 rerun of AG08 (AE-SCL-013): "东京做零售的联系人" describes the contacts to choose among, not one person.
        // AG13 gate run-04 (AE-SCL-025): "哪些人" is what the question asks for, not a person to look up.
        if (!clue.referenceId && !writes && questionWordClue(clue)) {
          emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.question_word_clue" });
          return false;
        }
        if (!clue.referenceId && !writes && groupClue(clue)) {
          emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.group_clue" });
          return false;
        }
        // Integration (coordinator, 2026-11-21): in a pick ("帮我挑两位最值得联系的摄影师"), people described by their profession
        // or role are the set to pick from — a ranking over the contacts — never one person to look up.
        if (!clue.referenceId && !writes && clue.entity === "contact" && roleGroupClue(clue.text) && (part.requiredCapabilities.includes("fn.rank" as never) || PICK_WORDS.test(part.sourceQuote))) {
          emitTrace({ clue: clue.text, partId: part.localId, type: "understand.role_clue" });
          return false;
        }
        // Only a title the user quoted counts ("「联系老周聊独立出版」这条待办"); "上次和小林聊了什么" names 小林 the person.
        const quotedTitles = (text: string) => [...text.matchAll(/[「『"“]([^」』"”]+)[」』"”]/gu)].map((match) => match[1]);
        if (!clue.referenceId && !writes && clue.entity === "contact" && part.objectClues.some((other) => other !== clue && other.entity !== "contact" && quotedTitles(other.text).some((title) => title.includes(clue.text) && title !== clue.text))) {
          emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.name_inside_title" });
          return false;
        }
        if (clue.referenceId || !subjectInsideRecord(clue, part.objectClues, writes)) return true;
        emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.subject_in_record" });
        return false;
      }).map((clue, _index, kept) => {
        // AG21a (R40): the same words twice ("把 @季朗 的待办和 @季朗 的笔记对一下") are two places of the message: the second
        // clue with those words is the second occurrence, so each keeps its own half of the sentence.
        const before = kept.slice(0, kept.indexOf(clue)).filter((other) => other.text === clue.text).length;
        let at = message.indexOf(clue.text);
        for (let count = 0; count < before && at >= 0; count += 1) {
          const next = message.indexOf(clue.text, at + clue.text.length);
          if (next < 0) break;
          at = next;
        }
        const own: [number, number] | null = at >= 0 ? [at, at + clue.text.length] : null;
        // AG09 run-03 (AE-BND-006): a demonstrative the user described just before ("约山本吃饭这条待办") is looked up by
        // those words; the clue then names the record and is not a missing object.
        const described = clue.referenceId ? null : describedObjectSpan(message, own, [start, start + part.sourceQuote.length], clue.text);
        if (described) emitTrace({ clue: clue.text, described: message.slice(described[0], described[1]), entity: clue.entity, partId: part.localId, type: "understand.described_clue" });
        return { entity: clue.entity, quote: described ?? own, recordId: clue.referenceId ? context.handles.get(clue.referenceId)?.id ?? null : null };
      }),
      route: null,
      status: "unfinished",
      step: null,
      verdict: null,
      waitReason: null,
    } satisfies GraphPart;
  });
  for (const part of parts) {
    if (!timeClued.has(part.localId) || part.refs.some((ref) => ref.entity === "contact")) continue;
    const earlier = parts.filter((other) => other !== part && other.quote[0] >= 0 && other.quote[0] < part.quote[0] && other.refs.some((ref) => ref.entity === "contact"));
    const before = earlier.find((other) => part.dependsOn.includes(other.localId)) ?? earlier.sort((left, right) => right.quote[0] - left.quote[0])[0];
    if (!before) continue;
    part.refs = [...part.refs, ...before.refs.filter((ref) => ref.entity === "contact").map((ref) => ({ ...ref }))];
    emitTrace({ from: before.localId, partId: part.localId, type: "understand.time_word_clue_attached" });
  }
  // AG11 (§3.6, AG11-2): a marker the user picked is that record, bound by code where it sits (references/marks.ts).
  for (const part of parts) {
    const { bound, refs } = bindMarkedReferences({
      make: (entity, recordId, quote) => ({ entity, quote, recordId }),
      message,
      part: part.quote,
      references: scope.run.references,
      refs: part.refs,
    });
    if (!bound.length) continue;
    part.refs = refs as typeof part.refs;
    emitTrace({ bound, partId: part.localId, type: "understand.marked_reference_bound" });
  }
  // AG11 (AE-SCL-021): 「那 @X 呢？」 asks the previous question again about the record picked now — read that record and
  // answer that question (code carries the question to the answer step), never a guessed other reading.
  const marks = scope.run.references.flatMap((reference) => reference.marks ?? []);
  const previous = [...context.messages].reverse().find((item) => item.role === "user")?.text;
  if (parts.length === 1 && previous && asksAgainAbout(message, marks)) {
    const [part] = parts;
    const kinds = [...new Set(scope.run.references.filter((reference) => reference.marks?.length && reference.accessible !== false).map((reference) => recordKindOf(reference.type)).filter(Boolean))];
    const reads = kinds.map((kind) => `${kind}.read`) as typeof part.capabilities;
    if (reads.length) {
      part.plan = { ...part.plan, clarity: "clear", deliverable: "answer", readings: [] };
      part.capabilities = reads;
      scope.run.carriedQuestions.set(part.localId, previous);
      emitTrace({ capabilities: reads, partId: part.localId, type: "understand.asks_again_about_picked" });
    }
  }
  // AG21a (coordinator's decision 2): "先帮我找…，再一直帮我留意…" asks for both. The search is answered now (the part keeps
  // its reads, for this turn only); the keep-looking words go to the scheduled-task path as a part of their own (rule.create:
  // AG15's card, or its question for when to run) — never only an offer to be accepted first.
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.plan.negation || part.plan.hypothesis || part.capabilities.some((capability) => capabilityKind(capability) === "write" && !capability.startsWith("rule."))) continue;
    const quote = message.slice(part.quote[0], part.quote[1]);
    const at = keepsLookingAt(quote);
    const reads = part.capabilities.filter((capability) => !capability.startsWith("rule."));
    if (at !== null) {
      const splitAt = part.quote[0] + at;
      let end = splitAt;
      while (end > part.quote[0] && /[\s，,。；;、]/u.test(message[end - 1])) end -= 1;
      const now: GraphPart = { ...part, capabilities: reads, plan: { ...part.plan, persistence: "this_turn" }, quote: [part.quote[0], end], refs: part.refs.filter((ref) => !ref.quote || ref.quote[0] < splitAt) };
      const keep: GraphPart = { ...part, capabilities: [...new Set([...reads, "rule.create"])] as GraphPart["capabilities"], dependsOn: [], localId: `${part.localId}k`, plan: { ...part.plan, persistence: "this_turn", readings: [] }, quote: [splitAt, part.quote[1]], refs: part.refs.map((ref) => ({ ...ref })) };
      (parts as GraphPart[]).splice(index, 1, now, keep);
      index += 1;
      emitTrace({ keep: keep.localId, now: [now.quote[0], now.quote[1]], partId: part.localId, type: "understand.find_now_and_keep_looking" });
      continue;
    }
    const findsBefore = parts.some((other) => other !== part && other.quote[1] <= part.quote[0] && other.capabilities.some((capability) => capabilityKind(capability) !== "write"));
    if (findsBefore && keepsLookingIn(quote) && (part.plan.persistence === "until_satisfied" || part.capabilities.some((capability) => capability.startsWith("rule.")))) {
      part.plan = { ...part.plan, persistence: "this_turn", readings: [] };
      part.capabilities = [...new Set([...reads, "rule.create"])] as GraphPart["capabilities"];
      emitTrace({ partId: part.localId, type: "understand.keep_looking_is_a_task" });
    }
  }
  // AG14 dev run 1 (AE-FN-002): a pick with no set of its own ("帮我挑两场") is one ranking with the question before it.
  const picks = mergePickIntoQuestion(parts, message);
  for (const item of picks.merged) emitTrace({ into: item.into, partId: item.pick, type: "understand.pick_merged_into_question" });
  // AG14 dev run 2 (AE-MEM-002): asking which events are recommended is a ranking, also when it came tagged as a plain read.
  for (const partId of recommendIsRanking(picks.parts, message)) emitTrace({ partId, type: "understand.recommend_is_ranking" });
  return picks.parts;
}

/**
 * AG19-6 (understand/follow-list.ts): a question right after a list is one question about that list. The parts the first
 * layer made of it (split at the question marks, one a search of the directory, one waiting for it, one a person to find)
 * are replaced by one part over the whole message that reads the listed records again by id; the answer step answers
 * from them. Returns the new part and first-layer output, or null when the rule does not hold.
 */
export function continueShownList(output: UnderstandOutput, parts: GraphPart[], scope: NodeScope): { output: UnderstandOutput; parts: GraphPart[] } | null {
  const context = scope.run.context;
  const message = scope.input.message;
  if (!context || output.plainChat && !parts.length) return null;
  const shown = context.shownList.filter((item) => item.accessible !== false);
  const listIds = new Set(shown.map((item) => item.id));
  const writesOrContinues = parts.some((item) => item.continues !== null || item.capabilities.some((capability) => capabilityKind(capability) === "write"));
  const namesPerson = output.parts.some((item) => item.objectClues.some((clue) => clue.entity === "contact" && !clue.referenceId && !questionWordClue(clue) && !groupClue(clue) && !isPronounClue(clue.text) && !SPEAKER_WORDS.test(clue.text.trim())));
  const kind = followsShownList({ hasReferences: scope.run.references.length > 0, message, namesPerson, shown, writesOrContinues });
  if (!kind) return null;
  // One part that already points at the list's records (the first layer read it that way) is left as it is.
  if (parts.length === 1 && parts[0].refs.some((ref) => ref.recordId && listIds.has(ref.recordId))) return null;
  const template = parts[0];
  if (!template) return null;
  const start = message.length - message.trimStart().length;
  const quote: [number, number] = [start, message.trimEnd().length];
  const words = message.slice(quote[0], quote[1]);
  const read = `${kind}.read` as GraphPart["capabilities"][number];
  const part: GraphPart = {
    ...template,
    asked: 0,
    capabilities: [read],
    continues: null,
    dependsOn: [],
    localId: "p1",
    plan: { ...template.plan, clarity: "clear", deliverable: "answer", hypothesis: false, negation: false, readFilter: undefined, readings: [], rank: undefined, rankAsk: undefined, webTarget: undefined },
    quote,
    refs: shown.map((item) => ({ entity: kind, quote: null, recordId: item.id })),
  };
  const first = output.parts[0];
  const understood: UnderstandOutput = {
    ...output,
    parts: [{ ...first, constraints: [], continues: null, dependsOn: [], deliverable: "answer", goal: `Answer the user's follow-up about the list shown last (the ${shown.length} records under this item): ${words}`, localId: "p1", objectClues: [], readFilter: undefined, readings: [], rank: undefined, requiredCapabilities: [read], sourceQuote: words, webTarget: undefined } as UnderstandOutput["parts"][number]],
    plainChat: false,
  };
  emitTrace({ kind, parts: parts.length, records: shown.length, type: "understand.follows_shown_list" });
  return { output: understood, parts: [part] };
}

/** Words of this turn's message as [start, end), or undefined when they are not in it. */
function spanOf(message: string, words: string | undefined): [number, number] | undefined {
  if (!words) return undefined;
  const at = message.indexOf(words);
  return at >= 0 ? [at, at + words.length] : undefined;
}

type Checked = { ok: true; output: UnderstandOutput; dropped: string[] } | { ok: false; errors: string[] };

function check(text: string, input: UnderstandValidationInput): Checked {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { errors: [parsed.error], ok: false };
  return validateUnderstandOutput(parsed.value, input);
}

const failedUnderstanding = (result: Extract<MainModelResult, { ok: false }>) => (result.reason === "budget" ? "budget" as const : "model_error" as const);

/** Family names (zh, ja) and name prefixes: a bare word that starts so, or ends with an honorific, reads as a person. */
const ZH_SURNAME = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗郑梁谢宋唐许韩冯邓曹彭曾肖董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范廖贾夏韦邹孟熊秦邱尹薛闫段雷侯史陶黎贺顾毛郝龚邵钱严覃戴莫孔汤";
const JA_SURNAME = /^(佐藤|鈴木|高橋|田中|伊藤|渡辺|渡边|山本|中村|小林|加藤|吉田|山田|佐々木|山口|松本|井上|木村|斎藤|清水|山崎|池田|橋本|阿部|石川|山下|中島|石井|小川|前田|岡田|長谷川|藤田|後藤|近藤|村上|遠藤|青木|坂本|福田|太田|西村|藤井|岡本|藤原|中野|三浦|原田|中川|松田|竹内|小野|田村|中山|和田|石田|森田|上田|柴田|酒井|工藤|横山|宮崎|宮本|内田|高木|安藤|島田|谷口|大野|高田|丸山|今井|河野|藤本|村田|武田|上野|杉山|増田|小山|大塚|平野|是枝)/u;
const HONORIFIC_END = /(さん|さま|様|くん|君|ちゃん|先生|氏|老师|女士|总监|经理|总)$/u;
const NOT_A_NAME = /^(今天|明天|昨天|后天|前天|今日|明日|昨日|早上|晚上|上午|下午|中午|周末|你好|您好|谢谢|好的|收到|嗯嗯|哈哈|在吗|帮忙|帮我|这个|那个|什么|为什么|怎么|是的|不是|没有|可以|不行|行吗|对的|继续|取消|算了|随便|好吧)$/u;
const EN_NOT_A_NAME = /^(hi|hello|hey|thanks|thank you|yes|no|ok|okay|sure|help|today|tomorrow|yesterday|please|continue|cancel|never mind|what|why|how|good|great|fine)$/iu;

/** True when a word on its own reads as a person's name (code's rule: no record is looked up). */
export function bareNameOf(words: string): string | null {
  const said = words.replace(/[\s。．.!！?？、，,…~～]+$/u, "").replace(/^[\s@]+/u, "").trim();
  if (!said) return null;
  if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]{2,8}$/u.test(said)) {
    const core = said.replace(HONORIFIC_END, "");
    if (NOT_A_NAME.test(said) || NOT_A_NAME.test(core) || core.length < 1) return null;
    if (HONORIFIC_END.test(said) && core.length >= 1) return said;
    if (/^[\p{Script=Han}]{2,4}$/u.test(core) && (/^[小老阿]/u.test(core) || ZH_SURNAME.includes(core[0]) || JA_SURNAME.test(core))) return said;
    return null;
  }
  if (/^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){0,2}$/u.test(said) && !EN_NOT_A_NAME.test(said)) return said;
  return null;
}

/**
 * AG10 run-03 (AE-AMB-001): a part that is only a name ("小林") and got no object clue from the first layer names a person,
 * as the first layer gives it (a contact clue, no record bound). Code decides from the words alone — nothing is looked up,
 * so the question that follows still reads none of the user's records.
 */
function nameBareContacts(output: UnderstandOutput): void {
  if (output.plainChat) return;
  for (const part of output.parts) {
    if (part.objectClues.length || part.clarity !== "none" || part.requiredCapabilities.length) continue;
    const name = bareNameOf(part.sourceQuote);
    if (!name) continue;
    part.objectClues = [{ entity: "contact", text: name }];
    emitTrace({ type: "understand.bare_name_contact", words: name.length });
  }
}

export function understandNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const context = run.context!;
    const budget = { ...state.budget };
    const validation: UnderstandValidationInput = { handles: new Set(context.handles.keys()), message: input.message, openItemRefs: new Set(context.openItemHandles.keys()) };
    const system = understandSystemPrompt();
    // AG05: today (with its weekday, in the user's time zone) lets the first layer give a date range.
    const zone = state.timeZone || "Asia/Tokyo";
    const today = `${formatWhen(state.asOf || deps.now(), zone, false)}, ${zone}`;
    // AG14: the user's saved rules for every answer matter here only for a plain-chat reply this step writes itself.
    const contextText = [context.promptText, ...standingRuleNotes(run.memory)].join("\n");
    const user = understandUserText({ contextText, message: input.message, today });
    emitTrace({ contextMessages: context.messages.length, promptVersion: UNDERSTAND_PROMPT_VERSION, ...(run.memory.rules.length ? { standingRules: run.memory.rules.length } : {}), type: "understand.prompt" });
    let repairs = state.repairs;
    let first = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "first", requestId: input.requestId, system, user });
    if (first.ok === false && first.reason === "model_error" && first.retryable && repairs < 1) {
      // A failed call (timeout, 429, 5xx) gets the round's one second chance, inside the same budget.
      repairs += 1;
      first = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "retry", requestId: input.requestId, system, user });
    }
    if (first.ok === false) return { budget, repairs, understanding: failedUnderstanding(first) };
    let checked = check(first.text, validation);
    if (checked.ok === false) {
      emitTrace({ errors: checked.errors, purpose: "first", type: "understand.invalid" });
      if (repairs >= 1) return { budget, repairs, understanding: "invalid" };
      repairs += 1;
      const repair = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "repair", requestId: input.requestId, system, user: repairUserText({ contextText, errors: checked.errors, message: input.message, previousOutput: first.text, today }) });
      if (repair.ok === false) return { budget, repairs, understanding: failedUnderstanding(repair) };
      checked = check(repair.text, validation);
      if (checked.ok === false) {
        emitTrace({ errors: checked.errors, purpose: "repair", type: "understand.invalid" });
        return { budget, repairs, understanding: "invalid" };
      }
    }
    if (checked.dropped.length) emitTrace({ dropped: checked.dropped, note: "verdict, route and waitReason are decided by code; the model's values are dropped", type: "understand.fields_dropped" });
    // run-03: a sentence of the message no part holds becomes a statement part (code's, not the model's).
    const covered = coverEverySentence(checked.output, input.message);
    if (covered.added.length) emitTrace({ quotes: covered.added.map((words) => [input.message.indexOf(words), input.message.indexOf(words) + words.length]), type: "understand.sentence_covered" });
    nameBareContacts(covered.output);
    run.understood = covered.output;
    run.plainReply = covered.output.plainChat ? covered.output.reply ?? null : null;
    // AG06: the reply language — the first layer's report, checked against the text (intake's rule is the fallback).
    // AG06 repair 1: a Han-only message is decided by the user's earlier messages of this session, else the locale.
    const earlier = (run.context?.messages ?? []).filter((item) => item.role === "user").map((item) => item.text);
    const chosen = replyLanguageOf(input.message, covered.output.language, input.locale, earlier);
    // AG14: a saved rule for every answer ("回答用日语") decides the reply language, whatever the message is written in.
    const ruled = run.memory.replyLanguage;
    // A plain-chat reply this step wrote in another language than the rule asks for is not delivered: the answer step
    // writes it again in the ruled language.
    if (ruled && run.plainReply && replyLanguageOf(run.plainReply, null, ruled).language !== ruled) {
      emitTrace({ ruled, type: "understand.plain_reply_not_in_ruled_language" });
      run.plainReply = null;
    }
    emitTrace({ language: ruled ?? chosen.language, reported: covered.output.language ?? null, decidedBy: ruled ? "saved_rule" : chosen.source, ...(chosen.rejected ? { rejected: chosen.rejected } : {}), type: "understand.language" });
    const made = graphPartsOf(covered.output, scope, localDayOf(state.asOf || deps.now(), zone));
    // AG19-6: a question right after a list goes on from that list (code's rule).
    const followed = continueShownList(covered.output, made, scope);
    if (followed) {
      run.understood = followed.output;
      run.plainReply = null;
    }
    // ORBIT_AGENT_CONVERSATION: the conversation engine reads the same turn (shadow: compared only; on: its decisions apply).
    // ORBIT_AGENT_CONVERSATION_WORLD: the engine's small store read, only for a person reference the agent left unbound.
    const ready = followed?.parts ?? made;
    const worldRead = conversationMode() !== "legacy" && openedMode("world") !== "off" && needsWorldRead(ready) ? startWorldRead(scope, logOf(run.sessionState), state.asOf || deps.now(), zone) : null;
    const parts = conversationTurn(scope, state, covered.output, ready, { followedList: Boolean(followed) }, worldRead ? await awaitWorldRead(worldRead) : null);
    return { budget, language: ruled ?? chosen.language, parts, plainChat: followed ? false : covered.output.plainChat, repairs, understanding: "understood" };
  };
}
