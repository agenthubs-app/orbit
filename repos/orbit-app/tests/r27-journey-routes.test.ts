// R27：活动参加者动线的 App 路由都指向 src/screens/events/v2 的新屏（旧 EventDetailScreen / EventRegistrationScreen /
// RegisterInviteScreen / EventLiveScreen 已删除）；/register 跳到 R26 的参加コード入力。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("journey routes render the R27 screens behind the private gate; only detail and venue drop the online-only gate (LF2 page copies)", () => {
  for (const [route, screen] of [
    ["app/events/[id].tsx", "EventDetailPage"],
    ["app/events/[id]/register.tsx", "RegisterPage"],
    ["app/events/[id]/prep.tsx", "PrepPage"],
    ["app/events/[id]/live.tsx", "VenuePage"],
    ["app/events/[id]/after.tsx", "AfterPage"],
    ["app/register/[code].tsx", "RegisterCodePage"],
  ] as const) {
    const source = read(route);
    assert.match(source, new RegExp(`import \\{ ${screen} \\} from "[./]+src/screens/events/v2/${screen}"`), route);
    if (route === "app/events/[id].tsx" || route === "app/events/[id]/live.tsx") {
      // LF2: readable offline from the per-event page copy (event-overview / event-venue).
      assert.match(source, /withOrbitPrivateRoute\((EventDetailRoute|EventVenueRoute)\)/, route);
      assert.doesNotMatch(source, /withOnlineOnlyRoute/, route);
    } else assert.match(source, /withOrbitPrivateRoute\(withOnlineOnlyRoute\(/, route);
  }
  assert.match(read("app/register.tsx"), /<Redirect href=\{"\/events\/assess\?mode=code" as Href\} \/>/);
});

test("the old journey screens are gone", () => {
  for (const file of ["src/screens/events/EventDetailScreen.tsx", "src/screens/events/EventRegistrationScreen.tsx", "src/screens/register/RegisterInviteScreen.tsx", "src/screens/events/live/EventLiveScreen.tsx"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
});
