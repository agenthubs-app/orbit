import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

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
    assert.match(html, /href="\/app\/events\/event_001\/register\?language=/);
    assert.doesNotMatch(html, /href="\/app\/events\/demo-event-1"/);
    assert.doesNotMatch(html, /Event workspace could not load/);
  });
});

test("/app/events/[id]/register renders event-specific optional participant-profile questions", async () => {
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
  // 新版是一屏一题的自适应问答:SSR 渲染第一题、进度指示与选项胶囊。
  assert.match(html, /data-registration-stage="interview"/);
  assert.match(html, /1 \/ 8/);
  assert.match(html, /data-reg-option/);
  assert.match(html, /Answers stay scoped to this event/);
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
    // 默认中文:一屏一题 + 本活动范围声明。
    assert.match(html, /data-registration-stage="interview"/);
    assert.match(html, /回答只用于本次活动|Answers stay scoped to this event/);
  });
});

test("registerable live events are not gated by the legacy deterministic-guide whitelist", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/events/[id]/register/page.tsx",
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /result\.state === "success" && event/);
  assert.match(source, /isRegisterableEventForWorkspace\(event\)/);
  assert.match(source, /CURRENT_EVENT_REGISTRATION_PROFILE/);
});

test("registration workspace exposes real register cancel and re-register states", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/events/[id]/register/event-registration-workspace.tsx",
    ),
    "utf8",
  );

  assert.match(source, /\/api\/events\/.*\/registration/);
  assert.match(source, /\/registration\/cancel/);
  // 新流程:答案在生成阶段自动持久化;支持取消报名与重新回答。
  assert.match(source, /registration\/interview/);
  assert.match(source, /registration\/persona/);
  assert.match(source, /取消报名|Cancel registration/);
  assert.match(source, /重新回答|Redo the interview/);
  assert.match(source, /participantProfile\.answers/);
  assert.doesNotMatch(source, /email.*send|notify.*organizer/i);
});
