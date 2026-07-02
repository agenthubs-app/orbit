import assert from "node:assert/strict";
import test from "node:test";

import { createLivePostEventContactReviewService } from "../../features/events/post-event-review/live-service";
import { createGeneratedPostEventContactReviewProvider } from "../../features/events/post-event-review/storage/generated-post-event-review-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live post-event review generates contact drafts from generated attendees and persists confirmation", async () => {
  const workspaceId = "workspace:post-event-review-generated-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T01:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createGeneratedPostEventContactReviewProvider({
    now: () => "2026-07-02T01:05:00.000Z",
    sourceLabel: "Generated post-event review memory live storage",
    store,
    workspaceId,
  });
  const service = createLivePostEventContactReviewService({
    now: () => "2026-07-02T01:10:00.000Z",
    provider,
  });

  const review = await service.getPostEventReview({ eventId: "event_01" });

  assert.equal(review.success, true);
  assert.equal(review.data.event.id, "event_01");
  assert.match(review.data.event.title, /東京インバウンド飲食店成長会/);
  assert.equal(review.data.contacts.length, 2);
  assert.equal(review.data.contacts[0]?.status, "needs_review");
  assert.match(review.data.contacts[0]?.summary.headline ?? "", /post-event review/);
  assert.equal(review.data.contacts[0]?.summary.aiProviderRequested, false);
  assert.equal(
    review.data.contacts[0]?.followUpSuggestion.externalMessageSendRequested,
    false,
  );
  assert.equal(review.data.contacts[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(review.data.contacts[0]?.batchPersistenceExecuted, false);
  assert.equal(
    review.data.provenance.source,
    `live-record-store:post-event-review:${workspaceId}`,
  );
  assert.equal(
    review.data.provenance.sourceLabel,
    "Generated post-event review memory live storage",
  );
  assert.equal(review.data.provenance.generationMethod, "live-store-query");
  assert.equal(review.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(review.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(review.data.provenance.batchPersistenceExecuted, false);
  assert.equal(review.data.provenance.aiProviderRequested, false);
  assert.equal(review.data.provenance.externalNetworkRequested, false);
  assert.equal(review.data.provenance.notificationDelivered, false);

  const draftId = review.data.contacts[0]?.contactDraftId;
  assert.equal(typeof draftId, "string");

  const confirmation = await service.confirmPostEventContacts({
    contactDraftIds: [draftId],
    eventId: "event_01",
  });

  assert.equal(confirmation.success, true);
  assert.equal(confirmation.data.eventId, "event_01");
  assert.equal(confirmation.data.confirmedContacts.length, 1);
  assert.equal(confirmation.data.confirmedContacts[0]?.contactDraftId, draftId);
  assert.equal(
    confirmation.data.confirmedContacts[0]?.externalMessageSendRequested,
    false,
  );
  assert.equal(confirmation.data.confirmedContacts[0]?.notificationDelivered, false);
  assert.equal(confirmation.data.provenance.generationMethod, "live-store-confirmation");
  assert.equal(confirmation.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(confirmation.data.provenance.batchPersistenceExecuted, true);
  assert.equal(confirmation.data.provenance.emailProviderRequested, false);
  assert.equal(confirmation.data.provenance.notificationDelivered, false);
});
