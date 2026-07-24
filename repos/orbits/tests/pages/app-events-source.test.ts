import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/events defaults to event content modules with image media", () => {
  const exploreSource = source("app/(app)/app/events/orbit-real-explore-client.tsx");

  assert.match(exploreSource, /function EventModuleGrid/u);
  assert.match(exploreSource, /function EventModuleCard/u);
  assert.match(exploreSource, /className="orbit-event-module-grid"/u);
  assert.match(exploreSource, /className="card card-hover orbit-event-module-card/u);
  assert.match(exploreSource, /className="orbit-event-module-cover"/u);
  assert.match(exploreSource, /className="orbit-event-module-body"/u);
  assert.match(exploreSource, /className="orbit-event-module-meta"/u);
  assert.match(exploreSource, /className="orbit-event-module-foot"/u);
  assert.doesNotMatch(exploreSource, /function EventImageList/u);
  assert.doesNotMatch(exploreSource, /orbit-event-poster-list/u);
  assert.match(exploreSource, /const \[mode, setMode\] = useState\("modules"\)/u);
  assert.match(exploreSource, /effMode === "modules"/u);
  assert.doesNotMatch(exploreSource, /const \[mode, setMode\] = useState\("list"\)/u);
  assert.doesNotMatch(exploreSource, />\{t\(\{ en: "Images", zh: "图片" \}\)\}<\/button>/u);
});
