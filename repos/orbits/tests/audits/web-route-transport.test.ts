import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { buildFullProductFunctionalAuditInventory } from "../../scripts/generate-full-product-functional-audit.mjs";

import {
  expectedTransportForSurface,
  runtimePathForSurface,
  verifyWebRouteTransport,
} from "../../scripts/verify-web-route-transport.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = path.resolve(
  TEST_DIR,
  "../../../../docs/audits/full-product-functional-audit/inventory.json",
);
const inventory: ReturnType<typeof buildFullProductFunctionalAuditInventory> =
  JSON.parse(readFileSync(INVENTORY_PATH, "utf8"));
const webSurfaces = inventory.surfaces.filter(
  (surface) => surface.client === "web",
);
const webSurfaceByRuntimePath = new Map(
  webSurfaces.map((surface) => [
    runtimePathForSurface(surface),
    surface,
  ]),
);

function requiresAuthentication(pathname: string): boolean {
  const surface = webSurfaceByRuntimePath.get(pathname);
  assert.ok(surface, `missing Web surface for runtime path ${pathname}`);

  return (
    surface.access.policy === "authenticated-at-web-boundary" ||
    /^\/app\/events\/[^/]+\/register$/u.test(pathname)
  );
}

// iOrbit 任务 6b：46 → 53。审计 inventory 此前长期未重生成，这次重生成后 Web 表面从 46
// 条变成 53 条：减去任务 6a 归并掉的 /app/chat、/app/today、/app/schedule(+events/[id])、
// /app/followups 与更早批次删掉的 /app/contacts/{all-actions,graph,intros}、/app/dashboard、
// /app/party*，加上此前批次已上线却没进过清单的 /app/events/**（center / live / analytics /
// operations×4）、/app/tasks*、/app/inbox/sources/[id]、/app/invitations/[token]、
// /app/contacts/analysis/[dimension]/[bucketId]、/app/account/reset-password、
// /app/profile/continue、/app/agent/{actions,plan,strategy}、/app/home。
test("all dynamic Web routes have an explicit valid runtime sample", () => {
  const runtimePaths = webSurfaces.map(runtimePathForSurface);

  assert.equal(runtimePaths.length, 53);
  assert.equal(new Set(runtimePaths).size, 53);
  assert.equal(runtimePaths.includes("/app/events/EVT01"), true);
  assert.equal(
    runtimePaths.includes(
      "/dev/capabilities/business-card-review-and-confirm-flow",
    ),
    true,
  );
});

test("transport expectations distinguish public event detail from authenticated registration", () => {
  const eventDetail = webSurfaces.find(
    (surface) => surface.route === "/app/events/[id]",
  );
  const registration = webSurfaces.find(
    (surface) =>
      surface.route === "/app/events/[id]/register",
  );

  assert.deepEqual(
    expectedTransportForSurface(eventDetail, "/app/events/EVT01"),
    { status: 200, locationPrefix: null },
  );
  assert.deepEqual(
    expectedTransportForSurface(registration, "/app/events/EVT01/register"),
    {
      status: 307,
      locationPrefix:
        "/app/account/login?next=%2Fapp%2Fevents%2FEVT01%2Fregister",
    },
  );
});

test("whole-Web transport verification reports every route and any mismatch", async () => {
  const report = await verifyWebRouteTransport({
    baseUrl: "https://orbit.test",
    fetchImplementation: async (input: string | URL | Request) => {
      const pathname = new URL(String(input)).pathname;
      const authenticated = requiresAuthentication(pathname);
      return new Response(authenticated ? "" : "<title>Orbit</title>", {
        status: authenticated ? 307 : 200,
        headers: authenticated
          ? {
              location: `/app/account/login?next=${encodeURIComponent(pathname)}`,
            }
          : undefined,
      });
    },
  });

  // 20/26 → 34/19。okResponses 上升不是回归，而是把一批「从来没进过清单」的路由记了进来：
  // ORBIT_PRIVATE_APP_PREFIXES（`features/auth/app-auth-routing.ts:1-9`）只覆盖
  // /app/{admin,agent,contacts,home,platform,profile,settings}，所以 /app/tasks*、
  // /app/events/**、/app/inbox/sources/[id]、/app/invitations/[token]、/app/events/center
  // 这些路由在 Web 边界上是 public-at-web-boundary（页面内再自行鉴权）。任务 6a 从白名单
  // 里删掉的四条是 /app/{chat,followups,schedule,today}，它们的页面本身也已删除。
  // 2026-09-24：上面那条遗留已修。`/app/tasks` 进了 ORBIT_PRIVATE_APP_PREFIXES，四条
  // /app/tasks* 因此从「公开可达」转为「未登录跳登录」，计数 34/19 → 30/23（routeSurfaces
  // 不变）。这不是回归，是缺口被补上：`/app/tasks/relationship/[id]/page.tsx` 整页没有
  // `auth()`（同目录另外三个页面都有），此前未登录访客拿到的是取不到数据的编辑器空壳。
  // App 不受影响——它把该 href 翻译成自己的原生屏，不加载这个网页（见前缀表处的注释）。
  assert.deepEqual(report.summary, {
    routeSurfaces: 53,
    okResponses: 30,
    authRedirects: 23,
    failures: 0,
  });
  assert.equal(report.results.every((result) => result.conclusion === "pass"), true);

  const failedReport = await verifyWebRouteTransport({
    baseUrl: "https://orbit.test",
    fetchImplementation: async () =>
      new Response("<title>Failure</title>", { status: 500 }),
  });
  assert.equal(failedReport.summary.failures, 53);
});
