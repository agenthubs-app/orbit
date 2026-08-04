import assert from "node:assert/strict";
import test from "node:test";

import { createPostEventContactReviewService } from "../../features/events/service-factory";

test("live post-event review fails closed without presenting deterministic fixture prose", async () => {
  const result = await createPostEventContactReviewService("live").getPostEventReview({ eventId: "event:tokyo-ai-night" });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.provenance.aiProviderRequested, false);
  assert.doesNotMatch(JSON.stringify(result), /ready for post-event review|mock-post-event-rules/);
});
