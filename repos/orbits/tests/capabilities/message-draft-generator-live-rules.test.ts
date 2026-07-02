import assert from "node:assert/strict";
import test from "node:test";

import { createLiveMessageDraftGeneratorService } from "../../features/followups/live-message-draft-service";
import {
  createMessageDraftGeneratorService,
  resolveMessageDraftGeneratorService,
} from "../../features/followups/service-factory";

test("live message draft generator creates review-only drafts from sourced context", () => {
  const service = createLiveMessageDraftGeneratorService();
  const result = service.createDraft({
    contextNote:
      "山崎 美穂 asked for a short review of the Aoba follow-up after the remote seed import.",
    draftKind: "follow_up",
    organization: "Aoba Technologies",
    recipientName: "山崎 美穂",
  });

  assert.equal(result.success, true);

  if (!result.success) {
    return;
  }

  assert.equal(result.data.state, "success");
  assert.equal(result.data.drafts.length, 1);
  assert.equal(
    result.data.provenance.privacy,
    "live-message-draft-generator-preview",
  );
  assert.equal(
    result.data.provenance.generationMethod,
    "live-rule-based-draft-generation",
  );
  assert.equal(result.data.provenance.aiProviderRequested, false);
  assert.equal(result.data.provenance.externalSendRequested, false);
  assert.equal(result.data.provenance.externalNetworkRequested, false);
  assert.equal(result.data.provenance.emailProviderRequested, false);
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.data.provenance.liveDatabaseWriteExecuted, false);

  const draft = result.data.drafts[0];

  assert.equal(draft?.kind, "follow_up");
  assert.equal(draft?.channel, "email");
  assert.equal(draft?.status, "draft");
  assert.equal(draft?.recipientName, "山崎 美穂");
  assert.equal(draft?.organization, "Aoba Technologies");
  assert.equal(draft?.generatedBy, "live-rule-based-draft-generation");
  assert.equal(draft?.source.generatedBy, "live-rule-based-draft-generation");
  assert.match(draft?.subject ?? "", /Aoba Technologies/);
  assert.match(draft?.body ?? "", /山崎 美穂/);
  assert.match(draft?.body ?? "", /remote seed import/);
  assert.equal(draft?.sendActionRequiresConfirmation, true);
  assert.equal(draft?.aiProviderRequested, false);
  assert.equal(draft?.externalSendRequested, false);
  assert.equal(draft?.externalNetworkRequested, false);
  assert.equal(draft?.emailProviderRequested, false);
  assert.equal(draft?.calendarProviderRequested, false);
  assert.equal(draft?.notificationDelivered, false);
  assert.equal(draft?.liveDatabaseReadExecuted, false);
  assert.equal(draft?.liveDatabaseWriteExecuted, false);
});

test("live message draft generator fails closed when no source context is supplied", () => {
  const service = createLiveMessageDraftGeneratorService();
  const result = service.createDraft();

  assert.equal(result.success, true);

  if (!result.success) {
    return;
  }

  assert.equal(result.data.state, "empty");
  assert.equal(result.data.drafts.length, 0);
  assert.match(result.data.nextAction, /relationship context|source/i);
  assert.equal(
    result.data.provenance.privacy,
    "live-message-draft-generator-preview",
  );
  assert.equal(result.data.provenance.aiProviderRequested, false);
  assert.equal(result.data.provenance.externalSendRequested, false);
  assert.equal(result.data.provenance.liveDatabaseWriteExecuted, false);
});

test("message draft generator factory registers live mode", () => {
  const resolution = resolveMessageDraftGeneratorService("live");
  const service = createMessageDraftGeneratorService("live");
  const result = service.createDraft({
    contextNote: "Remote task context is available for review.",
    draftKind: "follow_up",
    organization: "Aoba Technologies",
    recipientName: "山崎 美穂",
  });

  assert.equal(resolution.success, true);
  assert.equal(result.success, true);

  if (!result.success) {
    return;
  }

  assert.equal(result.data.drafts[0]?.generatedBy, "live-rule-based-draft-generation");
});
