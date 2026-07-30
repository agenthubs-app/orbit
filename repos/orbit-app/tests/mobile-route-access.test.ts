import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import {
  isPrivateMobileRoute,
  mobileAuthReturnHref,
  mobileLoginHref
} from "../src/view-models/mobile-route-access";
import {
  nextHrefForAccountAuthSubmit,
  normalizedNext
} from "../src/view-models/account-auth";

test("mobile actor workspaces share one private-route policy", () => {
  for (const pathname of [
    "/admin",
    "/admin/events",
    "/agent",
    "/ai/conversation-1",
    "/chat/thread-1",
    "/contacts/person-1",
    "/dashboard",
    "/followups",
    "/home/events",
    "/inbox",
    "/events/event-1/attendees",
    "/events/event-1/register",
    "/party/checkin",
    "/platform",
    "/profile",
    "/schedule/events/event-1",
    "/settings/api",
    "/today",
    "/app/contacts/person-1"
  ]) {
    assert.equal(isPrivateMobileRoute(pathname), true, pathname);
  }
});

test("mobile discovery, account and admin entry routes stay public", () => {
  for (const pathname of [
    "/",
    "/app",
    "/account",
    "/account/login",
    "/account/permissions",
    "/admin/access",
    "/events",
    "/events/event-1",
    "/login-admin",
    "/o/orbit",
    "/register",
    "/register/invite-code"
  ]) {
    assert.equal(isPrivateMobileRoute(pathname), false, pathname);
  }
});

test("auth return href preserves query controls without duplicating route params", () => {
  assert.equal(
    mobileAuthReturnHref("/contacts/contact-1", {
      id: "contact-1",
      q: "林 美咲",
      tag: ["大阪", "投资"]
    }),
    "/contacts/contact-1?q=%E6%9E%97+%E7%BE%8E%E5%92%B2&tag=%E5%A4%A7%E9%98%AA&tag=%E6%8A%95%E8%B5%84"
  );
  assert.equal(
    mobileLoginHref("/app/today", { filter: "pending" }),
    "/account/login?next=%2Ftoday%3Ffilter%3Dpending"
  );
});

test("auth return parameter ownership follows the matched route instead of global key names", () => {
  for (const pathname of ["/party", "/party/checkin", "/party/graph"]) {
    assert.equal(
      mobileAuthReturnHref(pathname, {
        code: ["event-1", "event-2"],
        view: "graph"
      }),
      `${pathname}?code=event-1&code=event-2&view=graph`
    );
  }

  for (const [pathname, params, expected] of [
    ["/ai/conversation-1", { id: "conversation-1", panel: "history" }, "/ai/conversation-1?panel=history"],
    ["/chat/thread-1", { id: "thread-1", tab: "details" }, "/chat/thread-1?tab=details"],
    ["/contacts/contact-1", { id: "contact-1", q: "林" }, "/contacts/contact-1?q=%E6%9E%97"],
    ["/events/event-1/register", { id: "event-1", step: "questions" }, "/events/event-1/register?step=questions"],
    ["/schedule/events/event-1", { id: "event-1", view: "day" }, "/schedule/events/event-1?view=day"],
    ["/register/invite-1", { code: "invite-1", source: "qr" }, "/register/invite-1?source=qr"],
    ["/o/orbit", { slug: "orbit", source: "share" }, "/o/orbit?source=share"]
  ] as const) {
    assert.equal(mobileAuthReturnHref(pathname, params), expected, pathname);
  }

  assert.equal(
    mobileAuthReturnHref("/contacts/list", {
      id: "query-owned-on-static-route",
      q: "tokyo"
    }),
    "/contacts/list?id=query-owned-on-static-route&q=tokyo"
  );
});

test("party query, duplicate values and fragment survive the complete login return", () => {
  const expected =
    "/party?code=event-1&code=event-2&view=graph#relationship-map";
  const loginHref = mobileLoginHref("/party", {
    "#": "relationship-map",
    code: ["event-1", "event-2"],
    view: "graph"
  });
  const encodedNext = new URL(loginHref, "https://orbit.invalid").searchParams.get(
    "next"
  );

  assert.equal(
    loginHref,
    "/account/login?next=%2Fparty%3Fcode%3Devent-1%26code%3Devent-2%26view%3Dgraph%23relationship-map"
  );
  assert.equal(encodedNext, expected);
  assert.equal(normalizedNext(encodedNext ?? undefined), expected);
  assert.equal(
    nextHrefForAccountAuthSubmit({
      email: "party-return@example.invalid",
      mode: "login",
      next: encodedNext ?? undefined
    }),
    expected
  );
});

test("root navigator stays mounted while grouped and root-level private entries gate their screens", () => {
  const rootSource = readFileSync(
    new URL("../app/_layout.tsx", import.meta.url),
    "utf8"
  );
  const boundarySource = readFileSync(
    new URL("../src/components/OrbitRouteAccessBoundary.tsx", import.meta.url),
    "utf8"
  );
  const appGroupSource = readFileSync(
    new URL("../app/(app)/_layout.tsx", import.meta.url),
    "utf8"
  );
  const provider = rootSource.indexOf("<OrbitAuthSessionProvider>");
  const boundary = rootSource.indexOf("<OrbitRouteAccessBoundary");

  assert.ok(provider >= 0);
  assert.ok(boundary > provider);
  assert.match(boundarySource, /<Stack screenOptions=/u);
  assert.match(boundarySource, /return <Redirect href=\{mobileLoginHref/u);
  assert.match(boundarySource, /withOrbitPrivateRoute/u);
  assert.match(
    appGroupSource,
    /<OrbitPrivateRouteBoundary enabled=\{isPrivateMobileRoute\(pathname\)\}>/u
  );
});

test("every root-level private entry uses the shared render gate", () => {
  const appRoot = new URL("../app", import.meta.url);
  const privateEntryPaths = [
    "admin.tsx",
    "admin/events.tsx",
    "agent.tsx",
    "ai/[id].tsx",
    "chat.tsx",
    "chat/[id].tsx",
    "contacts/[id].tsx",
    "contacts/all-actions.tsx",
    "contacts/dashboard.tsx",
    "contacts/graph.tsx",
    "contacts/intros.tsx",
    "contacts/list.tsx",
    "contacts/new.tsx",
    "contacts/pipeline.tsx",
    "dashboard.tsx",
    "events/[id]/attendees.tsx",
    "events/[id]/register.tsx",
    "followups.tsx",
    "home.tsx",
    "home/events.tsx",
    "party.tsx",
    "party/checkin.tsx",
    "party/graph.tsx",
    "platform.tsx",
    "schedule/events/[id].tsx",
    "settings.tsx",
    "settings/api.tsx",
    "today.tsx"
  ];
  const discoveredPrivateEntries = readdirSync(appRoot, {
    recursive: true,
    withFileTypes: true
  })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".tsx") &&
        entry.name !== "_layout.tsx"
    )
    .map((entry) =>
      relative(
        appRoot.pathname,
        join(entry.parentPath, entry.name)
      ).replaceAll("\\", "/")
    )
    .filter((path) => {
      const route = `/${path
        .replace(/\.tsx$/u, "")
        .replace(/(?:^|\/)index$/u, "")
        .replace(/(?:^|\/)\([^/]+\)/gu, "")}`.replace(/\/+/gu, "/");

      return !path.startsWith("(app)/") && isPrivateMobileRoute(route);
    })
    .sort();

  assert.deepEqual(discoveredPrivateEntries, [...privateEntryPaths].sort());

  for (const path of privateEntryPaths) {
    const source = readFileSync(
      new URL(`../app/${path}`, import.meta.url),
      "utf8"
    );

    assert.match(source, /withOrbitPrivateRoute/u, path);
  }
});
