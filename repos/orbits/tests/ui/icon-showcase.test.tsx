import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import IconShowcasePage from "../../app/showcase/icons/page";
import { shouldHideShowcase } from "../../app/showcase/visibility";
import { designIconNames, designIconSources } from "../../shared/design/icons";

// R02 / RD-15: the Web icon showcase lists every icon for side-by-side checks
// against the design kit. Visible locally and on preview / staging, hidden in
// production.
test("the showcase lists every icon by name, drawn ones marked, inside the new scope", () => {
  const html = renderToStaticMarkup(<IconShowcasePage />);
  assert.match(html, /data-orbit-2026/u);
  for (const name of designIconNames) assert.ok(html.includes(`>${name}<`) || html.includes(`>${name} ✎<`), `${name} missing`);
  const drawn = designIconNames.filter((name) => designIconSources[name] === "drawn").length;
  assert.equal((html.match(/ ✎</gu) ?? []).length, drawn);
  for (const size of ["16", "20", "21", "24"]) assert.ok(html.includes(`>${size}<`), `size ${size} sample`);
});

test("production hides the showcase; local and preview / staging show it", () => {
  assert.equal(shouldHideShowcase({ NODE_ENV: "development" }), false);
  assert.equal(shouldHideShowcase({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
  assert.equal(shouldHideShowcase({ NODE_ENV: "production", VERCEL_ENV: "production" }), true);
  // a production build outside Vercel fails closed
  assert.equal(shouldHideShowcase({ NODE_ENV: "production" }), true);
});
