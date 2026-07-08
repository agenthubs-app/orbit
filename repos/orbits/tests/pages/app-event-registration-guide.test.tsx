import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

async function withOrbitModuleMode<T>(
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

test("/app/events/[id] exposes the event-specific registration profile guide entry", async () => {
  const Page = (await import("../../app/(app)/app/events/[id]/page"))
    .default as (props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ id: "event_001" }),
      searchParams: Promise.resolve({ language: "en", mode: "mock" }),
    }),
  );

  assert.match(html, /data-orbit-registration-profile-guide="detail"/);
  assert.match(html, /Seed Investor and Founder Matching Salon/);
  assert.match(html, /Profile questions for this event/);
  assert.match(html, /Answers are staged locally until you confirm them/);
  assert.match(html, /href="\/app\/events\/event_001\/register\?language=en"/);
});

test("/app/events/[id] exposes registration guidance for canonical navigation without query setup", async () => {
  await withOrbitModuleMode("hybrid", async () => {
    const Page = (await import("../../app/(app)/app/events/[id]/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "event_001" }),
      }),
    );

    assert.match(html, /<h1[^>]*>Seed Investor and Founder Matching Salon<\/h1>/);
    assert.match(html, /data-orbit-registration-profile-guide="detail"/);
    assert.match(html, /Seed Investor and Founder Matching Salon/);
    assert.match(html, /报名资料|Registration profile/);
    assert.match(html, /继续填写报名资料|Continue registration profile guide/);
    assert.match(html, /href="\/app\/events\/event_001\/register\?language=/);
    assert.match(html, /报名参加|Register/);
    assert.doesNotMatch(html, /href="\/app\/events\/demo-event-1"/);
    assert.doesNotMatch(html, /Event workspace could not load/);
  });
});

test("/app/events/[id]/register renders staged review and skip controls", async () => {
  const Page = (await import("../../app/(app)/app/events/[id]/register/page"))
    .default as (props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ id: "event_001" }),
      searchParams: Promise.resolve({ language: "en", mode: "mock" }),
    }),
  );

  assert.match(html, /data-orbit-registration-profile-guide="register"/);
  assert.match(html, /Seed Investor and Founder Matching Salon/);
  assert.match(html, /preferred intro channels/i);
  assert.match(html, /Answers stay local until you confirm/);
  assert.match(html, /name="profile-question:/);
  assert.match(html, /Skip this question/);
  assert.match(html, /Review and confirm staged answers/);
  assert.match(html, /Final step: answers remain local until you explicitly confirm/);
  assert.match(html, /preferredIntroChannels.*preferred introduction channels/i);
  assert.match(html, /Skip profile questions/);
});

test("/app/events/[id]/register renders the canonical guide without query setup", async () => {
  await withOrbitModuleMode("hybrid", async () => {
    const Page = (await import("../../app/(app)/app/events/[id]/register/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "event_001" }),
      }),
    );

    assert.match(html, /data-orbit-registration-profile-guide="register"/);
    assert.match(html, /<h1[^>]*>Seed Investor and Founder Matching Salon<\/h1>/);
    assert.match(html, /profile-question:event_001:investor-/);
    assert.match(html, /name="profile-question:/);
    assert.match(html, /Skip this question|先跳过这一题/);
    assert.match(html, /Review and confirm staged answers|查看并确认暂存回答/);
    assert.match(html, /Answers stay local until you confirm|回答会先留在本地/);
    assert.match(html, /最后一步：明确确认前，回答只保留在本地/);
    assert.match(html, /preferredIntroChannels.*偏好的引荐渠道/);
  });
});
