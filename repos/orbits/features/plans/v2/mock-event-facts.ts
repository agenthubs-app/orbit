/** R24 mock：演示世界 3 场活动的事实（`sample: true` 的世界，事实是示例）。 */
import { DEMO_EVENTS } from "../../../shared/mock/demo-world";
import { tokyoTimeslot, UNKNOWN_EVENT_FACTS } from "./event-facts";
import type { EventScoreFacts } from "../../../shared/compute/event-score";
import type { PlanEventFact } from "./overview";

const DEMO_FACTS: Record<string, Partial<EventScoreFacts>> = {
  "demo-event-cfo-night": { attendeeSource: "registrants", expected: { cfo: 6, funded_founder: 3 }, fee: 3000, firstDegree: 2, nameTags: true, networkingMinutes: 60, travelMinutes: 25 },
  "demo-event-robotics-meetup": { attendeeSource: "past", expected: { angel: 2, funded_founder: 5 }, fee: 0, firstDegree: 2, networkingMinutes: 30, travelMinutes: 35 },
  "demo-event-saas-summit": { attendeeSource: "speakers", exchangeCorner: true, expected: { cvc: 4, vc_partner: 3 }, fee: 0, firstDegree: 2, networkingMinutes: 45, travelMinutes: 30 },
};

export async function demoPlanEventFacts(): Promise<PlanEventFact[]> {
  return DEMO_EVENTS.map((event) => ({
    eventId: event.id,
    facts: { ...UNKNOWN_EVENT_FACTS, attendeeSource: "none", expected: {}, timeslot: tokyoTimeslot(event.startsAt), ...DEMO_FACTS[event.id] },
    startsAt: event.startsAt,
    title: event.title,
    venue: event.venue,
  }));
}

