import assert from "node:assert/strict";
import test from "node:test";

import { contactStructureDetailToView } from "../src/view-models/contact-structure-detail";

test("contactStructureDetailToView parses a compact structure drill-down", () => {
  const view = contactStructureDetailToView({
    bucket: { bucketId: "tokyo", contactCount: 2, label: "东京", percentage: 67 },
    commonTags: [{ contactCount: 2, label: "日本市场" }],
    contacts: [
      { id: "contact_1", displayName: "林玫", organization: "港湾创投", role: "投资合伙人", location: "东京", relationshipStrength: "strong", tags: ["日本市场"] }
    ],
    dimension: "location",
    insight: "东京是当前覆盖最集中的地区。",
    relationshipQuality: [{ id: "strong", label: "强关系", contactCount: 1, percentage: 50 }],
    state: "success",
    totalContactCount: 3
  });

  assert.equal(view.title, "东京");
  assert.equal(view.dimensionLabel, "地区");
  assert.equal(view.shareLabel, "2 人 · 占全部联系人 67%");
  assert.equal(view.contacts[0]?.relationshipLabel, "强关系");
});
