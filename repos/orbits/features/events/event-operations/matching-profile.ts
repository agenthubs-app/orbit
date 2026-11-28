/**
 * The matching card a generation uses (2026-11-28).
 *
 * Registration answers store a multiple choice as one string joined by " · " (「创业者、经营者 · 同行业的人 · 投资人」),
 * and option labels themselves may contain 、 or / (「创业者、经营者」「事業パートナー / 共同創業者」). The registration DTO
 * splits on 、 and / but not on " · ", so its needs / offers / topics were fragments the concept table cannot read
 * (event 6: 0 of 15 people had a recognised need). The person's account profile (seeking / offering / topics) uses the
 * concept vocabulary but never reached the generation.
 *
 * This rebuilds only needs / offers / topics, for the generation snapshot; every other field of the stored card is kept.
 * The stored registration DTO and its other readers (admission, journey, attendee cards) are unchanged.
 */
import type { EventParticipantProfileAnswers } from "../registration/contract";
import type { EventOperationsParticipant } from "./contract";
import { needConcept, offerConcept, topicConcept } from "./match-concepts";

export interface MatchingAccountProfile {
  bio?: string | null;
  headline?: string | null;
  /** Profile matching fields (confirmed or inferred), 2026-11-28. */
  matchFields?: import("../../../shared/contract/profile").ProfileMatchFieldsContract | null;
  offering?: readonly string[] | null;
  role?: string | null;
  seniority?: string | null;
  seeking?: readonly string[] | null;
  topics?: readonly string[] | null;
}

const known = (term: string) => Boolean(needConcept(term) || offerConcept(term) || topicConcept(term));

/** Splits on 、 / , ; | outside parentheses (「专业人士（律师、顾问等）」 stays whole). */
function splitOutsideParentheses(text: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(" || char === "（") depth += 1;
    if ((char === ")" || char === "）") && depth > 0) depth -= 1;
    if (depth === 0 && /[,，、;/|]/u.test(char)) {
      pieces.push(current);
      current = "";
    } else current += char;
  }
  pieces.push(current);
  return pieces.map((piece) => piece.trim()).filter(Boolean);
}

/** Splits one stored answer into terms: " · " always separates; 、 / , ; | separate only inside a term the concept table does not know as a whole. */
export function splitAnswerTerms(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+·\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => (known(part) ? [part] : splitOutsideParentheses(part)));
}

function terms(...values: ReadonlyArray<string | null | undefined | readonly string[]>): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item !== "string") continue;
      for (const term of splitAnswerTerms(item)) if (!out.includes(term)) out.push(term);
    }
  }
  return out;
}

/**
 * needs = who they want to meet + what they want from the event + account「在找」;
 * offers = what they offer + experience highlight (as before) + account「能提供」;
 * topics = their industry + account topics. The event goal is no longer a topic: two people who both want funding
 * do not share a topic (the old card made 「寻找投资」 a topic for every investor-seeker).
 * about = account headline + self-introduction (what they actually do), for the model to judge whether two people's
 * work fits; role / seniority fall back to the account.
 */
export function matchingParticipant(
  participant: EventOperationsParticipant,
  input: { account?: MatchingAccountProfile | null; answers?: EventParticipantProfileAnswers | null },
): EventOperationsParticipant {
  const answers = input.answers ?? participant.profileAnswers ?? null;
  const account = input.account ?? null;
  if (!answers && !account) return participant;
  const needs = answers
    ? terms(answers.targetAttendees, answers.desiredOutcome, account?.seeking ?? [])
    : terms(participant.needs, account?.seeking ?? []);
  const offers = answers
    ? terms(answers.valueOffered, answers.experienceHighlight, account?.offering ?? [])
    : terms(participant.offers, account?.offering ?? []);
  const topics = answers
    ? terms(answers.industry, account?.topics ?? [])
    : terms(participant.topics, account?.topics ?? []);
  const about = [account?.headline, account?.bio]
    .map((text) => text?.replace(/\s+/gu, " ").trim())
    .filter((text, index, all): text is string => Boolean(text) && all.indexOf(text) === index)
    .join(" / ")
    .slice(0, 300);
  const goals = answers ? terms(answers.desiredOutcome) : [];
  const wants = answers ? terms(answers.targetAttendees) : [];
  const fields = account?.matchFields;
  const matchFields = fields && (fields.identity || fields.businessCategoryIds?.length || fields.sellsTo)
    ? {
      businessCategoryIds: fields.businessCategoryIds ?? [],
      customerIndustryIds: fields.customerIndustryIds ?? [],
      identity: fields.identity ?? null,
      investStages: fields.investStages ?? [],
      sellsTo: fields.sellsTo ?? null,
    }
    : null;
  return {
    ...participant,
    ...(about ? { about } : {}),
    ...(matchFields ? { matchFields } : {}),
    ...(goals.length ? { goals } : {}),
    ...(wants.length ? { wants } : {}),
    needs,
    offers,
    role: participant.role ?? account?.role?.trim() ?? null,
    seniority: participant.seniority ?? account?.seniority ?? null,
    topics,
  };
}
