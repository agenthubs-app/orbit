import assert from "node:assert/strict";
import test from "node:test";

import * as href from "../../shared/compute/plan-href";
import { PLAN_HREF_CASES, type PlanHrefCase } from "../support/plan-href-cases";

// R22 复核 M1：深链两端同路径；同一张表在 App 侧对同步副本再跑一遍。
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
  test(`plan href: ${item.name}`, () => {
    assert.equal(build(item, "web"), item.web);
    assert.equal(build(item, "app"), item.app);
  });
}
