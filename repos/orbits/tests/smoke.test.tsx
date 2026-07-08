import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "../app/layout";
import Page from "../app/page";
import { getOrbitLandingViewModel } from "../app/(app)/app/orbit-landing-route-view-model";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;

async function withUnconfiguredLiveStorage<T>(
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

test("scaffold exposes the runnable Next.js App Router contract", async () => {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  assert.equal(packageJson.scripts.dev, "next dev --webpack");
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.match(
    packageJson.scripts.lint,
    /^eslint next\.config\.js --ext \.js && tsc --noEmit --incremental false --allowJs false --jsx react-jsx --target ES2017 --lib dom,dom\.iterable,esnext --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck /,
  );
  for (const sourcePath of [
    "features/orbit-ai/gemini-provider.ts",
    "features/orbit-ai/live-conversation-service.ts",
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-reference-styles.tsx",
    "app/(app)/app/orbit-reference-primitives.tsx",
  ]) {
    assert.ok(
      packageJson.scripts.lint.includes(`"${sourcePath}"`),
      `expected lint script to type-check ${sourcePath}`,
    );
  }
  assert.equal(packageJson.scripts.test, "node scripts/run-node-tests.mjs");

  for (const filePath of [
    "package.json",
    "package-lock.json",
    "next.config.js",
    "tsconfig.json",
    "next-env.d.ts",
    "scripts/run-node-tests.mjs",
    "scripts/TEST_RUNNER.md",
    "app/layout.tsx",
    "app/page.tsx",
    "tests/smoke.test.tsx",
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-reference-styles.tsx",
    "app/(app)/app/orbit-reference-primitives.tsx",
  ]) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, filePath)),
      true,
      `expected ${filePath} to exist inside the app scaffold`,
    );
  }

  for (const generatedArtifactPath of ["harness-state", "harness-logs"]) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, generatedArtifactPath)),
      false,
      `expected ${generatedArtifactPath} to stay out of the app repo`,
    );
  }

  let html = "";
  await withUnconfiguredLiveStorage(async () => {
    await assert.doesNotReject(async () => {
      const rootPage = await Page({
        searchParams: Promise.resolve({ mode: "live" }),
      });

      html = renderToStaticMarkup(
        React.createElement(RootLayout, null, rootPage),
      );
    });
  });

  assert.match(html, /<main/);
  assert.match(html, /data-orbit-agent-hero="root"/);
  assert.match(html, /data-orbit-activity-overview="root"/);
  assert.match(html, /data-orbit-event-context="root"/);
  assert.match(html, /href="\/app\/events/);
  assert.match(html, /href="\/app\/contacts/);
  for (const event of getOrbitLandingViewModel().events.slice(0, 3)) {
    assert.match(html, new RegExp(`href="/app/events/${event.id}"`));
  }
  assert.match(html, /aria-label="查看西村 大地的人脉上下文"/);
  assert.doesNotMatch(html, /JA:/);
  assert.doesNotMatch(html, /ZH:/);
  assert.doesNotMatch(html, /EN:/);
  assert.doesNotMatch(html, /app-root-home-route/);
  assert.doesNotMatch(html, /Home could not load/);
  assert.doesNotMatch(html, /orbit-prototype-frame/);
  assert.doesNotMatch(html, /Event-grounded relationship workspace/);
  assert.doesNotMatch(html, /href="#relationship-starter"/);
  assert.doesNotMatch(html, /scaffold|Sprint 1|Framework ready/i);
  assert.doesNotMatch(html, /Relationship context starter/);
  assert.doesNotMatch(html, /Mika Tanaka|Tokyo Founder Demo Night|Kenji Sato/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.match(html, /data-orbit-real-page="landing"/);
  assert.doesNotMatch(html, /ready for your review|follow-up draft/i);
});
