/**
 * What one person gains from meeting another at an event (2026-11-28). Program-owned, deterministic.
 *
 * "The person someone actually needs" is:
 *  1. someone who answers what they came for — the event goal (desiredOutcome) weighs most, then who they said they
 *     want to meet, then what their account says they look for;
 *  2. for someone who came for deals (customers, channels, partners) or who invests / brokers, someone who needs what
 *     they offer — that opportunity is the need, not a favour (anyone else gets a smaller reason to talk);
 *  3. the right kind of person: an owner / executive when they want founders, the same industry when they want peers;
 *  4. specific help over generic help: 「行业经验」「人脉介绍」「業務提携マッチング」 answer almost anything and are worth less.
 * A shared topic is a small bonus; it never makes a match on its own here.
 */
import type { EventOperationsParticipant } from "./contract";
import { needConcept, offerAnswersNeed, offerConcept, tagKey, topicConcept, topicsShare } from "./match-concepts";

/** Offers that answer many kinds of need, so a match through them alone says little. */
const GENERIC_OFFERS = new Set(["mentoring", "alliance", "events", "new_business"]);
/** Needs that mean "I want buyers / deals / partners": people who need what they offer are their opportunities. */
const DEAL_NEEDS = new Set(["customers", "channel", "enterprise", "partner"]);
/** Offers whose holders look for deals themselves: an investor's opportunity is a founder who needs funding. */
const DEAL_OFFERS = new Set(["investor_intro", "ma_support", "funding_advice", "enterprise_intro", "channel", "alliance"]);
const FOUNDER_WANTS = new Set(["创业者", "经营者", "创业者、经营者", "起業家・経営者", "founders and executives", "経営者仲間", "经营者伙伴"].map(tagKey));
const SAME_INDUSTRY_WANTS = new Set(["同行业的人", "同じ業界の人", "同業界の人脈", "people in my industry", "同行交流"].map(tagKey));
const OTHER_INDUSTRY_WANTS = new Set(["不同行业的人", "異業種の人", "異業界の人脈", "people outside my industry"].map(tagKey));
const OWNER_ROLE = /社長|代表|ceo|founder|创始|創業|董事长|会长|会長|総経理|总经理|経営者|经营者|役員|执行役员|執行役員|owner|partner|本部长/iu;

export function isOwnerOrExecutive(participant: EventOperationsParticipant): boolean {
  if (participant.seniority && /founder|c_level|owner|executive|director/iu.test(participant.seniority)) return true;
  return Boolean(participant.role && OWNER_ROLE.test(participant.role));
}

function needWeight(participant: EventOperationsParticipant, need: string): number {
  if (participant.goals?.includes(need)) return 1;
  if (participant.wants?.includes(need)) return 0.8;
  return participant.goals || participant.wants ? 0.6 : 0.8;
}
const offerWeight = (offer: string) => {
  const concept = offerConcept(offer);
  return concept && GENERIC_OFFERS.has(concept) ? 0.45 : concept ? 1 : 0.6;
};
const industryKey = (participant: EventOperationsParticipant) => {
  const industry = participant.industry?.trim();
  if (!industry) return null;
  return topicConcept(industry) ?? tagKey(industry);
};

export interface MatchBenefit {
  /** Total value to the reader. */
  value: number;
  /** The reader's needs the other person's offers answer (weighted). */
  answered: number;
  /** The other person needs what the reader offers and the reader came to sell. */
  prospect: number;
  /** The other person is the kind of person the reader asked for. */
  kind: number;
  topics: number;
}

/** What `reader` gains from meeting `other`. */
export function matchBenefit(reader: EventOperationsParticipant, other: EventOperationsParticipant): MatchBenefit {
  if (reader.participantId === other.participantId) return { answered: 0, kind: 0, prospect: 0, topics: 0, value: 0 };
  let answered = 0;
  for (const need of reader.needs) {
    let best = 0;
    for (const offer of other.offers) if (offerAnswersNeed(need, offer)) best = Math.max(best, offerWeight(offer));
    answered += best * needWeight(reader, need);
  }
  answered = Math.min(answered, 2.5);
  // Someone who needs what the reader offers: an opportunity for a reader who came for deals (customers, partners,
  // or who invests / brokers), and a smaller reason to talk for anyone else.
  const dealSeeking = reader.needs.some((need) => DEAL_NEEDS.has(needConcept(need) ?? ""))
    || reader.offers.some((offer) => DEAL_OFFERS.has(offerConcept(offer) ?? ""));
  let prospect = 0;
  for (const need of other.needs) {
    let best = 0;
    for (const offer of reader.offers) if (offerAnswersNeed(need, offer)) best = Math.max(best, offerWeight(offer));
    prospect += best * needWeight(other, need) * (dealSeeking ? 0.7 : 0.3);
  }
  prospect = Math.min(prospect, dealSeeking ? 1.5 : 0.6);
  const wants = (reader.wants ?? reader.needs).map(tagKey);
  const readerIndustry = industryKey(reader);
  const otherIndustry = industryKey(other);
  let kind = 0;
  if (wants.some((want) => FOUNDER_WANTS.has(want)) && isOwnerOrExecutive(other)) kind += 0.5;
  if (wants.some((want) => SAME_INDUSTRY_WANTS.has(want)) && readerIndustry && readerIndustry === otherIndustry) kind += 0.5;
  if (wants.some((want) => OTHER_INDUSTRY_WANTS.has(want)) && readerIndustry && otherIndustry && readerIndustry !== otherIndustry) kind += 0.15;
  const topics = Math.min(0.5, 0.25 * reader.topics.filter((topic) => other.topics.some((theirs) => topicsShare(topic, theirs))).length);
  return { answered, kind, prospect, topics, value: answered + prospect + kind + topics };
}

/** How good an introduction is for the reader: their own gain first, the other side's gain as the chance they engage. */
export function introductionScore(reader: EventOperationsParticipant, other: EventOperationsParticipant): number {
  if (reader.company && other.company && reader.company.trim().toLocaleLowerCase("en") === other.company.trim().toLocaleLowerCase("en")) return 0;
  return matchBenefit(reader, other).value + 0.4 * matchBenefit(other, reader).value;
}
