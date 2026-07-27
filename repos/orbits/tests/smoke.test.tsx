import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitStarfieldHome } from "../app/(app)/app/orbit-starfield-home";

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
  // `build` regenerates the prototype stylesheet asset before compiling
  // (UI-audit fix P0-2 — see scripts/build-reference-css.mjs). The Next build
  // itself must stay `next build --webpack`; assert the pair rather than
  // pinning the whole string, so the codegen prefix is allowed but a change to
  // the bundler flags is still caught.
  assert.equal(packageJson.scripts["build:reference-css"], "node scripts/build-reference-css.mjs");
  assert.equal(
    packageJson.scripts.build,
    "npm run build:reference-css && next build --webpack",
  );
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

  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/page.tsx"),
    "utf8",
  );
  assert.match(pageSource, /const session = await auth\(\)/);
  assert.match(
    pageSource,
    /<OrbitStarfieldHome authenticated=\{Boolean\(session\?\.user\?\.id\)\} \/>/,
  );

  // `app/page.tsx` now authenticates through Auth.js, so invoking the route
  // outside a Next request is not a valid unit-test boundary. Render the pure
  // starfield component directly; the production build covers the route and
  // request-scoped layout composition.
  let html = "";
  await withUnconfiguredLiveStorage(async () => {
    await assert.doesNotReject(async () => {
      html = renderToStaticMarkup(
        <OrbitStarfieldHome authenticated={false} />,
      );
    });
  });

  assert.match(html, /<main/);
  assert.match(html, /data-orbit-real-page="starfield-home"/);
  assert.match(html, /href="\/app\/events/);
  assert.match(html, /href="\/app\/contacts/);
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
  assert.doesNotMatch(html, /ready for your review|follow-up draft/i);
});
