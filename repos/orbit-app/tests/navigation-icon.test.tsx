import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { OrbitNavigationIcon } from "../src/components/OrbitNavigationIcon";
import { Icon } from "../src/components/ui/Icon";
import { renderToHtml } from "./helpers/render";

// R02 (SC-R02-04): the tab bar draws the design kit's tab icons
// (kit.js TABS: home / users / sparkle / calendar / task) through <Icon>.
// R05 NAV-V3: マイページ left the bar for the home avatar; the fifth tab is Task.
const TAB_ICONS = { home: "home", contacts: "users", iorbit: "sparkle", events: "calendar", task: "task" } as const;

test("each tab draws its design icon from the icon source, 21 by default as in the kit tab bar", () => {
  for (const [tab, icon] of Object.entries(TAB_ICONS) as [keyof typeof TAB_ICONS, (typeof TAB_ICONS)[keyof typeof TAB_ICONS]][]) {
    assert.equal(
      renderToHtml(<OrbitNavigationIcon name={tab} color="#123456" />),
      renderToHtml(<Icon name={icon} size={21} color="#123456" />),
      `${tab} → ${icon}`,
    );
  }
});

test("selected and unselected colours pass straight through to the stroke", () => {
  assert.match(renderToHtml(<OrbitNavigationIcon name="events" color="#AA0011" />), /stroke="#AA0011"/u);
  assert.match(renderToHtml(<OrbitNavigationIcon name="events" color="#00BB22" />), /stroke="#00BB22"/u);
});

test("a requested size snaps to the icon scale: below 24 → 21, 24 and up → 24", () => {
  assert.match(renderToHtml(<OrbitNavigationIcon name="iorbit" size={24} color="#000000" />), /width="24"/u);
  assert.match(renderToHtml(<OrbitNavigationIcon name="home" size={22} color="#000000" />), /width="21"/u);
  assert.match(renderToHtml(<OrbitNavigationIcon name="contacts" size={28} color="#000000" />), /width="24"/u);
});
