import assert from "node:assert/strict";
import test from "node:test";

import { platformToView } from "../src/view-models/platform";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

const eventsPayload = {
  events: [
    {
      endsAt: "2026-08-04T16:00:00.000+09:00",
      id: "event_signup_03",
      relationshipValue: "为中国企业在日本落地找到可信合作方",
      sourceMetadata: {
        label: "东京 AI 落地伙伴报名会"
      },
      startsAt: "2026-08-04T14:00:00.000+09:00",
      status: "scheduled",
      title: "东京 AI 落地伙伴报名会",
      venue: "Tokyo"
    },
    {
      endsAt: "2026-07-21T12:00:00.000+09:00",
      id: "kansai-cross-border",
      sourceMetadata: {
        captureMethod: "live-record",
        label: "关西跨境商务交流会"
      },
      startsAt: "2026-07-21T10:00:00.000+09:00",
      status: "scheduled",
      title: "关西跨境商务交流会",
      venue: "Osaka"
    }
  ]
};

test("platformToView maps live app payloads into a Chinese platform overview", () => {
  const view = platformToView({
    dashboard: {
      relationshipAssetTotals: {
        contacts: 42
      }
    },
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: {
      company: "Orbit",
      fullName: "赵翔",
      title: "Orbit 创始人"
    }
  });

  assert.equal(view.title, "平台总览");
  assert.equal(view.summary, "整个平台当前有 1 场即将开始的公开活动，优先确认活动质量和主办方承接能力。");
  assert.deepEqual(
    view.stats.map((stat) => [stat.label, stat.value]),
    [
      ["主办方账号", "1"],
      ["累计活动", "2"],
      ["待复核", "1"],
      ["关系资产", "42"]
    ]
  );
  assert.equal(view.reviewQueue[0]?.title, "东京 AI 落地伙伴报名会");
  assert.equal(view.reviewQueue[0]?.stateLabel, "即将开始");
  assert.equal(view.orgAccounts[0]?.name, "Orbit");
  assert.equal(view.orgAccounts[0]?.owner, "赵翔");
  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|source-backed|implementation|command-center|live-record|database|postgres)\b/iu
  );
});

test("platformToView falls back to a controlled empty platform state", () => {
  const view = platformToView({
    dashboard: {},
    events: {
      events: []
    },
    profile: {}
  });

  assert.equal(view.stats[1]?.value, "0");
  assert.equal(view.reviewQueue.length, 0);
  assert.equal(view.emptyReviewTitle, "暂无需要复核的活动");
});

test("platformToView prefers Chinese event labels over mixed-language titles", () => {
  const view = platformToView({
    events: {
      events: [
        {
          endsAt: "2026-08-18T20:00:00.000+09:00",
          id: "investor-salon",
          sourceMetadata: {
            label: "日中投资人与创业者报名沙龙"
          },
          startsAt: "2026-08-18T18:00:00.000+09:00",
          status: "scheduled",
          title:
            "日中投資家・創業者申込サロン / Japan-China Investor Founder Signup Salon",
          venue: "Tokyo"
        }
      ]
    },
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: {
      company: "Orbit"
    }
  });

  assert.equal(view.reviewQueue[0]?.title, "日中投资人与创业者报名沙龙");
  assert.doesNotMatch(view.reviewQueue[0]?.title ?? "", /[ぁ-ヿ]|Japan-China/u);
});
