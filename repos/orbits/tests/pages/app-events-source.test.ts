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
  assert.match(exploreSource, /import \{ EventCover \} from "\.\/orbit-event-cover"/u);
  assert.doesNotMatch(exploreSource, /function EventImageList/u);
  assert.doesNotMatch(exploreSource, /orbit-event-poster-list/u);
  assert.match(exploreSource, /const \[mode, setMode\] = useState\("modules"\)/u);
  assert.match(exploreSource, /effMode === "modules"/u);
  assert.doesNotMatch(exploreSource, /const \[mode, setMode\] = useState\("list"\)/u);
  assert.doesNotMatch(exploreSource, />\{t\(\{ en: "Images", zh: "图片" \}\)\}<\/button>/u);
});

test("every active event image surface uses the progressive event cover", () => {
  const eventSurfaceSources = [
    "app/(app)/app/home/orbit-real-home.tsx",
    "app/(app)/app/agent/orbit-real-agent.tsx",
    "app/(app)/app/admin/orbit-real-admin-events.tsx",
    "app/(app)/app/admin/orbit-real-admin-workspace.tsx",
    "app/(app)/app/o/orbit-real-organizer-public.tsx",
  ].map(source);

  for (const eventSurfaceSource of eventSurfaceSources) {
    assert.match(
      eventSurfaceSource,
      /import \{ EventCover \} from "\.\.\/events\/orbit-event-cover"/u,
    );
    assert.doesNotMatch(eventSurfaceSource, /<Cover\b[^>]*\bimageUrl=/u);
  }
});

test("progressive product imagery is responsive, LQIP-backed, and decode-gated", () => {
  const progressiveImageSource = source("shared/ui/orbit-progressive-image.tsx");
  const eventCoverSource = source("app/(app)/app/events/orbit-event-cover.tsx");
  const contactAvatarSource = source("app/(app)/app/contacts/orbit-contact-avatar.tsx");
  const generatedLqipSource = source("shared/ui/orbit-image-lqip.generated.ts");

  assert.match(progressiveImageSource, /import Image from "next\/image"/u);
  assert.match(progressiveImageSource, /sizes=\{sizes\}/u);
  assert.match(progressiveImageSource, /preload=\{loading === "eager"\}/u);
  assert.match(progressiveImageSource, /await image\.decode\(\)/u);
  assert.match(progressiveImageSource, /opacity 220ms/u);
  assert.match(eventCoverSource, /orbitImageLqip\(imageUrl\)/u);
  assert.match(contactAvatarSource, /<OrbitProgressiveImage/u);
  assert.match(generatedLqipSource, /data:image\/webp;base64,/u);
});

test("registered empty state and map variants keep one coherent event action", () => {
  const exploreSource = source("app/(app)/app/events/orbit-real-explore-client.tsx");

  assert.match(exploreSource, /还没有已报名活动/u);
  assert.match(exploreSource, /No registered events yet/u);
  assert.match(exploreSource, /\{located\.map\(\(item\)/u);
  assert.doesNotMatch(exploreSource, /\{mapItems\.map\(\(item\)/u);
  assert.match(exploreSource, /<MapEventCard compact item=\{selectedItem\}/u);
  assert.match(exploreSource, /zIndex: ORBIT_Z\.raised/u);
  assert.doesNotMatch(exploreSource, /zIndex:\s*[0-9]/u);
});
