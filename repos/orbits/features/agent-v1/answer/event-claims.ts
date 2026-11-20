/**
 * agent-design AG19 repair round 1 (judges, AE-ANS-003 R3): what an answer says ABOUT the events it read is held to
 * their fields. Two statements were delivered that the records do not support — one event called the one with the
 * "shortest duration" when all three ran three hours, and "no ticket price is given" when the events carry fees.
 *
 * Code's rule, sentence by sentence (the checks of answer/claims.ts work the same way): a comparative claim — shortest,
 * longest, cheapest, most expensive, earliest, the only one that … — must be derivable from the fields read (start, end,
 * fee) or the sentence is not delivered; so is a sentence saying a price is not given when the events read state one.
 * Nothing is rewritten: a sentence either stands or goes, and what went is traced.
 */
import { localParts } from "../functions/copy";

export interface EventClaimFacts {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  /** The fee as the organizer stated it (domains/event/read.ts eventFactsOf); null: not read. */
  fee: { kind: string; amountYen?: number | undefined } | null;
}

const SHORTEST = /(最短|shortest|一番短|最も短)/iu;
const LONGEST = /(时长最长|时间最长|历时最长|持续最久|最长的|longest|一番長|最も長)/iu;
const CHEAPEST = /(最便宜|最低价|票价最低|费用最低|价格最低|成本最低|花费最少|花钱最少|最省钱|cheapest|least expensive|lowest (?:price|fee|cost)|一番安|最も安)/iu;
const PRICIEST = /(最贵|票价最高|费用最高|价格最高|most expensive|priciest|highest (?:price|fee|cost)|一番高い|最も高い)/iu;
const EARLIEST = /(最早|earliest|一番早|最も早)/iu;
const LATEST = /(最晚|最迟|一番遅|最も遅)/iu;
const ONLY = /(唯一|\bthe only\b|唯一の)/iu;
const NO_FEE = /((?:没有|没|未|并未|尚未)(?:写|提供|标|标明|给出|说明|公布|提及|注明|包含)?[^。！？!?\n]{0,8}(?:票价|费用|价格|门票|收费)|(?:票价|费用|价格|门票)[^。！？!?\n]{0,10}(?:没有|未知|不明|不详|未提供|没写|未标|未说明|缺失)|\bno (?:ticket )?(?:price|fee|cost)s?\b|(?:price|fee|cost)s? (?:is|are|was|were) not (?:given|listed|stated|shown|available)|(?:料金|費用|参加費)[^。！？!?\n]{0,8}(?:不明|記載なし|記載がありません|ありません|わかりません))/iu;

const ONLY_KINDS: { words: RegExp; holds: (event: EventClaimFacts, timeZone: string) => boolean | null }[] = [
  { holds: (event) => (event.fee ? event.fee.kind === "free" : null), words: /(免费|\bfree\b|無料)/iu },
  { holds: (event) => (event.fee ? event.fee.kind === "amount" || event.fee.kind === "pay_at_door" : null), words: /(收费|付费|要钱|花钱|\bpaid\b|有料)/iu },
  { holds: (event, zone) => dayKind(event, zone, (day) => day === 0 || day === 6), words: /(周末|週末|weekends?\b)/iu },
  { holds: (event, zone) => dayKind(event, zone, (day) => day >= 1 && day <= 5), words: /(工作日|平日|weekdays?\b)/iu },
  { holds: (event, zone) => hourKind(event, zone, (hour) => hour >= 17), words: /(晚上|晚间|夜|evening|night)/iu },
  { holds: (event, zone) => hourKind(event, zone, (hour) => hour < 12), words: /(上午|早上|午前|morning)/iu },
  { holds: (event, zone) => hourKind(event, zone, (hour) => hour >= 12 && hour < 17), words: /(下午|午後|afternoon)/iu },
];

function dayKind(event: EventClaimFacts, timeZone: string, test: (day: number) => boolean): boolean | null {
  if (!event.startsAt || !Number.isFinite(Date.parse(event.startsAt))) return null;
  const { day } = localParts(event.startsAt, timeZone);
  return test(new Date(`${day}T00:00:00Z`).getUTCDay());
}

function hourKind(event: EventClaimFacts, timeZone: string, test: (hour: number) => boolean): boolean | null {
  if (!event.startsAt || !Number.isFinite(Date.parse(event.startsAt))) return null;
  return test(Number(localParts(event.startsAt, timeZone).time.slice(0, 2)));
}

const durationOf = (event: EventClaimFacts) => (event.startsAt && event.endsAt && Number.isFinite(Date.parse(event.startsAt)) && Number.isFinite(Date.parse(event.endsAt)) ? Date.parse(event.endsAt) - Date.parse(event.startsAt) : null);
const priceOf = (event: EventClaimFacts) => (event.fee?.kind === "free" ? 0 : event.fee?.kind === "amount" && typeof event.fee.amountYen === "number" ? event.fee.amountYen : null);
const startOf = (event: EventClaimFacts) => (event.startsAt && Number.isFinite(Date.parse(event.startsAt)) ? Date.parse(event.startsAt) : null);

/** The longest run of characters two texts share. */
function sharedRun(left: string, right: string): string {
  let best = "";
  for (let start = 0; start < left.length; start += 1) {
    for (let end = left.length; end - start > best.length; end -= 1) {
      if (right.includes(left.slice(start, end))) best = left.slice(start, end);
    }
  }
  return best;
}

/**
 * The events these words name: by the full title, or by a short form of it ("摄影展" for "东京街头摄影展", "定价研讨会" for
 * "SaaS 定价研讨会") — three characters or more of the title (five in Latin letters) that no other event read has.
 */
export function eventsNamedIn(words: string, events: readonly EventClaimFacts[]): EventClaimFacts[] {
  return events.filter((event) => {
    if (words.includes(event.title)) return true;
    const run = sharedRun(event.title, words).trim();
    const longEnough = /^[\x00-\x7f]+$/u.test(run) ? run.length >= 5 : run.length >= 3;
    return longEnough && !events.some((other) => other !== event && other.title.includes(run));
  });
}

/** The one event with the smallest (or largest) value; null when a value is unknown or the extreme is shared. */
function uniqueExtreme(events: readonly EventClaimFacts[], valueOf: (event: EventClaimFacts) => number | null, pick: "min" | "max"): EventClaimFacts | null {
  const values = events.map(valueOf);
  if (values.some((value) => value === null) || events.length < 2) return null;
  const extreme = pick === "min" ? Math.min(...(values as number[])) : Math.max(...(values as number[]));
  const holders = events.filter((_, index) => values[index] === extreme);
  return holders.length === 1 ? holders[0] : null;
}

/** Why a sentence is not supported by the events read, or null when it stands. `named`: the events the sentence (or its line) names. */
export function unsupportedEventClaim(sentence: string, named: readonly EventClaimFacts[], events: readonly EventClaimFacts[], timeZone: string): string | null {
  const superlatives: [RegExp, (event: EventClaimFacts) => number | null, "min" | "max", string][] = [
    [SHORTEST, durationOf, "min", "shortest"], [LONGEST, durationOf, "max", "longest"],
    [CHEAPEST, priceOf, "min", "cheapest"], [PRICIEST, priceOf, "max", "most expensive"],
  ];
  for (const [words, valueOf, pick, name] of superlatives) {
    if (!words.test(sentence)) continue;
    // A free event is never undercut, whatever the others cost: "the cheapest" said of free events stands.
    if (name === "cheapest" && named.length && named.every((event) => priceOf(event) === 0)) continue;
    const holder = uniqueExtreme(events, valueOf, pick);
    if (!holder) return `"${name}" cannot be derived: a value is not stated, or several events share it`;
    if (named.length && !named.includes(holder)) return `"${name}" is ${holder.title}, not the event named`;
  }
  // A start-time superlative is checked only when the sentence names an event ("最早" is also said of other things).
  for (const [words, pick, name] of [[EARLIEST, "min", "earliest"], [LATEST, "max", "latest"]] as const) {
    if (!words.test(sentence) || !named.length) continue;
    const holder = uniqueExtreme(events, startOf, pick);
    if (!holder) return `"${name}" cannot be derived from the start times read`;
    if (!named.includes(holder)) return `"${name}" is ${holder.title}, not the event named`;
  }
  if (ONLY.test(sentence)) {
    // The kind is looked for outside the titles ("设计师之夜" is not a statement about the evening).
    const bare = events.reduce((words, event) => words.split(event.title).join(" "), sentence);
    const kind = ONLY_KINDS.find((item) => item.words.test(bare));
    if (!kind) return `"the only one" names nothing that the fields read can show`;
    const verdicts = events.map((event) => kind.holds(event, timeZone));
    if (verdicts.some((verdict) => verdict === null)) return `"the only one" cannot be derived: a field is not stated`;
    const holders = events.filter((_, index) => verdicts[index] === true);
    if (holders.length !== 1) return `"the only one" does not hold: ${holders.length} of the events read are so`;
    if (named.length && !named.includes(holders[0])) return `"the only one" is ${holders[0].title}, not the event named`;
  }
  // "No price is given" is about the events its own clause names (clauses end at ；); a clause that names none speaks of
  // the sentence's events, and a sentence that names none speaks of all the events read.
  for (const clause of sentence.split(/[；;]/u)) {
    if (!NO_FEE.test(clause)) continue;
    const own = eventsNamedIn(clause, events);
    const about = own.length ? own : named.length ? named : events;
    const stated = about.filter((event) => event.fee && (event.fee.kind === "free" || event.fee.kind === "amount" || event.fee.kind === "pay_at_door"));
    if (stated.length) return `a fee is stated for ${stated.map((event) => event.title).join(", ")}`;
  }
  return null;
}

/**
 * The text without the sentences about these events that their fields do not support. Works line by line (code's line
 * convention: a point is one line); a point left with nothing but its label goes with its sentence.
 */
export function withoutUnsupportedEventClaims(text: string, events: readonly EventClaimFacts[], timeZone: string): { text: string; dropped: { sentence: string; reason: string }[] } {
  const known = events.filter((event) => event.title.trim());
  if (!text || !known.length) return { dropped: [], text };
  const dropped: { sentence: string; reason: string }[] = [];
  const namedIn = (words: string) => eventsNamedIn(words, known);
  const lines = text.split("\n").map((line) => {
    if (!line.trim()) return line;
    const onLine = namedIn(line);
    const sentences = line.match(/[^。！？!?]+(?:[。！？!?]+|$)|[。！？!?]+/gu) ?? [line];
    const kept = sentences.filter((sentence) => {
      const own = namedIn(sentence);
      const reason = unsupportedEventClaim(sentence, own.length ? own : onLine, known, timeZone);
      if (reason) dropped.push({ reason, sentence: sentence.trim() });
      return !reason;
    });
    if (kept.length === sentences.length) return line;
    const rest = kept.join("");
    // A point of which only the mark and the label are left says nothing any more.
    return /^\s*(?:[・•]|- )?[^：:。]{0,40}[：:]?\s*$/u.test(rest) ? null : rest;
  });
  return { dropped, text: lines.filter((line): line is string => line !== null).join("\n").replace(/\n{3,}/gu, "\n\n").trim() };
}
