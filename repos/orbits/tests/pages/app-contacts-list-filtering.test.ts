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
