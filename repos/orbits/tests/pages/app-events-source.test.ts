import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

// iOrbit 任务 6a（「审阅修订」23）：原来这张表里有 `agent/orbit-real-agent.tsx`。
// 该文件已删除，而设计里 iOrbit 对话屏的事件卡是**无图的日期块**（iOrbit.dc.html
// 286–298），没有封面槽位 —— 所以在售的对话面不再是「事件图片表面」，从表里移除
// 并记偏差，而不是把断言硬套到一个不画图的屏上。
test("every active event image surface uses the progressive event cover", () => {
  const eventSurfaceSources = [
    "app/(app)/app/home/orbit-real-home.tsx",
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
