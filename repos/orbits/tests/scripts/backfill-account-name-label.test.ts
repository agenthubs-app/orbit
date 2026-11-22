import { strict as assert } from "node:assert";
import { test } from "node:test";

import { planAccountLabelBackfill } from "../../scripts/backfill-account-name-label";

test("account label backfill strips the fixed-language suffix and clears copied companies", () => {
  const planned = planAccountLabelBackfill([
    { collection_name: "accounts", record_id: "u1", value: "Orbit QA 的 Orbit", search_text: "Orbit QA qa@example.com" },
    { collection_name: "profiles", record_id: "profile:u1", value: "Orbit QA 的 Orbit", search_text: "Orbit QA Orbit QA 的 Orbit" },
    { collection_name: "contacts", record_id: "c1", value: "山田 的 Orbit", search_text: "山田 山田 的 Orbit yamada@example.com" },
  ]);
  assert.deepEqual(planned.map((change) => [change.collection, change.to, change.searchText]), [
    ["accounts", "Orbit QA", "Orbit QA qa@example.com"],
    ["profiles", null, "Orbit QA"],
    ["contacts", null, "山田 yamada@example.com"],
  ]);
});

test("account label backfill leaves real names and companies alone", () => {
  const planned = planAccountLabelBackfill([
    { collection_name: "accounts", record_id: "u2", value: "Member", search_text: "" },
    { collection_name: "contacts", record_id: "c2", value: "Orbit 株式会社", search_text: "" },
    { collection_name: "contacts", record_id: "c3", value: "主办方 的 Orbit 主办方账号", search_text: "" },
    { collection_name: "contacts", record_id: "c4", value: " 的 Orbit", search_text: "" },
    { collection_name: "notes", record_id: "n1", value: "X 的 Orbit", search_text: "" },
    { collection_name: "profiles", record_id: "p5", value: null, search_text: "" },
  ]);
  assert.deepEqual(planned, []);
});
