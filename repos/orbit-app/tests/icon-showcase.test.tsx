import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { designIconNames, designIconSources } from "../src/api/design/icons";
import { showcaseEnabled } from "../src/components/ui/showcase";
import { IconShowcaseScreen } from "../src/screens/showcase/IconShowcaseScreen";
import { renderedText, renderToHtml } from "./helpers/render";

// R02 / RD-15: the icon showcase lists every icon (kit and drawn) for side-by-side
// checks against the design kit. Development builds and TestFlight
// (EXPO_PUBLIC_ORBIT_SHOWCASE=1) show it; the App Store build does not.
test("the showcase lists every icon by name, drawn ones marked", () => {
  const html = renderToHtml(<IconShowcaseScreen />);
  const text = renderedText(<IconShowcaseScreen />);
  for (const name of designIconNames) assert.ok(text.includes(name), `${name} missing from the showcase`);
  const svgs = html.match(/<svg\b/gu) ?? [];
  assert.ok(svgs.length >= designIconNames.length, "one drawing per icon at least");
  const drawn = designIconNames.filter((name) => designIconSources[name] === "drawn").length;
  assert.equal((text.match(/✎/gu) ?? []).length, drawn, "each drawn icon carries the ✎ mark");
});

test("the showcase shows the size scale and the selected / unselected tab colours", () => {
  const text = renderedText(<IconShowcaseScreen />);
  for (const size of ["16", "20", "21", "24"]) assert.ok(text.includes(size));
});

test("only development builds and TestFlight show the showcase", () => {
  assert.equal(showcaseEnabled(true, undefined), true);
  assert.equal(showcaseEnabled(false, "1"), true);
  assert.equal(showcaseEnabled(false, undefined), false);
  assert.equal(showcaseEnabled(false, "0"), false);
});
