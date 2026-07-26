import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = path.join(process.cwd(), "app/(app)/app/events");

test("event view switcher owns one outline and exposes its selected state", () => {
  const component = fs.readFileSync(
    path.join(appRoot, "orbit-real-explore-client.tsx"),
    "utf8",
  );

  assert.match(component, /className="orbit-event-view-switcher"/u);
  assert.match(component, /aria-pressed=\{effMode === "modules"\}/u);
  assert.match(component, /aria-pressed=\{effMode === "map"\}/u);
  assert.match(component, /\.orbit-event-view-switcher > \.orbit-event-view-option\s*\{[\s\S]*?border-color: transparent;/u);
  assert.match(component, /\.orbit-event-view-switcher > \.orbit-event-view-option:focus-visible\s*\{[\s\S]*?outline-offset: -3px;/u);
});
