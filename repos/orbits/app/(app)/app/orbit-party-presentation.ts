// Party presentation layer: builds a clean, fully trilingual OrbitPartyViewModel
// from authored content (orbit-party-content), for the page's language.
//
// Why: the live/static party route feeds raw seed blobs (English mock text, or
// "JP / ZH / EN" slash blobs and Japanese names in live mode) straight into the
// party UI. The global localizer is zh->en dictionary only, so those fields never
// follow the page language. Party is a demo showcase, so we replace its payload
// with curated trilingual content — mirroring the events presentation approach.

import type { OrbitLanguage } from "./orbit-language-core";
import type {
  OrbitPartyPersonView,
  OrbitPartyViewModel,
} from "./orbit-party-route-view-model";
import {
  PARTY_CONTENT,
  type PartyLocalizedText,
  type PartyPersonContent,
} from "./orbit-party-content";

function pick(text: PartyLocalizedText, language: OrbitLanguage): string {
  return text[language] ?? text.zh;
}

function personView(
  person: PartyPersonContent,
  index: number,
  language: OrbitLanguage,
): OrbitPartyPersonView {
  return {
    company: person.company,
    g: person.g,
    groupNumber: person.groupNumber,
    icebreakers: person.icebreakers.map((item) => pick(item, language)),
    id: `party_person_${index}`,
    industry: pick(person.industry, language),
    initial: person.initial,
    name: person.name,
    offering: pick(person.offering, language),
    reason: pick(person.reason, language),
    score: person.score,
    seat: person.seat,
    seeking: pick(person.seeking, language),
    summary: pick(person.summary, language),
    title: pick(person.title, language),
    topics: person.topics.map((item) => pick(item, language)),
  };
}

/** Build a clean, language-following party view model for the demo party page. */
export function buildOrbitParty(language: OrbitLanguage): OrbitPartyViewModel {
  const recommendations = PARTY_CONTENT.recommendations.map((person, index) =>
    personView(person, index, language),
  );
  const tableMates = PARTY_CONTENT.tableMates
    .map((index) => recommendations[index])
    .filter((person): person is OrbitPartyPersonView => Boolean(person));

  return {
    accessCode: PARTY_CONTENT.accessCode,
    agenda: PARTY_CONTENT.agenda.map((item) => ({
      description: pick(item.description, language),
      label: pick(item.label, language),
      time: item.time,
    })),
    eventName: pick(PARTY_CONTENT.eventName, language),
    eventVenue: pick(PARTY_CONTENT.eventVenue, language),
    icebreakers: PARTY_CONTENT.icebreakers.map((item) => pick(item, language)),
    me: {
      groupNumber: PARTY_CONTENT.me.groupNumber,
      initial: PARTY_CONTENT.me.initial,
      name: PARTY_CONTENT.me.name,
      offering: PARTY_CONTENT.me.offering.map((item) => pick(item, language)),
      prompts: PARTY_CONTENT.me.prompts.map((item) => pick(item, language)),
      role: pick(PARTY_CONTENT.me.role, language),
      seat: PARTY_CONTENT.me.seat,
      seeking: PARTY_CONTENT.me.seeking.map((item) => pick(item, language)),
      topics: PARTY_CONTENT.me.topics.map((item) => pick(item, language)),
    },
    recommendations,
    tableMates,
  };
}
