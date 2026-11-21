/**
 * Record-finder lab (see SPEC.md): the fixed data world, the functions under test, and the case format.
 * Nothing here is imported by the agent; implementations live in adapters/.
 */

// ---------- the data world (fixtures/world.yaml) ----------

export type Account = "A" | "B";

export interface Contact {
  id: string;                 // C-…
  account: Account;
  name: string;               // as the user saved it: 沈博文 / 田中 美咲 / Robert Hayes
  reading?: string;           // user-supplied reading (furigana / pinyin / Wade-Giles); ADDS to the computed readings, does not replace them (D5)
  aliases?: string[];         // nicknames the user saved (Bob)
  company?: string;
  title?: string;             // job title
  industry?: string;
  lastInteractionAt?: string; // ISO; tie-break by recency
  deletedAt?: string;         // ISO; deleted within 30 days → only a restore finds it
}

export interface Todo {
  id: string;                 // T-…
  account: Account;
  title: string;
  notes?: string;
  contactIds?: string[];      // several people possible
  eventIds?: string[];
  plannedDate?: string;       // YYYY-MM-DD
  dueAt?: string;             // ISO
  status: "open" | "done";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;         // ISO; deleted within 30 days → only a restore finds it (same rule as Contact)
}

export interface Memo {
  id: string;                 // M-…
  account: Account;
  title: string;
  body: string;
  contactIds?: string[];
  eventIds?: string[];
  writtenOn: string;          // YYYY-MM-DD (relative days in the body count from here)
  updatedAt: string;
  deletedAt?: string;         // ISO; deleted within 30 days → only a restore finds it (same rule as Contact)
}

export interface ScheduleItem {
  id: string;                 // S-…
  account: Account;
  title: string;
  startsAt: string;           // ISO, first occurrence
  endsAt: string;
  allDay?: boolean;
  recurrence?: { frequency: "daily" | "weekly" | "monthly"; byWeekday?: number[]; until?: string };
  exceptions?: { day: string; startsAt?: string; endsAt?: string; cancelled?: boolean }[]; // one occurrence moved/cancelled
  contactIds?: string[];
  location?: string;
}

export interface PlatformEvent {
  id: string;                 // E-…
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  location?: string;
  organizer?: string;
  summary?: string;
}

export interface PrivateEvent {
  id: string;                 // P-…
  account: Account;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  location?: string;
}

export interface Attendance {
  id: string;                 // A-…
  account: Account;
  eventId: string;            // E-… or P-…
  went: boolean;              // true = 我去过; false = planned
}

export interface AliasEntry {   // per-account table of names the user confirmed (沈总 → C-…)
  account: Account;
  said: string;
  contactId: string;
}

export interface World {
  now: string;                // 2026-11-21T15:00:00+09:00
  timeZone: string;           // Asia/Tokyo
  contacts: Contact[];
  todos: Todo[];
  memos: Memo[];
  schedule: ScheduleItem[];
  platformEvents: PlatformEvent[];
  privateEvents: PrivateEvent[];
  attendance: Attendance[];
  aliases: AliasEntry[];
  provenance?: string;        // scaled worlds: seed, filter case source and a hash of the filter case ids
}

// ---------- functions under test ----------

export type Lang = "zh" | "ja" | "en" | "mixed";
export type Verb = "read" | "update" | "complete" | "delete" | "link" | "restore";
export type PartOfDay = "early" | "morning" | "noon" | "afternoon" | "evening" | "night";

export interface TimeRef {
  day?: string;                          // YYYY-MM-DD
  range?: { from: string; to: string };  // YYYY-MM-DD, inclusive
  partOfDay?: PartOfDay;
  time?: string;                         // HH:MM (24h)
  endTime?: string;
  shiftMinutes?: number;                 // +30 = later, -60 = earlier
  occurrence?: "this" | "next" | "date" | "series";
  went?: boolean;                        // the sentence says the user went / it happened
  spans: [number, number][];             // character spans of the sentence that are time words
}

export interface TimeInput { text: string; now: string; timeZone: string; noteWrittenOn?: string }

export interface PersonInput {
  mention: string;                       // how the user referred to the person: 沈总 / 她 / Mr. Lin
  sentence: string;
  account: Account;
  sessionPeople?: string[];              // contact ids already settled earlier in this conversation, latest last
  sentencePeople?: string[];             // contact ids named earlier in the same sentence
}

export interface PersonCandidate {
  contactId: string;
  why: "full" | "surname-title" | "prefix" | "given" | "alias" | "reading" | "pronoun" | "company" | "role" | "near";
}

export interface CleanInput { sentence: string; clue: string; lang: Lang }
export interface CleanResult {
  contentWords: string[];
  removed: { pointer: string[]; kind: string[]; verb: string[]; person: string[]; time: string[] };
}

export interface FindInput {
  sentence: string;
  clue: string;
  account: Account;
  verb: Verb;
  kinds?: ("todo" | "memo")[];
  status?: "open" | "done" | "any";
  people?: string[];                     // settled by the person resolver
  time?: Omit<TimeRef, "spans">;
  sessionShown?: string[];               // ids shown to the user in the last answer, in order (ordinal / deixis)
}

export interface Candidate {
  id: string;                            // T-/M-/S-/E-/P-/C-
  occurrence?: string;                   // schedule: YYYY-MM-DD of the meant occurrence
  score: number;                         // lexical score, higher = better
  matched: string[];                     // which content words / fields matched
}

export type ModelPick = { chosen: string[] } | { ambiguous: string[] } | { none: true };
export interface Decision { outcome: "one" | "ask" | "none"; ids: string[] }

export interface Finders {
  resolveTime(input: TimeInput): TimeRef;
  resolvePerson(input: PersonInput, world: World): PersonCandidate[];
  cleanClue(input: CleanInput): CleanResult;
  findTodosMemos(input: FindInput, world: World): Candidate[];
  findSchedule(input: FindInput, world: World): Candidate[];
  findEvents(input: FindInput, world: World): Candidate[];
  findContacts(input: FindInput, world: World): Candidate[];
  decide(candidates: Candidate[], pick: ModelPick | null, input: FindInput, world: World): Decision;
}

// ---------- the lookup flow (orchestration around the functions above) ----------

/** What the first model step understood (fixed in a case; the lab never calls a model). */
export interface Understood {
  kind: "todo" | "memo" | "todo-or-memo" | "schedule" | "event" | "contact";
  clue: string;
  mention?: string;                      // the person as said
  timeText?: string;                     // the time words as said
  verb: Verb;
  status?: "open" | "done" | "any";
}

export interface LookupInput {
  sentence: string;
  account: Account;
  understood: Understood[];              // one per record the sentence points at (a sentence may point at several)
  sessionPeople?: string[];
  sessionShown?: string[];
}

/** A scripted fake model: answers in order, per kind of call. "timeout" / "malformed" simulate failures. */
export interface ModelScript {
  pick?: (ModelPick | "timeout" | "malformed" | { chosen: string[]; invalidIds: string[] })[];
  reformulate?: ({ terms: string[]; widenDays?: number; kind?: Understood["kind"] } | "timeout" | "malformed")[];
}

export interface LookupStep { step: "person" | "time" | "clean" | "find" | "pick" | "reformulate" | "decide"; detail?: string }

export interface LookupResult {
  decisions: Decision[];                 // one per understood item, same order
  steps: LookupStep[];                   // what ran, in order
  modelCalls: { pick: number; reformulate: number };
}

export interface Lookup {
  lookup(input: LookupInput, world: World, model: ModelScript): LookupResult;
}

// ---------- cases (cases/*.yaml) ----------

export interface Variant {
  lang: Lang;
  sentence: string;
  clue?: string;          // finders / cleanClue: the span the first model step extracted
  mention?: string;       // resolvePerson: how the person was referred to
  spans?: string[];       // resolveTime: this variant's time words, when they differ from expect.spans
  note?: string;          // why this phrasing is here
}

export interface CaseBase {
  id: string;
  intent: string;                        // what the user wants and why the expectation holds
  tags: string[];
  variants: Variant[];
}

export interface TimeCase extends CaseBase {
  fn: "resolveTime";
  context?: { now?: string; timeZone?: string; noteWrittenOn?: string };
  expect: Partial<Omit<TimeRef, "spans">> & { spans?: string[]; absent?: (keyof TimeRef)[] }; // spans as the words themselves
}

export interface PersonCase extends CaseBase {
  fn: "resolvePerson";
  context?: { account?: Account; sessionPeople?: string[]; sentencePeople?: string[] };
  expect: { decision: "one" | "ask" | "none"; target: string[]; never?: string[]; proposeOnly?: string[] };
}

export interface CleanCase extends CaseBase {
  fn: "cleanClue";
  expect: { contentWords: string[][]; removedAtLeast?: Partial<CleanResult["removed"]> }; // any of the listed word sets
}

export interface FindCase extends CaseBase {
  fn: "findTodosMemos" | "findSchedule" | "findEvents" | "findContacts";
  context: Omit<FindInput, "sentence" | "clue">;
  expect: {
    target: string[];                    // meant records ([] = none in the world)
    occurrence?: string;                 // schedule: the meant occurrence day
    distractors?: string[];
    decision: "one" | "ask" | "none";
    lexicalClear?: boolean;              // decided without the model
    mustNotSayNone?: boolean;
    model?: ModelPick;                   // the fake model's answer when the decision needs it
    sameAs?: string;                     // another case id that must find the same record under another verb
  };
}

export interface DecideCase extends CaseBase {
  fn: "decide";
  context: Omit<FindInput, "sentence" | "clue">;
  candidates: Candidate[];
  model: ModelPick | null;
  expect: Decision;
}

export interface LookupCase extends CaseBase {
  fn: "lookup";
  context: Omit<LookupInput, "sentence" | "understood"> & { understood: Understood[] }; // per variant, sentence varies; understood may be overridden in a variant via `understood`
  model: ModelScript;
  expect: {
    decisions: Decision[];
    maxModelCalls?: { pick?: number; reformulate?: number };   // e.g. { pick: 0 } = must not call the model
    exactModelCalls?: { pick?: number; reformulate?: number };
    stepsInclude?: LookupStep["step"][];
    stepsExclude?: LookupStep["step"][];
  };
}

export type Case = TimeCase | PersonCase | CleanCase | FindCase | DecideCase | LookupCase;
