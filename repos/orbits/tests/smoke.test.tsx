import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "../app/layout";
import Page from "../app/page";

test("scaffold exposes the runnable Next.js App Router contract", () => {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const expectedLintedTypeScriptSources = [
    "shared/ui/app-shell.tsx",
    "shared/ui/state-view.tsx",
    "shared/api/envelope.ts",
    "shared/errors/app-error.ts",
    "shared/config/feature-mode.ts",
    "shared/services/module-mode.ts",
    "shared/ai/service-factory.ts",
    "features/account/service-factory.ts",
    "features/acquisition/service-factory.ts",
    "features/agent/service-factory.ts",
    "features/analysis/service-factory.ts",
    "features/audit/service-factory.ts",
    "features/bootstrap/service-factory.ts",
    "features/chat/service-factory.ts",
    "features/connections/service-factory.ts",
    "features/contacts/service-factory.ts",
    "features/dashboard/service-factory.ts",
    "features/events/service-factory.ts",
    "features/followups/service-factory.ts",
    "features/notifications/service-factory.ts",
    "features/orbit-ai/contract.ts",
    "features/orbit-ai/service.ts",
    "features/orbit-ai/service-factory.ts",
    "features/orbit-ai/mock-service.ts",
    "features/permissions/service-factory.ts",
    "features/profile/service-factory.ts",
    "features/recommendations/service-factory.ts",
    "features/search/service-factory.ts",
    "app/api/health/route.ts",
    "app/api/health/error/route.ts",
    "app/api/agent/actions/route.ts",
    "app/api/app/bootstrap/route.ts",
    "app/api/chat/conversations/route.ts",
    "app/api/contacts/route.ts",
    "app/api/dashboard/route.ts",
    "app/api/events/route.ts",
    "app/api/tasks/route.ts",
    "tests/api/envelope.test.ts",
    "tests/services/core-service-factories.test.ts",
    "tests/services/modular-boundaries.test.ts",
    "app/(app)/app/layout.tsx",
    "app/(app)/app/page.tsx",
    "app/(app)/app/orbit-ai-command-center.tsx",
    "app/(app)/app/profile/page.tsx",
    "app/(app)/app/events/page.tsx",
    "app/(app)/app/contacts/page.tsx",
    "app/(app)/app/followups/page.tsx",
    "app/(app)/app/chat/page.tsx",
    "app/(app)/app/dashboard/page.tsx",
    "app/(app)/app/agent/page.tsx",
    "tests/smoke.test.tsx",
  ];

  assert.equal(packageJson.scripts.dev, "next dev --webpack");
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.match(
    packageJson.scripts.lint,
    /^eslint next\.config\.js --ext \.js && tsc --noEmit --incremental false --allowJs false --jsx react-jsx --target ES2017 --lib dom,dom\.iterable,esnext --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck /,
  );
  for (const sourcePath of expectedLintedTypeScriptSources) {
    assert.ok(
      packageJson.scripts.lint.includes(`"${sourcePath}"`),
      `expected lint script to type-check ${sourcePath}`,
    );
  }
  assert.equal(
    packageJson.scripts.test,
    'node --test --import tsx "tests/**/*.test.{ts,tsx}"',
  );

  for (const filePath of [
    "package.json",
    "package-lock.json",
    "next.config.js",
    "tsconfig.json",
    "next-env.d.ts",
    "app/layout.tsx",
    "app/page.tsx",
    "tests/smoke.test.tsx",
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
  assert.doesNotThrow(() => {
    html = renderToStaticMarkup(
      React.createElement(RootLayout, null, React.createElement(Page)),
    );
  });

  assert.match(html, /<main/);
  assert.equal(html.match(/<h1\b/g)?.length, 1);
  assert.match(html, /<h1\b[^>]*id="orbit-title"[^>]*>Orbit<\/h1>/);
  assert.match(html, /href="#relationship-starter"/);
  assert.match(html, /aria-label="Orbit entry"/);
  assert.match(html, /Event-grounded relationship workspace/);
  assert.match(html, /aria-labelledby="relationship-starter"/);
  assert.match(html, /Start a sourced relationship note/);
  assert.match(html, /aria-label="Relationship record frame"/);
  assert.match(html, /Every relationship record starts with/);
  assert.match(html, /Person/);
  assert.match(html, /Origin/);
  assert.match(html, /Context clue/);
  assert.match(html, /Suggested next step/);
  assert.match(html, /Review before any external action/);
  assert.match(html, /Next action/);
  assert.match(html, /sensible follow-up/i);
  assert.match(html, /source-backed next step/i);
  assert.match(html, /source/i);
  assert.match(html, /evidence/i);
  assert.match(html, /confirmation/i);
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /scaffold|Sprint 1|Framework ready/i);
  assert.doesNotMatch(html, /Relationship context starter/);
  assert.doesNotMatch(html, /Mika Tanaka|Tokyo Founder Demo Night|Kenji Sato/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /<details/);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /ready for your review|follow-up draft/i);
});
