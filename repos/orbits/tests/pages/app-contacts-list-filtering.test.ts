import assert from "node:assert/strict";
import test from "node:test";

import { filterConnections } from "../../app/(app)/app/contacts/orbit-real-contacts";
import type { OrbitContactView } from "../../app/(app)/app/orbit-contacts-route-view-model";

function contact(
  id: string,
  input: Partial<OrbitContactView> = {},
): OrbitContactView {
  return {
    company: "",
    displayName: id,
    dormant: false,
    email: "",
    encounters: [],
    g: "g-violet",
    id,
    industry: "",
    initial: id.slice(0, 1),
    lastEventId: "",
    lastInteraction: "",
    lineId: "",
    met: "",
    nextAction: null,
    note: "",
    notes: [],
    offering: "",
    phone: "",
    pipelineStatus: "to_contact",
    seeking: "",
    source: "contact",
    stage: "",
    strength: "medium",
    title: "",
    valueTags: [],
    wechat: "",
    ...input,
  };
}

test("contact list search includes relationship value and next-action evidence", () => {
  const investor = contact("investor", {
    nextAction: {
      reason: "Warm introduction path is open",
      text: "Prepare investor follow-up",
    },
    valueTags: ["Investor access"],
  });
  const operator = contact("operator", {
    title: "Operations lead",
    valueTags: ["Pilot partner"],
  });

  assert.deepEqual(
    filterConnections([investor, operator], "investor").map((item) => item.id),
    ["investor"],
  );
  assert.deepEqual(
    filterConnections([investor, operator], "warm introduction").map(
      (item) => item.id,
    ),
    ["investor"],
  );
});

test("contact list combines stage and data-derived value-tag filters", () => {
  const pendingInvestor = contact("pending-investor", {
    pipelineStatus: "to_contact",
    valueTags: ["Investor access"],
  });
  const activeInvestor = contact("active-investor", {
    pipelineStatus: "in_progress",
    valueTags: ["Investor access"],
  });
  const activePartner = contact("active-partner", {
    pipelineStatus: "in_progress",
    valueTags: ["Pilot partner"],
  });

  assert.deepEqual(
    filterConnections(
      [pendingInvestor, activeInvestor, activePartner],
      "",
      "in_progress",
      "investor access",
    ).map((item) => item.id),
    ["active-investor"],
  );
});

test("contact list search normalizes Unicode and matches every Chinese search term", () => {
  const investor = contact("lin-mei", {
    company: "港湾创投",
    note: "长期关注日本人工智能早期项目",
    title: "投资合伙人",
    offering: "人工智能 AI 项目筛选",
    strength: "strong",
  });
  const operator = contact("operator", {
    company: "云端机器人",
    title: "创始人",
  });

  assert.deepEqual(
    filterConnections([investor, operator], "人工智能 投资").map(
      (item) => item.id,
    ),
    ["lin-mei"],
  );
  assert.deepEqual(
    filterConnections([investor, operator], "投资人").map((item) => item.id),
    ["lin-mei"],
  );
  assert.deepEqual(
    filterConnections([investor, operator], "ＡＩ").map((item) => item.id),
    ["lin-mei"],
  );
});

test("high-value contact search uses relationship strength semantics", () => {
  const strong = contact("strong", { strength: "strong" });
  const medium = contact("medium", { strength: "medium" });

  assert.deepEqual(
    filterConnections([strong, medium], "高价值").map((item) => item.id),
    ["strong"],
  );
});
