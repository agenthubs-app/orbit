// R27：旧的现场 / 参会者 / 派对地址都跳到新的会場モード（/events/[id]/live 的 tab / view / person 参数）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { partyRedirectHref, venueHref } from "../src/screens/events/v2/venue-links";

test("venue links carry only the non-default tab, the map view and the person", () => {
  assert.equal(venueHref("ev:1"), "/events/ev%3A1/live");
  assert.equal(venueHref("ev:1", { tab: "now" }), "/events/ev%3A1/live");
  assert.equal(venueHref("ev:1", { tab: "people", person: "jp-shimizu" }), "/events/ev%3A1/live?tab=people&person=jp-shimizu");
  assert.equal(venueHref("ev:1", { tab: "people", view: "map" }), "/events/ev%3A1/live?tab=people&view=map");
});

test("old party links open the venue of the named event, else the event list", () => {
  assert.equal(partyRedirectHref({ eventId: "ev1" }, "overview"), "/events/ev1/live");
  assert.equal(partyRedirectHref({ code: ["ev2"] }, "checkin"), "/events/ev2/live");
  assert.equal(partyRedirectHref({ eventId: "ev3" }, "graph"), "/events/ev3/live?tab=people&view=map");
  assert.equal(partyRedirectHref({ eventId: "  " }, "overview"), "/events");
});

test("the attendee and participant routes redirect into the venue people tab", () => {
  const attendees = readFileSync(new URL("../app/events/[id]/attendees.tsx", import.meta.url), "utf8");
  const participant = readFileSync(new URL("../app/events/[id]/participants/[participantId].tsx", import.meta.url), "utf8");
  assert.match(attendees, /venueHref\(eventId, \{ tab: "people" \}\)/);
  assert.match(participant, /venueHref\(eventId, \{ tab: "people", \.\.\.\(participant \? \{ person: participant \} : \{\}\) \}\)/);
});
