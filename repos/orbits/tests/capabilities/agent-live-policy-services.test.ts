import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentAutonomySettingsService,
  createExternalActionSandboxService,
} from "../../features/agent/service-factory";
import { createSensitiveActionConfirmationService } from "../../features/permissions/service-factory";

test("agent autonomy settings resolves an explicit live safety policy service", () => {
  const service = createAgentAutonomySettingsService("live");
  const settings = service.getSettings();
  const update = service.updateSettings({
    actorLabel: "Orbit operator",
    requestedLevel: "high",
  });

  assert.equal(settings.success, true);
  assert.equal(update.success, true);

  if (settings.success && update.success) {
    assert.equal(
      settings.data.provenance.privacy,
      "live-agent-autonomy-settings-policy",
    );
    assert.equal(settings.data.provenance.generationMethod, "live-policy");
    assert.equal(update.data.provenance.generationMethod, "live-policy-update");
    assert.equal(update.data.externalSideEffectExecuted, false);
    assert.equal(update.data.autonomousExecutionStarted, false);
    assert.equal(update.data.scheduledLiveAgentJobRegistered, false);
  }
});

test("sensitive action confirmation resolves an explicit live confirmation policy service", () => {
  const service = createSensitiveActionConfirmationService("live");
  const requirements = service.listConfirmationRequirements();
  const decision = service.approveConfirmation({
    actorLabel: "Orbit operator",
    confirmationId: "live-confirmation-send-message",
  });

  assert.equal(requirements.success, true);
  assert.equal(decision.success, true);

  if (requirements.success && decision.success) {
    assert.equal(
      requirements.data.provenance.privacy,
      "live-confirmation-guard-policy",
    );
    assert.equal(
      requirements.data.provenance.generationMethod,
      "live-policy-confirmation-guard",
    );
    assert.equal(decision.data.decision.externalActionExecuted, false);
    assert.equal(decision.data.requirement.action.externalActionExecuted, false);
  }
});

test("external action sandbox resolves an explicit live no-op policy service", () => {
  const service = createExternalActionSandboxService("live");
  const audit = service.listAuditRecords();
  const noOp = service.sendMessage({
    actionId: "live-sandbox-send-message",
    actorLabel: "Orbit operator",
    targetLabel: "山田 千尋",
  });

  assert.equal(audit.success, true);
  assert.equal(noOp.success, true);

  if (audit.success && noOp.success) {
    assert.equal(
      audit.data.provenance.privacy,
      "live-external-action-sandbox-policy",
    );
    assert.equal(audit.data.provenance.generationMethod, "live-policy-state");
    assert.equal(noOp.data.provenance.generationMethod, "live-policy-no-op");
    assert.equal(noOp.data.providerRequestIssued, false);
    assert.equal(noOp.data.externalSideEffectExecuted, false);
    assert.equal(noOp.data.targetLabel, "山田 千尋");
  }
});
