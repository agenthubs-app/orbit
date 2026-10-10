import assert from "node:assert/strict";
import test from "node:test";

import * as href from "../src/api/compute/plan-href";
// The case table lives with the server's tests; a test may read ../orbits (it never ships in the App bundle).
import { PLAN_HREF_CASES, type PlanHrefCase } from "../../orbits/tests/support/plan-href-cases";

// 改版 R22 review M1: deep links use the same path segments on both ends; the App runs the
// shared table against its synced copy of shared/compute.
const build = (item: PlanHrefCase, platform: href.PlanHrefPlatform): string => {
  const [a, b] = item.args;
  switch (item.call) {
    case "flow": return href.planFlowHref(platform, a!);
    case "draftEdit": return href.planDraftEditHref(platform, a!);
    case "overview": return href.planOverviewHref(platform, a!);
    case "type": return href.planTypeHref(platform, a!, b!);
    case "review": return href.planReviewHref(platform, a!);
    case "done": return href.planDoneHref(platform, a!);
    case "legacy": return href.planLegacyHref(platform, a!);
    case "taskSegment": return href.planTaskSegmentHref(platform, a);
  }
};

for (const item of PLAN_HREF_CASES) {
  test(`App copy — plan href: ${item.name}`, () => {
    assert.equal(build(item, "web"), item.web);
    assert.equal(build(item, "app"), item.app);
  });
}
