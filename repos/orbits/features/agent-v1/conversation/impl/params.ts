// @ts-nocheck -- conversation/impl/params.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r11-maintenance/impl/params.ts
// (lab commit ce0b76fe4, r11 = r10 + when to ask round 2: exact @ / quoted picks on reads, typed confirmations while a card waits, 他们 for a company). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/** Every tunable number of the implementation (mirrored in plan.json). */
export const PARAMS = {
  /** Idle longer than this (minutes) breaks "the latest mention" (R2) and shelves an open question. Exactly 60 does not. */
  idleMinutes: 60,
  /** A message on another local day after at least this many idle minutes also counts as coming back. */
  newDayMinIdle: 30,
  /** Unrelated messages after which an open question is shelved. */
  shelveAfterUnrelated: 2,
  /** Questions per matter: after this many, deliver instead of asking again. */
  askAtMost: 1,
  /** Candidates offered when asking. */
  maxCandidates: 3,
  /** A follow-up this short (characters) with a new time is read as a period swap even without 那…呢. */
  shortFollowUpChars: 12,
  /** How many recent non-filler turns a "which of these" question may refer to. */
  followListTurns: 4,
  /** r08: a hint part this short (characters, punctuation aside) with nothing of a request is merged into its neighbour. */
  bareHintPartMaxChars: 8,
  /** r10: a title counts as said when at least this many of its content units are in the words … */
  titleCoverMinUnits: 2,
  /** … and at least this share of them. */
  titleCoverShare: 0.6,
  /** r10 (R34): a to-do with no person duplicates an open one when they share this many units, at least half of the title's (capped). */
  dupMinShared: 2,
  dupTitleUnitsCap: 6,
  /** r10 (R43): a pointer with one content word binds the one title that has it only when the word has this many characters. */
  looseBindMinChars: 3,
  /** r10 (R41): an undecided reply that answers nothing is no request when it is this short (characters / words). */
  undecidedMaxChars: 12,
  undecidedMaxWords: 3,
  /** r11 (R44): a plural pronoun points at a company named this many turns back at most (filler turns not counted). */
  pluralCompanyTurns: 2,
};
