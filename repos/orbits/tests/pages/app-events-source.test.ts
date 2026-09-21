import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/events renders Orbit_0918 event module cards with image media", () => {
  const exploreSource = source("app/(app)/app/events/events-0918/events-list.tsx");

  assert.match(exploreSource, /function EventModuleGrid/u);
  assert.match(exploreSource, /function EventModuleCard/u);
  assert.match(exploreSource, /className="ev-grid"/u);
  assert.match(exploreSource, /className="ev-card"/u);
  assert.match(exploreSource, /className=\{`ev-cover/u);
  assert.match(exploreSource, /className="ev-body"/u);
  assert.match(exploreSource, /className="ev-meta"/u);
  assert.match(exploreSource, /className="ev-foot"/u);
  assert.match(exploreSource, /import \{ EventCover \} from "\.\.\/orbit-event-cover"/u);
  assert.doesNotMatch(exploreSource, /function EventImageList/u);
  assert.doesNotMatch(exploreSource, /orbit-event-poster-list/u);
  // Orbit_0918 设计替换：地图视图与 modules/map 切换器退役（2026-09-18）。
  assert.doesNotMatch(exploreSource, /MapCanvas/u);
  assert.doesNotMatch(exploreSource, /orbit-event-view-switcher/u);
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

test("registered empty state and card links keep one coherent event action", () => {
  const exploreSource = source("app/(app)/app/events/events-0918/events-list.tsx");

  assert.match(exploreSource, /还没有已报名活动/u);
  assert.match(exploreSource, /No registered events yet/u);
  // Orbit_0918 保真收口：卡片不再用整卡覆盖链接 + 抬高 z-index 的 CTA，封面 / 标题 / CTA 各自是链接（设计 83、88、97 行）。
  assert.match(exploreSource, /className="ev-cover-link"/u);
  assert.match(exploreSource, /className="ev-title-link"/u);
  assert.match(exploreSource, /data-events-cta=\{cta\.kind\}/u);
  assert.doesNotMatch(exploreSource, /zIndex/u);
});
