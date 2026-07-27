import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

async function renderEventDetailPage(
  id: string,
  searchParams: Record<string, string | undefined> = {
    language: "en",
  },
): Promise<string> {
  const Page = (await import("../../app/(app)/app/events/[id]/page"))
    .default as (props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;

  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

async function withModuleMode<T>(
  mode: string,
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = mode;

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

function assertSectionOrder(html: string, markers: readonly string[]): void {
  let previousIndex = -1;

  for (const marker of markers) {
    const nextIndex = html.indexOf(marker, previousIndex + 1);

    assert.ok(
      nextIndex > previousIndex,
      `${marker} should be visible after the previous event detail section`,
    );

    previousIndex = nextIndex;
  }
}

function assertMobileLayoutContract(html: string): void {
  assert.match(
    html,
    /data-event-detail-layout-contract="fixed-cta-reserved-space"/,
  );
  assert.match(html, /data-event-detail-mobile-cta="fixed-bottom"/);
  assert.match(html, /@media \(max-width: 640px\)/);
  assert.match(
    html,
    /\.orbit-detail-layout\s*\{[^}]*display: block;[^}]*max-width: 100vw;[^}]*overflow-x: clip;[^}]*padding: 0 16px 104px;/s,
  );
  assert.match(
    html,
    /\.orbit-detail-mobile-cta\s*\{[^}]*display: flex;[^}]*max-width: 100vw;[^}]*width: 100%;/s,
  );
  assert.match(
    html,
    /\.orbit-detail-mobile-cta \.btn\s*\{[^}]*flex: 1 1 0;[^}]*min-width: 0;[^}]*white-space: normal;/s,
  );
  assert.match(
    html,
    /data-event-detail-overlap-guard="fixed-mobile-cta-space" style="height:84px"/,
  );
  assert.match(
    html,
    /data-event-detail-mobile-cta="fixed-bottom"[^>]*style="[^"]*position:fixed[^"]*bottom:0[^"]*padding:12px 18px 24px/s,
  );
}

test("/app/events/event_001 explicit preview renders the restored desktop event detail hierarchy", async () => {
  const html = await withModuleMode("live", () =>
    renderEventDetailPage("event_001", { language: "en", mode: "mock" }),
  );

  assert.match(html, /data-orbit-real-page="event-detail"/);
  assert.match(html, /data-event-detail-hierarchy="restored"/);
  assert.match(html, /data-event-detail-section="hero"/);
  assert.match(html, /Seed Investor and Founder Matching Salon/);
  assert.match(html, /data-event-detail-section="schedule"/);
  assert.match(html, /Orbit Relationship Room/);
  assert.match(html, /data-event-detail-section="relationship-priority"/);
  assert.match(html, /Relationship priority|关系优先级/);
  assert.match(html, /Priya Shah|Aiko Mori/);
  assert.match(html, /data-event-detail-section="registration-action"/);
  assert.match(html, /href="\/app\/register\?code=EVENT001"/);
  assert.match(html, /data-event-detail-section="attendee-context"/);
  assert.match(html, /data-event-detail-section="supporting-details"/);
  assertSectionOrder(html, [
    'data-event-detail-section="hero"',
    'data-event-detail-section="relationship-priority"',
    'data-event-detail-section="schedule"',
    'data-event-detail-section="registration-action"',
    'data-event-detail-section="attendee-context"',
    'data-event-detail-section="supporting-details"',
  ]);
  assert.doesNotMatch(html, /Event workspace could not load/);
  assert.doesNotMatch(html, /<details/i);
  assert.doesNotMatch(html, /aria-expanded="false"/);
});

test("/app/events/event_001 explicit preview keeps mobile detail content reachable without collapsed defaults", async () => {
  const html = await withModuleMode("live", () =>
    renderEventDetailPage("event_001", { language: "en", mode: "mock" }),
  );

  assert.match(html, /data-event-detail-mobile="hero"/);
  assert.match(
    html,
    /data-event-detail-mobile="summary" data-event-detail-section="schedule"/,
  );
  assert.match(html, /data-event-detail-mobile="registration-actions"/);
  assert.match(html, /data-event-detail-layout="mobile-stacked"/);
  assert.match(html, /data-event-detail-overflow-guard="viewport-constrained"/);
  assert.match(html, /data-event-detail-overlap-guard="fixed-mobile-cta-space"/);
  assertMobileLayoutContract(html);
  assert.match(html, /Relationship priority|关系优先级/);
  assert.match(html, /Recommended people|推荐认识的人/);
  assert.match(html, /Readiness|准备状态/);
  assert.doesNotMatch(html, /hidden=""/);
  assert.doesNotMatch(html, /display:\s*none/i);
  assert.doesNotMatch(html, /data-collapsed="true"/);
});

test("/app/events/event_002 remains a controlled boundary instead of a collapsed detail shell", async () => {
  const html = await withModuleMode("mock", () =>
    renderEventDetailPage("event_002"),
  );

  assert.match(html, /Event workspace could not load/);
  assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /data-event-detail-hierarchy="restored"/);
  assert.doesNotMatch(html, /data-collapsed="true"/);
});
