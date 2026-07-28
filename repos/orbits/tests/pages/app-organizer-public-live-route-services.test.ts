import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveOrganizer<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

async function withMockOrganizer<T>(run: () => Promise<T>): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = "mock";

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("/app/o/[slug] page uses a live-capable organizer loader instead of the legacy landing view model", () => {
  const pageSource = source("app/(app)/app/o/[slug]/page.tsx");
  const organizerSource = source("app/(app)/app/o/orbit-real-organizer-public.tsx");

  assert.match(pageSource, /loadAppOrganizerPublicRouteViewModel/);
  assert.match(pageSource, /StateView/);
  assert.match(pageSource, /OrbitRealOrganizerPublic/);
  assert.doesNotMatch(pageSource, /getOrbitOrganizerPublicViewModel/);
  assert.match(organizerSource, /PublicTopNav active="events"/);
  assert.match(
    organizerSource,
    /href=\{productHref\(`\/events\/\$\{event\.code\}`\)\}/,
  );
  assert.match(organizerSource, /data-orbit-real-page="organizer-public"/);
  assert.match(organizerSource, /imageAlt=\{name\}/);
  assert.doesNotMatch(organizerSource, /4,200\+|Satisfaction|满意度/);
});

test("app organizer public route loader returns organizer events in mock mode", async () => {
  await withMockOrganizer(async () => {
    const { loadAppOrganizerPublicRouteViewModel } = await import(
      "../../app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model"
    );
    const routeModel = await loadAppOrganizerPublicRouteViewModel({
      mode: "mock",
      slug: "demo-event-1",
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.ok(routeModel.organizer.name);
      assert.match(routeModel.organizer.handle, /1 场|1 event/);
      assert.ok(routeModel.organizer.events.length > 0);
      assert.equal(routeModel.organizer.events[0]?.id, "demo-event-1");
    }
  });
});

test("public catalogue event codes resolve to an organizer without exposing attendee names", async () => {
  const { loadAppOrganizerPublicRouteViewModel } = await import(
    "../../app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model"
  );
  const routeModel = await loadAppOrganizerPublicRouteViewModel({
    slug: "evt01",
  });

  assert.equal(routeModel.state, "success");
  if (routeModel.state === "success") {
    assert.equal(routeModel.organizer.name, "Orbit 人脉测试空间");
    assert.ok(routeModel.organizer.events.length > 0);
    assert.ok(
      routeModel.organizer.events.some((event) => event.id === "event_01"),
    );
    assert.ok(
      routeModel.organizer.events.every(
        (event) =>
          event.stats.attendees.length === 0 &&
          event.stats.authed === false &&
          event.stats.youRsvped === false &&
          event.youRsvped === false,
      ),
    );
    assert.ok(
      routeModel.organizer.events.reduce(
        (sum, event) => sum + event.participantCount,
        0,
      ) > 0,
    );
    const { OrbitRealOrganizerPublic } = await import(
      "../../app/(app)/app/o/orbit-real-organizer-public"
    );
    const html = renderToStaticMarkup(
      createElement(OrbitRealOrganizerPublic, {
        viewModel: routeModel.organizer,
      }),
    );
    const totalAttendees = routeModel.organizer.events.reduce(
      (sum, event) => sum + event.participantCount,
      0,
    );

    assert.match(
      html,
      new RegExp(`>${routeModel.organizer.events.length}</div>`),
    );
    assert.match(html, new RegExp(`>${totalAttendees}</div>`));
    assert.doesNotMatch(html, /4,200\+|满意度/);
  }
});

test("app organizer public route loader does not enter private storage for an unknown public slug", async () => {
  await withUnconfiguredLiveOrganizer(async () => {
    const { loadAppOrganizerPublicRouteViewModel } = await import(
      "../../app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model"
    );
    const routeModel = await loadAppOrganizerPublicRouteViewModel({
      slug: "unknown-organizer",
    });

    assert.equal(routeModel.state, "route-state");

    if (routeModel.state === "route-state") {
      assert.equal(routeModel.routeState.scenario, "empty");
      assert.equal(
        routeModel.routeState.errorCode,
        "PUBLIC_ORGANIZER_NOT_FOUND",
      );
      assert.deepEqual(routeModel.routeState.evidenceIds, [
        "PUBLIC_ORGANIZER_NOT_FOUND",
        "public-catalogue-organizer-not-found",
      ]);
      assert.equal(routeModel.routeState.copy.title, "Organizer not found");
    }
  });
});

test("app organizer public route state presents the active language without changing its boundary", async () => {
  const {
    loadAppOrganizerPublicRouteViewModel,
    presentAppOrganizerPublicRouteState,
  } = await import(
    "../../app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model"
  );
  const routeModel = await loadAppOrganizerPublicRouteViewModel({
    slug: "unknown-organizer",
  });

  assert.equal(routeModel.state, "route-state");
  if (routeModel.state === "route-state") {
    const zh = presentAppOrganizerPublicRouteState(
      routeModel.routeState,
      "zh",
    );
    const en = presentAppOrganizerPublicRouteState(
      routeModel.routeState,
      "en",
    );

    assert.equal(zh.scenario, "empty");
    assert.equal(zh.errorCode, "PUBLIC_ORGANIZER_NOT_FOUND");
    assert.equal(zh.copy.title, "未找到该主办方");
    assert.equal(zh.recoveryActions[0]?.label, "返回活动");
    assert.equal(en.copy.title, "Organizer not found");
    assert.equal(en.recoveryActions[0]?.label, "Return to events");
  }
});

test("app organizer public page renders the mock success page without client-only helper calls", async () => {
  await withMockOrganizer(async () => {
    const Page = (await import("../../app/(app)/app/o/[slug]/page"))
      .default as (props: {
      params: Promise<{ slug: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ slug: "demo-event-1" }),
        searchParams: Promise.resolve({ mode: "mock" }),
      }),
    );

    assert.match(html, /data-orbit-real-page="organizer-public"/);
    assert.match(html, /Climate founders dinner/);
    assert.doesNotMatch(html, /Attempted to call productHref/);
  });
});

test("app organizer public page renders a controlled live failure when event storage is unconfigured", async () => {
  await withUnconfiguredLiveOrganizer(async () => {
    const Page = (await import("../../app/(app)/app/o/[slug]/page"))
      .default as (props: {
      params: Promise<{ slug: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ slug: "event_01" }),
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /主办方页面暂时无法加载/);
    assert.match(html, /页面没有使用模拟数据生成主办方信息/);
    assert.match(
      html,
      /EVENTS_LIVE_STORE_UNCONFIGURED|events-live-store-unconfigured/,
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-organizer-public-route-state/);
  });
});
