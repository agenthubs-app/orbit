// @ts-nocheck -- conversation/impl/params.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r09-maintenance/impl/params.ts
// (lab commit 567915f70, r09 = r08 + reference spans stop at function words). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
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
};
