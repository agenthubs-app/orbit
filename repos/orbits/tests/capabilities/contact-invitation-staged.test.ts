import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactInvitationGetHandler,
  createContactInvitationPatchHandler,
  createContactInvitationPostHandler,
} from "../../app/api/contact-invitations/handler";
import { createStagedContactInvitationService } from "../../features/followups/staged-contact-invitation-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:contact-invitation-test";

function serviceOptions(actorId: string) {
  return {
    actorId,
    now: () => "2026-07-24T15:00:00.000Z",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  };
}

test("contact invitation preparation and confirmation remain separate no-send actions", async () => {
  const service = createStagedContactInvitationService(
    serviceOptions("account:service-test"),
  );
  const prepared = await service.prepareInvitation({
    contactId: "contact:business-card:test",
    recipientEmail: "person@example.com",
    recipientName: "青空 太郎",
  });

  assert.equal(prepared.success, true);
  assert.equal(prepared.data.status, "draft");
  assert.match(prepared.data.subject, /Orbit/);
  assert.match(prepared.data.body, /青空 太郎/);
  assert.match(prepared.data.body, /join Orbit/i);
  assert.equal(prepared.data.externalSendRequested, false);
  assert.equal(prepared.data.emailProviderRequested, false);
  assert.equal(prepared.data.messageSent, false);

  const confirmed = await service.confirmInvitation({
    body: `${prepared.data.body}\n\nLooking forward to reconnecting.`,
    confirmed: true,
    invitationId: prepared.data.invitationId,
    subject: prepared.data.subject,
  });

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.status, "ready_for_delivery");
  assert.equal(confirmed.data.externalSendRequested, false);
  assert.equal(confirmed.data.emailProviderRequested, false);
  assert.equal(confirmed.data.messageSent, false);
  assert.match(confirmed.data.nextAction, /email delivery provider/i);
});

test("contact invitation confirmation fails closed without explicit confirmation", async () => {
  const result =
    await createStagedContactInvitationService(
      serviceOptions("account:confirmation-test"),
    ).confirmInvitation({
      body: "Please join Orbit.",
      confirmed: false,
      invitationId: "contact-invitation:test",
      subject: "Join Orbit",
    });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "CONTACT_INVITATION_CONFIRMATION_REQUIRED");
  assert.equal(result.error.externalSendRequested, false);
  assert.equal(result.error.emailProviderRequested, false);
  assert.equal(result.error.messageSent, false);
});

test("contact invitation API persists actor-owned drafts and rejects cross-actor confirmation", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const actorA = {
    id: "account:invitation-a",
    workspaceId: WORKSPACE_ID,
  };
  const actorB = {
    id: "account:invitation-b",
    workspaceId: WORKSPACE_ID,
  };
  const createService = (
    _mode: "live" | "mock",
    actor: typeof actorA,
  ) =>
    createStagedContactInvitationService({
      actorId: actor.id,
      now: () => "2026-07-24T15:00:00.000Z",
      store,
      workspaceId: actor.workspaceId,
    });
  const prepareInvitationRoute = createContactInvitationPostHandler({
    createService,
    resolveActor: async () => actorA,
  });
  const readInvitationAsActorA = createContactInvitationGetHandler({
    createService,
    resolveActor: async () => actorA,
  });
  const readInvitationAsActorB = createContactInvitationGetHandler({
    createService,
    resolveActor: async () => actorB,
  });
  const confirmInvitationAsActorA = createContactInvitationPatchHandler({
    createService,
    resolveActor: async () => actorA,
  });
  const confirmInvitationAsActorB = createContactInvitationPatchHandler({
    createService,
    resolveActor: async () => actorB,
  });
  const prepareRequest = () =>
    new Request("https://orbit.local/api/contact-invitations", {
      body: JSON.stringify({
        contactId: "contact:business-card:test",
        recipientEmail: "person@example.com",
        recipientName: "青空 太郎",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  const preparedResponse = await prepareInvitationRoute(prepareRequest());
  const preparedBody = await preparedResponse.json();

  assert.equal(preparedResponse.status, 200);
  assert.equal(preparedBody.success, true);
  assert.equal(preparedBody.data.status, "draft");

  const repeatedPreparedResponse = await prepareInvitationRoute(
    prepareRequest(),
  );
  const repeatedPreparedBody = await repeatedPreparedResponse.json();
  assert.equal(
    repeatedPreparedBody.data.invitationId,
    preparedBody.data.invitationId,
  );
  assert.equal(
    (
      await store.listRecords({
        collectionName: "contact_invitations",
        userId: actorA.id,
        workspaceId: WORKSPACE_ID,
      })
    ).length,
    1,
  );

  const actorBReadResponse = await readInvitationAsActorB(
    new Request(
      `https://orbit.local/api/contact-invitations?invitationId=${encodeURIComponent(preparedBody.data.invitationId)}`,
    ),
  );
  assert.equal(actorBReadResponse.status, 404);

  const actorBConfirmResponse = await confirmInvitationAsActorB(
    new Request("https://orbit.local/api/contact-invitations", {
      body: JSON.stringify({
        body: preparedBody.data.body,
        confirmed: true,
        invitationId: preparedBody.data.invitationId,
        subject: preparedBody.data.subject,
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
  );
  assert.equal(actorBConfirmResponse.status, 404);

  const confirmedResponse = await confirmInvitationAsActorA(
    new Request("https://orbit.local/api/contact-invitations", {
      body: JSON.stringify({
        body: preparedBody.data.body,
        confirmed: true,
        invitationId: preparedBody.data.invitationId,
        subject: preparedBody.data.subject,
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
  );
  const confirmedBody = await confirmedResponse.json();

  assert.equal(confirmedResponse.status, 200);
  assert.equal(confirmedBody.success, true);
  assert.equal(confirmedBody.data.status, "ready_for_delivery");
  assert.equal(confirmedBody.data.messageSent, false);

  const readbackResponse = await readInvitationAsActorA(
    new Request(
      `https://orbit.local/api/contact-invitations?invitationId=${encodeURIComponent(preparedBody.data.invitationId)}`,
    ),
  );
  const readbackBody = await readbackResponse.json();
  assert.equal(readbackResponse.status, 200);
  assert.equal(readbackBody.data.status, "ready_for_delivery");
  assert.equal(readbackBody.data.invitationId, preparedBody.data.invitationId);
});

test("contact invitation API requires an authenticated actor before storage", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const prepareInvitationRoute = createContactInvitationPostHandler({
    createService: () =>
      createStagedContactInvitationService({
        actorId: "must-not-run",
        store,
        workspaceId: WORKSPACE_ID,
      }),
    resolveActor: async () => null,
  });
  const response = await prepareInvitationRoute(
    new Request("https://orbit.local/api/contact-invitations", {
      body: JSON.stringify({
        contactId: "contact:business-card:test",
        recipientEmail: "person@example.com",
        recipientName: "青空 太郎",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(
    (
      await store.listRecords({
        collectionName: "contact_invitations",
        workspaceId: WORKSPACE_ID,
      })
    ).length,
    0,
  );
});
