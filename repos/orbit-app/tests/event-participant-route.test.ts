import assert from "node:assert/strict";
import test from "node:test";
import { resolveSupportedInitialRouteHref } from "../src/view-models/initial-route";
import { notificationHrefFromDeepLink } from "../src/notifications/notification-model";
import { inboxNotificationActions } from "../src/view-models/inbox-notification-actions";
import { mobileAuthReturnHref, isPrivateMobileRoute } from "../src/view-models/mobile-route-access";

const href = "/app/events/event_1?participant=participant%3Aone#event-matchmaking-title";
const native = "/events/event_1/participants/participant%3Aone";
test("exact canonical participant notification routes across cold start, inbox and push", () => {
  assert.equal(resolveSupportedInitialRouteHref(href), native);
  assert.equal(notificationHrefFromDeepLink(href), native);
  assert.equal(resolveSupportedInitialRouteHref(native), native);
  const actions = inboxNotificationActions({ state: "success", notificationInteractions: {}, reminders: [{ reminderId: "r", href }] });
  assert.equal(actions.get("r")?.href, native);
  assert.equal(isPrivateMobileRoute(native), true);
  assert.equal(mobileAuthReturnHref(native, { id: "event_1", participantId: "participant:one" }), native);
});
for (const invalid of [
  href + "x", href.replace("participant=", "other="), href.replace("#", "&extra=x#"),
  href.replace("#", "&participant=other#"), href.replace("participant%3Aone", ""),
  href.replace("participant%3Aone", "%2E%2E"), href.replace("participant%3Aone", "%252F"),
  href.replace("participant%3Aone", "%2Fescape"), href.replace("participant%3Aone", "%ZZ"),
  "https://evil.example" + href, native + "?actorId=other", native + "#anything",
]) test(`reject unsupported participant destination ${invalid}`, () => {
  assert.equal(notificationHrefFromDeepLink(invalid), null);
  assert.equal(resolveSupportedInitialRouteHref(invalid), null);
});
