import assert from "node:assert/strict";
import test from "node:test";

import { currentHref, trackCurrentHref } from "../src/components/shell-navigation";
import { createAuthReturnStorage } from "../src/storage/auth-return-storage";
import { createProfileOnboardingStorage } from "../src/storage/profile-onboarding-storage";
import { loginHrefReturningTo, normalizedNext, signedInHref } from "../src/view-models/account-auth";
import { APP_ROUTES } from "../src/view-models/app-routes";
import { onboardingDestination } from "../src/view-models/profile-onboarding";
import { returnHref } from "../src/view-models/return-href";

const FLOW = ["/account/change-password", "/account/forgot-password", "/account/login", "/account/mobile-google", "/account/reset-password", "/account/signup", "/login-admin", "/profile/continue", "/profile/onboarding"];
const NEVER = ["/", "/account/deleted", "/force-update", "/maintenance"];
const REMAPPED = ["/followups", "/register", "/tasks", "/task", "/i", "/i/[code]"]; // open another address of the same page

test("every page of the App can be returned to, with its query and fragment — except the flow's own pages and the gates", () => {
  for (const route of APP_ROUTES) {
    if (FLOW.includes(route) || NEVER.includes(route) || REMAPPED.includes(route)) continue;
    const href = `${route.replace(/\[[^\]]+\]/gu, "abc123")}?tab=x#part`;
    if (/\/participants\//u.test(route)) assert.ok(returnHref(href.split(/[?#]/u)[0]), route);
    else assert.equal(returnHref(href), href, route);
  }
  for (const route of [...FLOW, ...NEVER]) assert.equal(returnHref(route), null, route);
  for (const route of FLOW) assert.equal(returnHref(`${route}?next=${encodeURIComponent("/notes/n1?from=home")}`), "/notes/n1?from=home", route);
});

test("only addresses of this App", () => {
  for (const value of [undefined, null, "", "home", "https://evil.test/home", "//evil.test", "/\\evil.test", "/\t/evil.test", "/home\n", "javascript:alert(1)", "/nowhere", "/events/../admin", "/events/%2e%2e/admin", "/events/a%2F..%2Fb", "/events/%ZZ", "/events//e1", "/i/../admin", "/i/not a code", "/account/login?next=//evil.test", "/account/login?next=/account/signup"]) {
    assert.equal(returnHref(value === "/home\n" ? "/home\nx" : value), null, String(value));
  }
  assert.equal(returnHref(["/task", "/home"]), "/task");
  assert.equal(returnHref("/app/events/e1?tab=x"), "/events/e1?tab=x");
  assert.equal(returnHref("/events/e1/"), "/events/e1");
  let deep = "/task";
  for (let level = 0; level < 5; level += 1) deep = `/account/login?next=${encodeURIComponent(deep)}`;
  assert.equal(returnHref(deep), "/task");
  assert.equal(returnHref(`/account/login?next=${encodeURIComponent(deep)}`), null, "a wrapped chain ends somewhere");
});

test("one rule all the way: login, Google, onboarding; Home only when there is nothing to return to", () => {
  for (const next of ["/events/e1?tab=people", "/inbox/notifications/n1", "/o/some-organizer", "/e/summer-meetup", "/i/ABCD-EFGH", "/account"]) {
    assert.equal(normalizedNext(next), next);
    assert.equal(signedInHref({ next }), `/profile/onboarding?next=${encodeURIComponent(next)}`);
    assert.equal(onboardingDestination(next), next);
    assert.equal(loginHrefReturningTo(next), `/account/login?next=${encodeURIComponent(next)}`);
  }
  for (const nothing of [undefined, "/", "/account/login", "https://evil.test"]) {
    assert.equal(normalizedNext(nothing), "/home");
    assert.equal(loginHrefReturningTo(nothing), "/account/login");
  }
  assert.equal(loginHrefReturningTo("/home"), "/account/login");
  trackCurrentHref("/contacts/c1?tab=memo");
  assert.equal(loginHrefReturningTo(currentHref()), "/account/login?next=%2Fcontacts%2Fc1%3Ftab%3Dmemo", "a session that ends while a page is open");
});

const memory = () => { const store = new Map<string, string>(); return { store, adapter: { getItem: async (key: string) => store.get(key) ?? null, setItem: async (key: string, value: string) => { store.set(key, value); }, removeItem: async (key: string) => { store.delete(key); } } }; };

test("onboarding left half way remembers where it leads, per account and server, for 30 days; Home never replaces it", async () => {
  const { store, adapter } = memory();
  const storage = createProfileOnboardingStorage(adapter);
  const scope = { actorId: "a1", baseUrl: "https://orbit.test" };
  await storage.writeReturn(scope, "/events/e1?tab=x");
  await storage.writeReturn(scope, "/home");
  assert.equal(await storage.readReturn(scope), "/events/e1?tab=x");
  assert.equal(await storage.readReturn({ ...scope, actorId: "a2" }), null);
  assert.equal(await storage.readReturn({ ...scope, baseUrl: "https://other.test" }), null);
  await storage.writeReturn(scope, "/task?seg=plan");
  assert.equal(await storage.readReturn(scope), "/task?seg=plan", "a later page wins");
  const [key] = [...store.keys()];
  store.set(key!, JSON.stringify({ href: "/task", at: Date.now() - 31 * 24 * 60 * 60 * 1000 }));
  assert.equal(await storage.readReturn(scope), null);
  store.set(key!, JSON.stringify({ href: "https://evil.test", at: Date.now() }));
  assert.equal(await storage.readReturn(scope), null);
  store.set(key!, "{");
  assert.equal(await storage.readReturn(scope), null);
  await storage.writeReturn(scope, "/task");
  await storage.clearReturn(scope);
  assert.equal(await storage.readReturn(scope), null);
});

test("a trip to the mail or to Google remembers the page on this device for half an hour", async () => {
  const { adapter } = memory();
  let now = 1_000;
  const storage = createAuthReturnStorage(adapter, () => now);
  await storage.remember("/events/e1");
  assert.equal(await storage.read(), "/events/e1");
  now += 30 * 60 * 1000;
  assert.equal(await storage.read(), null);
  await storage.remember("/events/e2");
  await storage.remember("/home");
  assert.equal(await storage.read(), null, "a later trip from nowhere does not lead to the earlier page");
  const broken = createAuthReturnStorage({ getItem: async () => { throw new Error("x"); }, setItem: async () => { throw new Error("x"); }, removeItem: async () => undefined });
  await broken.remember("/events/e1");
  assert.equal(await broken.read(), null);
});
