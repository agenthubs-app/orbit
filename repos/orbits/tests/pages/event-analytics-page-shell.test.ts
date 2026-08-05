import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL(
    "../../app/(app)/app/events/[id]/analytics/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("event analytics reuses the product navigation inside the real-page style scope", () => {
  assert.match(pageSource, /className="orbit-shell"/u);
  assert.match(pageSource, /data-appscroll/u);
  assert.match(pageSource, /data-orbit-real-page="event-analytics"/u);
  assert.match(pageSource, /<PublicTopNav active="events" \/>/u);
});
