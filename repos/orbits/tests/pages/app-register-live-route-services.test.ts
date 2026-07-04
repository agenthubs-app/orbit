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

async function withUnconfiguredLiveRegister<T>(
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

async function withMockRegister<T>(run: () => Promise<T>): Promise<T> {
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

test("/app/register page uses a live-capable route loader instead of the legacy register view model", () => {
  const pageSource = source("app/(app)/app/register/page.tsx");
  const realRegisterSource = source("app/(app)/app/register/orbit-real-register.tsx");

  assert.match(pageSource, /loadAppRegisterRouteViewModel/);
  assert.match(pageSource, /OrbitRealRegister/);
  assert.match(pageSource, /StateView/);
  assert.doesNotMatch(pageSource, /getOrbitRegisterViewModel/);
  assert.match(realRegisterSource, /register-view-model-contract/);
  assert.doesNotMatch(realRegisterSource, /orbit-register-route-view-model/);
});

test("app register route loader returns the real registration model in mock mode", async () => {
  await withMockRegister(async () => {
    const { loadAppRegisterRouteViewModel } = await import(
      "../../app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model"
    );
    const viewModel = await loadAppRegisterRouteViewModel({
      code: "demo-event-1",
    });

    assert.equal(viewModel.state, "success");

    if (viewModel.state === "success") {
      assert.equal(viewModel.register.event.code, "DEMOEVENT1");
      assert.equal(viewModel.register.event.name, "Climate founders dinner");
      assert.ok(viewModel.register.industryOptions.length > 0);
      assert.ok(viewModel.register.profilePreview.name);
      assert.ok(viewModel.register.topics.length > 0);
    }
  });
});

test("app register page renders a controlled live failure when event storage is unconfigured", async () => {
  await withUnconfiguredLiveRegister(async () => {
    const Page = (await import("../../app/(app)/app/register/page"))
      .default as (props: {
      searchParams: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ code: "event_01", mode: "live" }),
      }),
    );

    assert.match(html, /Registration could not load/);
    assert.match(
      html,
      /EVENTS_LIVE_STORE_UNCONFIGURED|events-live-store-unconfigured/,
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-register-route-state/);
  });
});
