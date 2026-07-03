import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "../app/layout";
import Page from "../app/page";

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
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-reference-styles.tsx",
    "app/(app)/app/orbit-reference-primitives.tsx",
    "app/(app)/app/orbit-lang-runtime.tsx",
    "app/(app)/app/orbit-starfield-home.tsx",
  ]) {
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
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-reference-styles.tsx",
    "app/(app)/app/orbit-reference-primitives.tsx",
    "app/(app)/app/orbit-lang-runtime.tsx",
    "app/(app)/app/orbit-starfield-home.tsx",
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
  await assert.doesNotReject(async () => {
    // RootLayout is an async Server Component (it resolves the request
    // language for <html lang>); resolve it before static rendering.
    const layoutElement = await RootLayout({ children: React.createElement(Page) });
    html = renderToStaticMarkup(layoutElement);
  });

  assert.match(html, /<main/);
  assert.match(html, /data-orbit-real-page="starfield-home"/);
  // Both reference trees SSR (desktop 星空旅程 + de-shelled mobile); a CSS
  // breakpoint shows exactly one until matchMedia settles it after hydration.
  assert.match(html, /sk-home-desktop/);
  assert.match(html, /sk-home-mobile/);
  assert.match(html, /data-screen-label="iOrbit 星空旅程"/);
  assert.match(html, /data-screen-label="iOrbit 移动端"/);
  assert.match(html, /id="skCanvas"/);
  assert.match(html, /你的⼈脉|你的人脉/);
  assert.match(html, /由 iOrbit 智能匹配引擎驱动/);
  // Mobile nav renders the zh/en switcher ("中" and "EN" in separate spans).
  assert.match(html, /中/);
  assert.match(html, /EN/);
  // The pre-reference responsive approximation must be fully gone.
  assert.doesNotMatch(html, /iorbit-starfield-home/);
  assert.doesNotMatch(html, /orbit-landing-page/);
  assert.doesNotMatch(html, /orbit-agent-hero/);
  assert.doesNotMatch(html, /让对的人，进入你的商业轨道/);
  assert.doesNotMatch(html, /orbit-prototype-frame/);
  assert.doesNotMatch(html, /Event-grounded relationship workspace/);
  assert.doesNotMatch(html, /href="#relationship-starter"/);
  assert.doesNotMatch(html, /scaffold|Sprint 1|Framework ready/i);
  assert.doesNotMatch(html, /Relationship context starter/);
  assert.doesNotMatch(html, /Mika Tanaka|Tokyo Founder Demo Night|Kenji Sato/);
  assert.doesNotMatch(html, /<details/);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /ready for your review|follow-up draft/i);
});
