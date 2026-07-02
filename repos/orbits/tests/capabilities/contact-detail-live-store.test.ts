import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live contact detail reads generated contact graph and previews tag status updates", async () => {
  const workspaceId = "workspace:contact-detail-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T02:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageContactGraphProvider({
    sourceLabel: "Contact detail memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveContactDetailTagStatusService({
    now: () => "2026-07-02T02:05:00.000Z",
    provider,
  });

  const detail = await service.getContactDetail({ contactId: "contact_078" });

  assert.equal(detail.success, true);
  assert.equal(detail.data.contact?.id, "contact_078");
  assert.ok(detail.data.contact?.displayName);
  assert.equal(detail.data.contact?.databaseReadExecuted, true);
  assert.equal(detail.data.contact?.databaseWriteExecuted, false);
  assert.equal(detail.data.contact?.tagWriteExecuted, false);
  assert.equal(detail.data.contact?.statusWriteExecuted, false);
  assert.equal(detail.data.contact?.productionAuditLogWriteExecuted, false);
  assert.equal(
    detail.data.provenance.source,
    `live-record-store:contacts:${workspaceId}`,
  );
  assert.equal(
    detail.data.provenance.sourceLabel,
    "Contact detail memory live storage",
  );
  assert.equal(detail.data.provenance.generationMethod, "live-store-query");
  assert.equal(detail.data.provenance.databaseReadExecuted, true);
  assert.equal(detail.data.provenance.databaseWriteExecuted, false);
  assert.equal(detail.data.provenance.aiProviderRequested, false);
  assert.equal(detail.data.provenance.externalNetworkRequested, false);

  const updated = await service.updateContactDetail({
    addTags: ["topic:venture-ecosystem"],
    contactId: "contact_078",
    lastInteraction: {
      channel: "manual_note",
      occurredAt: "2026-07-02T02:10:00.000Z",
      summary: "Operator reviewed live contact detail after the event.",
    },
    note: {
      authorLabel: "Orbit operator",
      body: "Previewed a live contact detail status update without writing Contacts.",
    },
    status: "active",
  });

  assert.equal(updated.success, true);
  assert.equal(updated.data.contact?.id, "contact_078");
  assert.equal(updated.data.contact?.status, "active");
  assert.ok(updated.data.contact?.tags.includes("topic:venture-ecosystem"));
  assert.match(
    updated.data.contact?.notes.at(-1)?.body ?? "",
    /Previewed a live contact detail status update/,
  );
  assert.equal(
    updated.data.contact?.lastInteraction.summary,
    "Operator reviewed live contact detail after the event.",
  );
  assert.equal(
    updated.data.provenance.generationMethod,
    "live-store-preview-update",
  );
  assert.equal(updated.data.provenance.databaseReadExecuted, true);
  assert.equal(updated.data.provenance.databaseWriteExecuted, false);
  assert.equal(updated.data.provenance.productionAuditLogWriteExecuted, false);
});
