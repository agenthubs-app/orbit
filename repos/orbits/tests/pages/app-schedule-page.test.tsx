import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withOrbitModuleMode<TResult>(
  mode: string,
  callback: () => Promise<TResult>,
): Promise<TResult> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  process.env.ORBIT_MODULE_MODE = mode;

  try {
    return await callback();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("/app/schedule renders data-backed clickable arrangements", async () => {
  const pageSource = source("app/(app)/app/schedule/page.tsx");
  const realPageSource = source(
    "app/(app)/app/schedule/orbit-real-schedule-page.tsx",
  );
  // ScheduleArrangementCard (data-orbit-schedule-arrangement, href=) moved to
  // today/orbit-today-arrangements.tsx as part of the today-schedule merge
  // T1 — the schedule page now imports and renders it from there so the
  // merged Today workspace's "可复核安排" section shares the exact same
  // card, see that task's report for the extraction rationale.
  const arrangementCardSource = source(
    "app/(app)/app/today/orbit-today-arrangements.tsx",
  );

  assert.match(pageSource, /loadAppScheduleRouteViewModel/);
  assert.doesNotMatch(pageSource, /AppFollowupsPage/);
  assert.match(realPageSource, /ScheduleArrangementCard/);
  assert.match(arrangementCardSource, /data-orbit-schedule-arrangement/);
  assert.match(arrangementCardSource, /href=\{arrangement\.href\}/);

  const Page = (await import("../../app/(app)/app/schedule/page")).default;
  const html = renderToStaticMarkup(await Page());

  assert.match(html, /data-orbit-route="app-schedule-route"/);
  assert.match(html, /data-orbit-schedule-arrangement="contact"/);
  assert.match(html, /data-orbit-schedule-arrangement="event"/);
  assert.match(html, /href="\/app\/contacts\/demo-contact-1"/);
  assert.match(html, /href="\/app\/schedule\/events\/event_001"/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /创始人 · Aster Grid/);
  assert.match(html, /种子轮投资人与创始人匹配沙龙/);
  assert.match(html, /地点：Orbit 关系室/);
  assert.match(html, /关系原因/);
  assert.match(html, /活动原因/);
  assert.match(html, /跟进时机/);
  assert.match(html, /来源/);
  assert.match(html, /data-orbit-schedule-target-state="detail-unavailable"/);
  assert.match(html, /安排预览保留活动名称、时间、来源和下一步/);
  assert.match(html, /种子轮投资人与创始人匹配沙龙/);
  assert.match(html, /活动详情仍在接入中/);
  assert.match(html, /不会写入日历/);
  assert.doesNotMatch(html, /Review follow-up for contact_021/);
  assert.doesNotMatch(html, />[^<]*contact_\d+[^<]*</);
  assert.doesNotMatch(html, />[^<]*event_\d+[^<]*</);
  assert.doesNotMatch(
    html,
    /Met at the climate founders dinner|Send Kenji|Orbit AI event recommendation evidence|Review source-backed reasons|storage pilot operators|calendar holds|Founder · Aster Grid|Orbit Relationship Room|Seed Investor and Founder Matching Salon/i,
  );
});

test("/app/schedule renders arrangements instead of recovery when live mode lacks seeded records", async () => {
  const Page = (await import("../../app/(app)/app/schedule/page")).default;
  const html = await withOrbitModuleMode("live", async () =>
    renderToStaticMarkup(await Page()),
  );

  assert.match(html, /data-orbit-route="app-schedule-route"/);
  assert.match(html, /data-orbit-schedule-arrangements="right-side"/);
  assert.match(html, /href="\/app\/contacts\/demo-contact-1"/);
  assert.match(html, /href="\/app\/schedule\/events\/event_001"/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /种子轮投资人与创始人匹配沙龙/);
  assert.match(html, /联系人详情来源仍在接入中/);
  assert.doesNotMatch(html, /日程安排无法加载/);
});

test("/app/schedule constrains the arrangement rail on mobile", () => {
  const realPageSource = source(
    "app/(app)/app/schedule/orbit-real-schedule-page.tsx",
  );

  assert.match(realPageSource, /data-orbit-schedule-mobile-constraints/);
  assert.match(realPageSource, /@media \(max-width: 760px\)/);
  assert.match(realPageSource, /\.orbit-schedule-grid/);
  assert.match(realPageSource, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(realPageSource, /overflow-wrap: anywhere/);
});

test("/app/schedule route states render Chinese recovery controls", async () => {
  const Page = (await import("../../app/(app)/app/schedule/page")).default as (props?: {
    searchParams?: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;

  for (const scenario of ["empty", "pending", "failure"] as const) {
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ scenario }),
      }),
    );

    assert.match(html, /data-orbit-route="app-schedule-route-state"/);
    assert.match(html, /[\u4e00-\u9fff]/);
    assert.match(html, /href="\/app\/schedule/);
    assert.doesNotMatch(
      html,
      /\b(?:Schedule|Follow-ups|Reload|Return|Add|Check|No|Pending|Failure|Source|Review)\b/,
    );
  }
});
