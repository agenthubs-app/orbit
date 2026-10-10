import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ComponentShowcase } from "../../app/showcase/components/ComponentShowcase";
import { metadata } from "../../app/showcase/components/page";
import { shouldHideShowcase } from "../../app/showcase/visibility";

// R06 / RD-15 (SC-R06-05): the component showcase lives under /showcase (with the
// icon and copy showcases), so app/showcase/layout.tsx hides it in production (404)
// and the product surface manifest leaves it out.
test("the component showcase sits under the showcase layout that 404s in production", () => {
  assert.equal(existsSync("app/showcase/components/page.tsx"), true);
  assert.match(readFileSync("app/showcase/layout.tsx", "utf8"), /if \(shouldHideShowcase\([^)]*\)\) notFound\(\);/u);
  assert.equal(shouldHideShowcase({ NODE_ENV: "development" }), false, "local");
  assert.equal(shouldHideShowcase({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false, "preview / staging");
  assert.equal(shouldHideShowcase({ NODE_ENV: "production", VERCEL_ENV: "production" }), true, "production");
  assert.equal(shouldHideShowcase({ NODE_ENV: "production" }), true, "a production build outside Vercel fails closed");
  assert.deepEqual(metadata.robots, { index: false });
  assert.match(readFileSync("scripts/generate-product-surface-manifest.mjs", "utf8"), /!relative\.startsWith\("showcase\/"\)/u);
});

test("server render: the showcase is one new scope in the page language", () => {
  const html = renderToStaticMarkup(<ComponentShowcase language="zh" />);
  assert.match(html, /data-orbit-2026=""/u);
  assert.match(html, /lang="zh"/u);
  assert.match(html, /保存/u);
});
