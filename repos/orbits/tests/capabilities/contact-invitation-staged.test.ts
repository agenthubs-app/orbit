import assert from "node:assert/strict";
import test from "node:test";

import {
  PATCH as confirmInvitationRoute,
  POST as prepareInvitationRoute,
} from "../../app/api/contact-invitations/route";
import { createStagedContactInvitationService } from "../../features/followups/staged-contact-invitation-service";

test("contact invitation preparation and confirmation remain separate no-send actions", async () => {
  const service = createStagedContactInvitationService({
    now: () => "2026-07-24T15:00:00.000Z",
  });
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
    await createStagedContactInvitationService().confirmInvitation({
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

test("contact invitation API prepares and confirms editable copy without sending", async () => {
  const preparedResponse = await prepareInvitationRoute(
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
  const preparedBody = await preparedResponse.json();

  assert.equal(preparedResponse.status, 200);
  assert.equal(preparedBody.success, true);
  assert.equal(preparedBody.data.status, "draft");

  const confirmedResponse = await confirmInvitationRoute(
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
});
