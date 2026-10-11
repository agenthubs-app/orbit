import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveInitialRouteHref } from "../src/view-models/initial-route";

describe("resolveInitialRouteHref", () => {
  it("R12: old card batch links land on the new 名刺 pages; invalid identifiers fall back to home", () => {
    const encoded = "batch%3A%2F%20%E7%A9%BA";
    // v2 batches (old batch2/<id> and new scan/<id>) open the batch page, query and hash kept.
    assert.equal(resolveInitialRouteHref(`/app/contacts/new/batch2/${encoded}?tab=review#card`), `/contacts/new/scan/${encoded}?tab=review#card`);
    assert.equal(resolveInitialRouteHref(`/contacts/new/scan/${encoded}`), `/contacts/new/scan/${encoded}`);
    // v1 batches and v1 card file imports cannot be opened any more: 名刺をスキャン with the notice.
    assert.equal(resolveInitialRouteHref(`/app/contacts/new/batch/${encoded}?tab=review#card`), "/contacts/new/scan?from=legacy");
    assert.equal(resolveInitialRouteHref("/contacts/new/import/123e4567-e89b-12d3-a456-426614174000"), "/contacts/new/scan?from=legacy");
    assert.equal(resolveInitialRouteHref("/contacts/new/batch2"), "/contacts/new/scan");
    for (const prefix of ["batch", "batch2", "scan"]) {
      for (const id of ["%ZZ", "%2E", "%2E%2E", "", "a/extra"]) assert.equal(resolveInitialRouteHref(`/contacts/new/${prefix}/${id}`), "/home");
    }
    for (const page of ["scan", "manual", "drafts"]) assert.equal(resolveInitialRouteHref(`/app/contacts/new/${page}`), `/contacts/new/${page}`);
    assert.equal(resolveInitialRouteHref("/contacts/new/drafts?eventId=e1"), "/contacts/new/drafts?eventId=e1");
    // Web's old 人脈を追加 queries.
    assert.equal(resolveInitialRouteHref(`/app/contacts/new?job=${encoded}`), `/contacts/new/scan/${encodeURIComponent("batch:/ 空")}`);
    assert.equal(resolveInitialRouteHref("/app/contacts/new?method=scan"), "/contacts/new/scan");
    assert.equal(resolveInitialRouteHref("/app/contacts/new?add=manual"), "/contacts/new/manual");
  });
  it("opens only the experience operation route, including encoded event identifiers", () => {
    assert.equal(resolveInitialRouteHref("/app/events/event%3A%2F%20%E7%A9%BA/operations/experience?tab=preview#questions"), "/events/event%3A%2F%20%E7%A9%BA/operations/experience?tab=preview#questions");
    assert.equal(resolveInitialRouteHref("/events/e/operations/experience/extra"), "/home");
    assert.equal(resolveInitialRouteHref("/events/e/operations/unknown"), "/home");
    assert.equal(resolveInitialRouteHref("/events/%ZZ/operations/experience"), "/home");
    assert.equal(resolveInitialRouteHref("/events/event.demo!~/operations/experience"), "/events/event.demo!~/operations/experience");
    assert.equal(resolveInitialRouteHref("/events/%2E%2E/operations/experience"), "/home");
  });
  it("supports the public reset entry and preserves its fragment", () => {
    assert.equal(resolveInitialRouteHref("account/reset-password"), "/account/reset-password");
    assert.ok(resolveInitialRouteHref("/app/account/reset-password#token=redacted") === "/account/reset-password#token=redacted");
  });
  it("defaults to the home dashboard", () => {
    assert.equal(resolveInitialRouteHref(undefined), "/home");
  });

  it("accepts supported app tabs", () => {
    assert.equal(resolveInitialRouteHref("ai"), "/ai");
    assert.equal(resolveInitialRouteHref("events"), "/events");
    assert.equal(resolveInitialRouteHref("/contacts"), "/contacts");
    assert.equal(resolveInitialRouteHref("dashboard"), "/dashboard");
    assert.equal(resolveInitialRouteHref("followups"), "/task?seg=todo&scope=relationship");
    assert.equal(resolveInitialRouteHref("home"), "/home");
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

  it("supports only the exact compatibility route entries and retains their query", () => {
    assert.equal(
      resolveInitialRouteHref("/agent/actions?entry=action%3Aone"),
      "/agent/actions?entry=action%3Aone"
    );
    assert.equal(
      resolveInitialRouteHref("/profile/continue?next=%2Fevents%2Fevent-1"),
      "/profile/continue?next=%2Fevents%2Fevent-1"
    );
    assert.equal(resolveInitialRouteHref("/agent/actions/other"), "/home");
    assert.equal(resolveInitialRouteHref("/profile/continue/other"), "/home");
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
      resolveInitialRouteHref("/app/events/event_signup_03/live"),
      "/events/event_signup_03/live"
    );
    assert.equal(resolveInitialRouteHref("events/..%2F/live"), resolveInitialRouteHref("unknown-route"));
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
    assert.equal(resolveInitialRouteHref("/home/schedule"), "/task?seg=todo&scope=relationship");
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

  it("falls back to the home dashboard for unsupported values", () => {
    assert.equal(resolveInitialRouteHref("unknown-route"), "/home");
    assert.equal(resolveInitialRouteHref("contacts/../../settings"), "/home");
  });
});

describe("R15 invite links", () => {
  it("https://<invite host>/i/<code>, orbit://i/<code>, /i/<code> and /i open the invite pages with a tidied code", () => {
    for (const route of [
      "https://orbitailink.com/i/K7QX-2M9P",
      "https://www.orbitailink.com/i/k7qx2m9p?utm_source=line#x",
      "orbit://i/K7QX-2M9P",
      "orbit:///i/k7qx-2m9p",
      "/i/K7QX-2M9P",
      "/i/k7qx%202m9p",
      "i/K7QX2M9P",
    ]) assert.equal(resolveInitialRouteHref(route), "/i/K7QX-2M9P", route);
    assert.equal(resolveInitialRouteHref("/i"), "/i");
    assert.equal(resolveInitialRouteHref("orbit://i"), "/i");
    assert.equal(resolveInitialRouteHref("https://orbitailink.com/i/"), "/i");
    assert.equal(resolveInitialRouteHref("/contacts/new/invite"), "/contacts/new/invite");
  });
  it("a malformed code, an unknown host or a deeper path goes home", () => {
    for (const route of [
      "/i/K7QX-2M9O", // O is not in the code alphabet
      "/i/K7QX-2M9",
      "/i/%ZZ",
      "/i/K7QX-2M9P/extra",
      "orbit://i/SATO",
      "https://evil.example/i/K7QX-2M9P",
      "https://orbitailink.com.evil.example/i/K7QX-2M9P",
      "//orbitailink.com/i/K7QX-2M9P",
    ]) assert.equal(resolveInitialRouteHref(route), "/home", route);
  });
  it("the API host is an invite host too (dev links point at the local server)", async () => {
    const { inviteRouteHref, inviteLinkHosts } = await import("../src/view-models/invite-route");
    const hosts = inviteLinkHosts({ apiBaseUrl: "http://localhost:3000", publicOrigin: "https://invite.example" });
    assert.equal(inviteRouteHref("http://localhost:3000/i/K7QX-2M9P", hosts), "/i/K7QX-2M9P");
    assert.equal(inviteRouteHref("https://invite.example/i/K7QX-2M9P", hosts), "/i/K7QX-2M9P");
    assert.equal(inviteRouteHref("https://other.example/i/K7QX-2M9P", hosts), undefined);
    assert.equal(inviteRouteHref("/inbox", hosts), undefined);
  });
  it("ログイン / 登録 come back to /i/<code> (next is kept, no onboarding detour for the route itself)", async () => {
    const { normalizedNext } = await import("../src/view-models/account-auth");
    assert.equal(normalizedNext("/i/K7QX-2M9P"), "/i/K7QX-2M9P");
    assert.equal(normalizedNext("/i/K7QX-2M9O"), "/home");
    assert.equal(normalizedNext("//evil.example/i/K7QX-2M9P"), "/home");
  });
});
