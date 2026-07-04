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

async function withUnconfiguredLiveAccountAuth<T>(
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

async function withMockAccountAuth<T>(run: () => Promise<T>): Promise<T> {
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

test("/app/account auth pages use a live-capable account auth loader", () => {
  const pageSources = [
    source("app/(app)/app/account/login/page.tsx"),
    source("app/(app)/app/account/signup/page.tsx"),
    source("app/(app)/app/account/forgot-password/page.tsx"),
  ];

  for (const pageSource of pageSources) {
    assert.match(pageSource, /loadAppAccountAuthRouteViewModel/);
    assert.match(pageSource, /StateView/);
    assert.match(pageSource, /OrbitRealAccountAuth/);
    assert.doesNotMatch(pageSource, /getOrbitAccountAuthViewModel/);
  }
});

test("app account auth loader returns auth copy and account session context in mock mode", async () => {
  await withMockAccountAuth(async () => {
    const { loadAppAccountAuthRouteViewModel } = await import(
      "../../app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model"
    );
    const routeModel = await loadAppAccountAuthRouteViewModel({
      authMode: "signup",
      searchParams: { mode: "mock" },
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.equal(routeModel.auth.mode, "signup");
      assert.equal(routeModel.auth.title, "创建你的 Orbit 账号");
      assert.equal(routeModel.session.state, "success");
      assert.equal(routeModel.session.account?.displayName, "Ari Lane");
    }
  });
});

test("app account auth loader keeps signed-out account sessions on the auth form", async () => {
  await withMockAccountAuth(async () => {
    const { loadAppAccountAuthRouteViewModel } = await import(
      "../../app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model"
    );
    const routeModel = await loadAppAccountAuthRouteViewModel({
      authMode: "login",
      searchParams: { scenario: "signed-out" },
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.equal(routeModel.auth.mode, "login");
      assert.equal(routeModel.session.state, "empty");
      assert.equal(routeModel.session.account, null);
    }
  });
});

test("app account login page renders a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveAccountAuth(async () => {
    const Page = (await import("../../app/(app)/app/account/login/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Account auth could not load/);
    assert.match(html, /ACCOUNT_LIVE_STORE_UNCONFIGURED/);
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /app-account-login-route-state/);
  });
});

test("app account signup and forgot-password pages share the account auth failure boundary", async () => {
  await withUnconfiguredLiveAccountAuth(async () => {
    const SignupPage = (await import("../../app/(app)/app/account/signup/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const ForgotPage = (await import("../../app/(app)/app/account/forgot-password/page"))
      .default as (props?: {
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;

    const signupHtml = renderToStaticMarkup(
      await SignupPage({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );
    const forgotHtml = renderToStaticMarkup(
      await ForgotPage({
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(signupHtml, /Account auth could not load/);
    assert.match(signupHtml, /app-account-signup-route-state/);
    assert.match(forgotHtml, /Account auth could not load/);
    assert.match(forgotHtml, /app-account-forgot-route-state/);
  });
});
