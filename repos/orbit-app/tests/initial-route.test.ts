import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveInitialRouteHref } from "../src/view-models/initial-route";

describe("resolveInitialRouteHref", () => {
  it("defaults to the AI tab", () => {
    assert.equal(resolveInitialRouteHref(undefined), "/ai");
  });

  it("accepts supported app tabs", () => {
    assert.equal(resolveInitialRouteHref("events"), "/events");
    assert.equal(resolveInitialRouteHref("/contacts"), "/contacts");
    assert.equal(resolveInitialRouteHref("dashboard"), "/dashboard");
    assert.equal(resolveInitialRouteHref("followups"), "/followups");
    assert.equal(resolveInitialRouteHref("home"), "/ai");
    assert.equal(resolveInitialRouteHref("home/events"), "/home/events");
    assert.equal(resolveInitialRouteHref("inbox"), "/inbox");
    assert.equal(resolveInitialRouteHref("login-admin"), "/login-admin");
    assert.equal(resolveInitialRouteHref("chat"), "/chat");
    assert.equal(resolveInitialRouteHref("agent"), "/agent");
    assert.equal(resolveInitialRouteHref("admin"), "/admin");
    assert.equal(resolveInitialRouteHref("admin/events"), "/admin/events");
    assert.equal(resolveInitialRouteHref("admin/access"), "/admin/access");
    assert.equal(resolveInitialRouteHref("account"), "/account");
    assert.equal(resolveInitialRouteHref("account/login"), "/account/login");
    assert.equal(
      resolveInitialRouteHref("account/mobile-google"),
      "/account/login"
    );
    assert.equal(
      resolveInitialRouteHref("/account/mobile-google"),
      "/account/login"
    );
    assert.equal(
      resolveInitialRouteHref("account/permissions"),
      "/account/permissions"
    );
    assert.equal(resolveInitialRouteHref("account/signup"), "/account/signup");
    assert.equal(
      resolveInitialRouteHref("account/forgot-password"),
      "/account/forgot-password"
    );
    assert.equal(resolveInitialRouteHref("settings/api"), "/settings/api");
    assert.equal(resolveInitialRouteHref("settings"), "/settings");
    assert.equal(resolveInitialRouteHref("today"), "/today");
    assert.equal(resolveInitialRouteHref("party"), "/party");
    assert.equal(resolveInitialRouteHref("platform"), "/platform");
    assert.equal(resolveInitialRouteHref("register"), "/register");
    assert.equal(resolveInitialRouteHref(" profile "), "/profile");
  });

  it("accepts supported detail routes for simulator review", () => {
    assert.equal(resolveInitialRouteHref("contacts/new"), "/contacts/new");
    assert.equal(
      resolveInitialRouteHref("ai/live-orbit-agent-conversation"),
      "/ai/live-orbit-agent-conversation"
    );
    assert.equal(
      resolveInitialRouteHref("contacts/contact_029"),
      "/contacts/contact_029"
    );
    assert.equal(resolveInitialRouteHref("contacts/graph"), "/contacts/graph");
    assert.equal(
      resolveInitialRouteHref("contacts/dashboard"),
      "/contacts/dashboard"
    );
    assert.equal(
      resolveInitialRouteHref("chat/demo-conversation-1"),
      "/chat/demo-conversation-1"
    );
    assert.equal(
      resolveInitialRouteHref("/events/event_signup_03"),
      "/events/event_signup_03"
    );
    assert.equal(
      resolveInitialRouteHref("events/event_signup_03/attendees"),
      "/events/event_signup_03/attendees"
    );
    assert.equal(
      resolveInitialRouteHref("events/event_signup_03/register"),
      "/events/event_signup_03/register"
    );
    assert.equal(
      resolveInitialRouteHref("schedule/events/event_signup_03"),
      "/schedule/events/event_signup_03"
    );
    assert.equal(
      resolveInitialRouteHref("register/event_signup_03"),
      "/register/event_signup_03"
    );
    assert.equal(
      resolveInitialRouteHref("o/event_signup_03"),
      "/o/event_signup_03"
    );
    assert.equal(resolveInitialRouteHref("party/checkin"), "/party/checkin");
    assert.equal(resolveInitialRouteHref("party/graph"), "/party/graph");
  });

  it("normalizes web shell aliases for native startup routes", () => {
    assert.equal(resolveInitialRouteHref("/app/events"), "/events");
    assert.equal(resolveInitialRouteHref("/explore"), "/events");
    assert.equal(resolveInitialRouteHref("/home/cards"), "/contacts/list");
    assert.equal(resolveInitialRouteHref("/app/home/cards"), "/contacts/list");
    assert.equal(resolveInitialRouteHref("/home/cards/scan"), "/contacts/new");
    assert.equal(
      resolveInitialRouteHref("/app/home/cards/scan"),
      "/contacts/new"
    );
    assert.equal(
      resolveInitialRouteHref("/home/cards/contact_029"),
      "/contacts/contact_029"
    );
    assert.equal(resolveInitialRouteHref("/home/schedule"), "/followups");
    assert.equal(resolveInitialRouteHref("/home/profile"), "/profile");
    assert.equal(
      resolveInitialRouteHref("/agent?panel=events"),
      "/agent?panel=events"
    );
    assert.equal(
      resolveInitialRouteHref("/events/event_signup_03?lang=zh"),
      "/events/event_signup_03?lang=zh"
    );
    assert.equal(
      resolveInitialRouteHref("/register?code=event_signup_03"),
      "/register/event_signup_03"
    );
    assert.equal(
      resolveInitialRouteHref("/app/register?code=event_signup_03"),
      "/register/event_signup_03"
    );
  });

  it("preserves query context for supported native startup routes", () => {
    assert.equal(
      resolveInitialRouteHref("/account/login?next=%2Fprofile"),
      "/account/login?next=%2Fprofile"
    );
    assert.equal(
      resolveInitialRouteHref("/contacts?query=ai&status=active"),
      "/contacts/list?query=ai&status=active"
    );
    assert.equal(
      resolveInitialRouteHref("/app/contacts?query=tokyo"),
      "/contacts/list?query=tokyo"
    );
    assert.equal(
      resolveInitialRouteHref("/app/contacts?source=event_import"),
      "/contacts/list?source=event_import"
    );
    assert.equal(
      resolveInitialRouteHref("/party?eventId=event_signup_03"),
      "/party?eventId=event_signup_03"
    );
    assert.equal(
      resolveInitialRouteHref("/party/checkin?eventId=event_signup_03"),
      "/party/checkin?eventId=event_signup_03"
    );
    assert.equal(
      resolveInitialRouteHref(
        "/party?code=event_signup_03&code=event_signup_04&view=graph#relationship-map"
      ),
      "/party?code=event_signup_03&code=event_signup_04&view=graph#relationship-map"
    );
    assert.equal(
      resolveInitialRouteHref(
        "/contacts/contact_029?tab=history#recent-activity"
      ),
      "/contacts/contact_029?tab=history#recent-activity"
    );
    assert.equal(
      resolveInitialRouteHref("/inbox?contactId=contact_029"),
      "/inbox?contactId=contact_029"
    );
  });

  it("falls back to the AI tab for unsupported values", () => {
    assert.equal(resolveInitialRouteHref("unknown-route"), "/ai");
    assert.equal(resolveInitialRouteHref("contacts/../../settings"), "/ai");
  });
});
