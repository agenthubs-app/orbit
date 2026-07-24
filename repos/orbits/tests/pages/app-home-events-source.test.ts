import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/home/events renders personal events as content modules with image media", () => {
  const homeSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(homeSource, /getDemoEventSceneAsset/u);
  assert.match(homeSource, /function eventImageUrl/u);
  assert.match(homeSource, /orbit-account-event-module-card/u);
  assert.match(homeSource, /className="orbit-account-event-module-cover"/u);
  assert.match(homeSource, /className="orbit-account-event-module-body"/u);
  assert.match(homeSource, /className="orbit-account-event-module-meta"/u);
  assert.match(homeSource, /className="orbit-account-event-module-foot"/u);
  assert.match(homeSource, /data-demo-visual-asset-id/u);
  assert.match(homeSource, /imageUrl=\{eventImageUrl\(event\)\}/u);
  assert.doesNotMatch(homeSource, /orbit-account-event-poster-card/u);
  assert.doesNotMatch(homeSource, /orbit-account-event-poster-list/u);
});

test("/app/home/events applies the same event presentation layer as /app/events", () => {
  const pageSource = source("app/(app)/app/home/events/page.tsx");

  assert.match(pageSource, /presentOrbitEvents/u);
  assert.match(pageSource, /events:\s*presentOrbitEvents\(routeModel\.home\.events,\s*language \?\? "zh"\)/u);
});
