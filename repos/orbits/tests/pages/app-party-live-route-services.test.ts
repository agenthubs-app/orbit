import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

async function withUnconfiguredLiveParty<T>(
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

async function withMockParty<T>(run: () => Promise<T>): Promise<T> {
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

test("/app/party routes use a live-capable party loader instead of the legacy hybrid party view model", () => {
  const partyPageSource = source("app/(app)/app/party/page.tsx");
  const graphPageSource = source("app/(app)/app/party/graph/page.tsx");

  for (const pageSource of [partyPageSource, graphPageSource]) {
    assert.match(pageSource, /loadAppPartyRouteViewModel/);
    assert.match(pageSource, /StateView/);
    assert.doesNotMatch(pageSource, /getOrbitPartyViewModel/);
  }
});

test("app party route loader returns a real party model in mock mode", async () => {
  await withMockParty(async () => {
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const routeModel = await loadAppPartyRouteViewModel({
      eventId: "demo-event-1",
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.equal(routeModel.party.eventName, "Climate founders dinner");
      assert.equal(routeModel.party.eventVenue, "Kanda Founders Table");
      assert.ok(routeModel.party.me.name);
      assert.ok(routeModel.party.recommendations.length > 0);
      assert.ok(routeModel.party.tableMates.length > 0);
    }
  });
});

test("app party page renders a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveParty(async () => {
    const Page = (await import("../../app/(app)/app/party/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ eventId: "event_01", mode: "live" }),
      }),
    );

    assert.match(html, /Party could not load/);
    assert.match(
      html,
      /LIVE_STORE_UNCONFIGURED|live-store-unconfigured|EVENTS_LIVE_STORE_UNCONFIGURED/,
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-party-route-state/);
  });
});

test("app party graph page renders the same controlled live failure", async () => {
  await withUnconfiguredLiveParty(async () => {
    const Page = (await import("../../app/(app)/app/party/graph/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ eventId: "event_01", mode: "live" }),
      }),
    );

    assert.match(html, /Party could not load/);
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-party-graph-route-state/);
  });
});
