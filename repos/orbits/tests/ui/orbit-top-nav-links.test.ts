/**
 * 顶部导航链接完整性测试。
 *
 * 「真实导航」是硬性产品决定：导航里的每个 href 都必须解析到一个真实存在的
 * App Router 页面。这条测试是防止死链回归的闸门。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { productHref } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const shellSource = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
  "utf8",
);
const starfieldSources = [
  readFileSync(
    join(projectRoot, "app/(app)/app/orbit-starfield-desktop.tsx"),
    "utf8",
  ),
  readFileSync(
    join(projectRoot, "app/(app)/app/orbit-starfield-mobile.tsx"),
    "utf8",
  ),
];
const starfieldHomeSource = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-starfield-home.tsx"),
  "utf8",
);

function navHrefs(): readonly string[] {
  const start = shellSource.indexOf("const links = [");
  assert.ok(
    start >= 0,
    "could not locate the links array in orbit-public-shell.tsx — the nav shape changed and this gate is blind",
  );

  const end = shellSource.indexOf("] as const;", start);
  assert.ok(end > start, "could not locate the end of the links array");

  const hrefs = [...shellSource.slice(start, end).matchAll(/\["(\/[^"]*)"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    hrefs.length > 0,
    "nav href extraction returned nothing — the links array shape changed and this gate is blind",
  );

  return hrefs;
}

test("the nav order is always iOrbit, events, contacts", () => {
  // 2026-09-18 用户决定：Calendar/日程 tab 从导航移除，日历能力合入 iOrbit；
  // /today 路由保留但不再出现在主导航。
  assert.deepEqual(navHrefs(), ["/events", "/contacts"]);
});

test("starfield desktop and mobile trees delegate navigation to the shared product order", () => {
  assert.match(starfieldHomeSource, /<OrbitTopNav/);
  assert.match(starfieldHomeSource, /tone="starfield"/);

  for (const starfieldSource of starfieldSources) {
    assert.doesNotMatch(
      starfieldSource,
      /id="skNav"|href="\/app\/(?:agent|events|today|contacts)"/,
    );
  }
});

test("every nav href resolves to a real App Router page", () => {
  for (const href of navHrefs()) {
    const resolved = productHref(href);
    const pagePath = join(
      projectRoot,
      "app/(app)/app",
      resolved.replace(/^\/app\/?/, ""),
      "page.tsx",
    );

    assert.ok(
      existsSync(pagePath),
      `nav href ${href} resolves to ${resolved} but ${pagePath} does not exist`,
    );
  }
});

// iOrbit 任务 6a：`/app/schedule`、`/app/followups`、`/app/today` 三条路由已整条
// 删除（`ROUTE-CONSOLIDATION.md` 的判断标准：导航里没有入口、也没有外部深链生成
// 它们，就删掉而不是留重定向养着）。原来这条用例正好断它们**还在**，现在反过来
// 断它们**不在**，免得哪天悄悄回流。
test("the consolidated-away schedule / followups / today routes no longer exist", () => {
  for (const route of ["schedule", "followups", "today", "chat"]) {
    const pagePath = join(projectRoot, "app/(app)/app", route, "page.tsx");
    assert.ok(!existsSync(pagePath), `${route}/page.tsx should have been deleted by the route consolidation`);
  }
});

test("the retired schedule/日程 entry stays out of the nav links", () => {
  // 2026-09-18 用户决定：Calendar/日程 tab 从导航移除（日历合入 iOrbit），
  // 取代此前 T3「today-schedule 合并」后保留日程入口的决定；/today 路由保留。
  assert.ok(
    !navHrefs().includes("/today"),
    "/today must not return to the nav — calendar is merged into iOrbit",
  );
});

test("the retired prototype hrefs are gone", () => {
  for (const dead of ["/explore", "/home/schedule", "/home/cards"]) {
    assert.ok(
      !navHrefs().includes(dead),
      `${dead} is a known 404 and must not return to the nav`,
    );
  }
});

test("today is a member of the OrbitNavActive union", () => {
  const declaration = /export type OrbitNavActive =[^;]*;/.exec(shellSource)?.[0];

  assert.ok(declaration, "OrbitNavActive declaration not found");
  assert.ok(
    declaration.includes('"today"'),
    `OrbitNavActive must include "today": ${declaration}`,
  );
});

// iOrbit 任务 6a：原来这里有一条 "/app/today page eyebrow uses the same 日程/Schedule
// wording as the nav entry"。`/app/today` 已删除，眉标与导航入口名一致这条要求
// 现在落在 `/app/agent/plan` 的面包屑上，由 `app-agent-iorbit-screens.test.tsx`
// 按设计 430–432 断言。
