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

test("/app/events/[id] does not render the retired deterministic registration guide", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /loadRegistrationProfileGuideForCurrentTestUser/);
  assert.doesNotMatch(pageSource, /RegistrationProfileGuide/);
  assert.doesNotMatch(pageSource, /data-orbit-registration-profile-guide/);
  assert.doesNotMatch(pageSource, /deterministic profile questions/);
});

test("public event detail stays readable while registration itself requires authentication", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/page.tsx"),
    "utf8",
  );
  const registerSource = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/register/page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /getOrbitLandingViewModel/);
  assert.match(pageSource, /if \(catalogueEvent\)/);
  assert.match(pageSource, /const routeMode = undefined/);
  assert.match(pageSource, /actorId: session\.user\.id/);
  assert.doesNotMatch(pageSource, /readSearchParam\(query, "mode"\)/);
  assert.match(registerSource, /actorContext\.requestScoped/);
  assert.match(registerSource, /loadEventForRegistration\(id, actor\?\.id\)/);
  assert.match(
    registerSource,
    /createProfileService\(\)\.getProfile\(\{\s*actorId: actor\.id/,
  );
  assert.doesNotMatch(registerSource, /readSearchParam\(query, "mode"\)/);
  assert.doesNotMatch(registerSource, /readSearchParam\(query, "scenario"\)/);
  assert.match(registerSource, /\/app\/account\/login\?next=/);
  assert.match(registerSource, /eventRegistrationReturnPath\(id, preferredLanguage\)/);
});

test("event registration auth return preserves the first language value and encodes route parameters", async () => {
  const { eventRegistrationReturnPath } = await import(
    "../../app/(app)/app/events/[id]/register/registration-return-path"
  );

  assert.equal(
    eventRegistrationReturnPath("event/with space", "ja"),
    "/app/events/event%2Fwith%20space/register?language=ja",
  );
  assert.equal(
    eventRegistrationReturnPath("event_signup_01"),
    "/app/events/event_signup_01/register",
  );
});

test("/app/events/[id]/register renders public event questions without a mock query", async () => {
  const Page = (await import("../../app/(app)/app/events/[id]/register/page"))
    .default as (props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ id: "event_signup_01" }),
      searchParams: Promise.resolve({ language: "en" }),
    }),
  );

  assert.match(html, /Kansai Cross-Border Business Connect/);
  // 新版是一屏一题的自适应问答:SSR 渲染第一题、进度指示与选项胶囊。
  assert.match(html, /data-registration-stage="interview"/);
  assert.match(html, /1 \/ 8/);
  assert.match(html, /data-reg-option/);
  assert.match(html, /Answers stay scoped to this event/);
});

test("/app/events/[id]/register renders a public event without query setup", async () => {
  await withOrbitModuleMode("hybrid", async () => {
    const Page = (await import("../../app/(app)/app/events/[id]/register/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "event_signup_01" }),
      }),
    );

    assert.match(html, /<h1[^>]*>关西跨境商务对接会<\/h1>/);
    // 默认中文:一屏一题 + 本活动范围声明。
    assert.match(html, /data-registration-stage="interview"/);
    assert.match(html, /回答只用于本次活动|Answers stay scoped to this event/);
  });
});

test("/app/events/[id]/register uses reviewed English identity for public catalogue events", async () => {
  await withOrbitModuleMode("hybrid", async () => {
    const Page = (await import("../../app/(app)/app/events/[id]/register/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "event_signup_01" }),
        searchParams: Promise.resolve({ language: "en" }),
      }),
    );

    assert.match(
      html,
      /<h1[^>]*>Kansai Cross-Border Business Connect<\/h1>/,
    );
    assert.match(html, />Osaka</);
    assert.match(html, /At Kansai Cross-Border Business Connect,/);
    assert.doesNotMatch(html, /关西跨境商务对接会|>大阪</);
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
  assert.match(source, /createProfileService\(\)\.getProfile/);
  assert.doesNotMatch(source, /CURRENT_EVENT_REGISTRATION_PROFILE/);
  assert.doesNotMatch(source, /loadRegistrationProfileGuideForCurrentTestUser/);
});

test("the approved public catalogue enters registration with honest time status", async () => {
  const { loadEventForRegistration } = await import(
    "../../features/events/registration/event-loader"
  );
  const endedEvent = await loadEventForRegistration("event_01");
  const upcomingEvent = await loadEventForRegistration("event_signup_01");
  const upcomingEventByPublicCode =
    await loadEventForRegistration("EVTSIGNUP01");

  assert.equal(endedEvent?.status, "cancelled");
  assert.equal(upcomingEvent?.status, "imported");
  assert.equal(upcomingEventByPublicCode?.id, "event_signup_01");
  assert.equal(upcomingEvent?.title, "关西跨境商务对接会");
  assert.equal(
    upcomingEvent?.sourceMetadata.label,
    "活动导入：关西跨境商务对接会",
  );
  assert.ok(Date.parse(endedEvent?.endsAt ?? "") < Date.now());
  assert.ok(Date.parse(upcomingEvent?.endsAt ?? "") > Date.now());
  assert.equal(
    upcomingEvent?.sourceMetadata.provider,
    "orbit-public-event-catalogue",
  );
  assert.equal(upcomingEvent?.liveDatabaseWriteExecuted, false);
  assert.equal(upcomingEvent?.externalNetworkRequested, false);
});

test("registration loader does not preempt actor-scoped services with demo events", async () => {
  const loaderSource = readFileSync(
    join(
      projectRoot,
      "features/events/registration/event-loader.ts",
    ),
    "utf8",
  );

  assert.doesNotMatch(loaderSource, /mockEventRecords/);
  assert.doesNotMatch(loaderSource, /mockOrbitAiRecommendedEventDetailRecord/);
  assert.doesNotMatch(loaderSource, /knownRegistrationEvents/);

  await withOrbitModuleMode("live", async () => {
    const { loadEventForRegistration } = await import(
      "../../features/events/registration/event-loader"
    );

    assert.equal(await loadEventForRegistration("event_001"), null);
  });
});

test("registration fallback is transparent and exposes no fixture form", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/events/[id]/register/page.tsx",
    ),
    "utf8",
  );

  assert.match(source, /Registration unavailable/);
  assert.match(source, /No registration answers were saved/);
  assert.match(source, /does not create a registration, generate questions/);
  assert.doesNotMatch(source, /RegistrationGuideForm/);
  assert.doesNotMatch(source, /mockManualProfile|mockProfileFixture|Ari Lane/);
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
  assert.match(source, /data-reg-saved-registration/);
  assert.match(source, /data-reg-cancelled-registration/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /报名已保存|Registration saved/);
  assert.match(source, /报名已取消|Registration cancelled/);
  assert.match(source, /turn\.answer/);
  assert.match(source, /registrationBody\?\.error\?\.message/);
  assert.doesNotMatch(
    source,
    /if \(stage === "generating" && persona === null && transcript\.length > 0\)/,
  );

  const generationStart = source.indexOf("const runGeneration");
  const generationEnd = source.indexOf("async function submitAnswer");
  const generationSource = source.slice(generationStart, generationEnd);
  const registrationWrite = generationSource.indexOf("/registration`,");
  const personaGeneration = generationSource.indexOf("/registration/persona`,");

  assert.ok(registrationWrite >= 0);
  assert.ok(personaGeneration > registrationWrite);
  assert.doesNotMatch(generationSource, /Promise\.all/);
  assert.doesNotMatch(source, /email.*send|notify.*organizer/i);
});
