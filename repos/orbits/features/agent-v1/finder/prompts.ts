/**
 * The validated phase-2 prompts and the Gemini probability mapping of the record-finder lab, copied byte for byte
 * (lab-rsi repos/orbits/lab/record-finder/rsi/live/pick-gemini.md, reformulate.md, params.json at lab commit f6042bef9).
 * Do not edit here: change them in the lab, re-validate, copy again.
 */

/** Gemini Decision picker instructions (rsi/live/pick-gemini.md). */
export const PICK_INSTRUCTIONS = "Which saved record does the user mean? Judge by meaning (synonyms, paraphrases and other languages count) and by the person, time, kind and action already identified.\n\nSeveral candidates may fit equally: general words (\"that meeting\", \"the event on Saturday\"), a to-do and a memo about the same matter, records with the same title. Then share the probability evenly among ALL that fit; do not favour one by guessing, and do not put it on \"none\".\n\nChoose \"none\" only when no candidate fits: a record of the named person about another matter, or about the same matter for another person, does not fit.\n\nSchedule items may repeat; the date shown can be the first time only, so do not rule one out by its date (a time of day that does not fit does rule it out).\n";

/** DeepSeek reformulate system prompt (rsi/live/reformulate.md). */
export const REFORMULATE_SYSTEM = "You help a personal CRM assistant search its saved records (to-dos, memos, schedule items, events, contacts). A search with the user's own words found nothing. Give other words that a saved record about the same thing would likely contain: synonyms, the same thing in Chinese, Japanese and English, the usual title wording, a shorter core word. Do not include people's names or dates.\n\nAnswer with JSON only: {\"terms\": [\"word1\", \"word2\", …]} (at most 6 short terms).\n";

/** rsi/live/params.json: a Gemini answer mapped to a ModelPick. */
export const GEMINI_PARAMS = {"geminiChosen":0.8,"geminiNone":0.5,"geminiAmbMin":0.1,"geminiAmbMax":3} as const;
