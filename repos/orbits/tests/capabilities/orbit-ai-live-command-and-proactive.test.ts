import assert from "node:assert/strict";
import test from "node:test";

import { createLiveOrbitAiProactiveAgentService } from "../../features/orbit-ai/live-proactive-service";
import { resolveOrbitAiProactiveAgentService } from "../../features/orbit-ai/proactive-service-factory";
import { createLiveOrbitAiCommandService } from "../../features/orbit-ai/live-command-service";
import { resolveOrbitAiCommandService } from "../../features/orbit-ai/service-factory";

test("Orbit AI command and proactive agent register explicit live services", () => {
  const command = resolveOrbitAiCommandService("live");
  const proactive = resolveOrbitAiProactiveAgentService("live");

  assert.equal(
    command.success,
    true,
    command.success === false ? command.error.message : "",
  );
  assert.equal(
    proactive.success,
    true,
    proactive.success === false ? proactive.error.message : "",
  );
});

test("live Orbit AI command service composes async live child services without side effects", async () => {
  const service = createLiveOrbitAiCommandService({
    agentService: {
      acceptAction: async () => ({ success: true, data: {} }) as any,
      dismissAction: async () => ({ success: true, data: {} }) as any,
      listActions: async () =>
        ({
          success: true,
          data: {
            actions: [
              {
                title: "Review Akari introduction",
                recommendedAction: "Confirm the intro before sending anything.",
                evidenceIds: ["evidence:agent-action:akari-intro"],
              },
            ],
            provenance: {
              evidenceIds: ["evidence:agent-actions-live"],
            },
          },
        }) as any,
    },
    contactsService: {
      listContacts: async () =>
        ({
          success: true,
          data: {
            contacts: [
              {
                displayName: "Akari Mori",
                organization: "Mori Climate Studio",
                relationshipContext: "Climate fintech intro path",
                nextAction: "Prepare a warm intro",
                evidence: [{ evidenceId: "evidence:contact:akari" }],
              },
            ],
            provenance: {
              evidenceIds: ["evidence:contacts-live"],
            },
          },
        }) as any,
      searchContacts: async () => ({ success: true, data: {} }) as any,
    },
    dashboardService: {
      getDashboardAggregate: async () => ({ success: true, data: {} }) as any,
      getDashboardSummary: async () =>
        ({
          success: true,
          data: {
            metrics: [
              {
                label: "Relationship assets",
                value: 42,
                evidenceIds: ["evidence:dashboard:assets"],
              },
            ],
            provenance: {
              evidenceIds: ["evidence:dashboard-live"],
            },
          },
        }) as any,
    },
    eventService: {
      createEvent: async () => ({ success: true, data: {} }) as any,
      getEvent: async () => ({ success: true, data: {} }) as any,
      listEvents: async () =>
        ({
          success: true,
          data: {
            events: [
              {
                title: "Remote AI Founder Breakfast",
                recommendedPreparation:
                  "Prepare the Akari climate fintech context.",
                nextAction: "Open event readiness",
                evidence: [{ evidenceId: "evidence:event:remote-ai-breakfast" }],
              },
            ],
            provenance: {
              evidenceIds: ["evidence:events-live"],
            },
          },
        }) as any,
    },
    followupService: {
      generateTasks: async () => ({ success: true, data: {} }) as any,
      listTasks: async () =>
        ({
          success: true,
          data: {
            tasks: [
              {
                title: "Follow up with Daniel Ahmed",
                recommendedAction: "Review the sourced draft first.",
                evidenceIds: ["evidence:followup:daniel"],
              },
            ],
            provenance: {
              evidenceIds: ["evidence:followups-live"],
            },
          },
        }) as any,
    },
  });

  const result = await service.getCommandCenter({
    language: "en",
    prompt: "show my live priorities",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sideEffectsExecuted, false);
  assert.equal(result.data.panel, "home");
  assert.deepEqual(
    result.data.evidenceIds.slice(0, 5),
    [
      "evidence:events-live",
      "evidence:contacts-live",
      "evidence:followups-live",
      "evidence:dashboard-live",
      "evidence:agent-actions-live",
    ],
  );
  assert.match(
    result.data.stageItems.map((item) => item.title).join(" "),
    /Remote AI Founder Breakfast/,
  );
  assert.match(result.data.assistantMessage, /live Orbit context/i);
});

test("live Orbit AI proactive agent creates in-chat turns without notification delivery", () => {
  const service = createLiveOrbitAiProactiveAgentService({
    now: () => "2026-07-02T09:00:00.000Z",
  });

  const result = service.createProactiveTurn({
    signal: {
      body: "The sourced draft is ready for review.",
      evidenceIds: ["evidence:followup:daniel"],
      signalId: "signal:followup:daniel-review",
      sourceModule: "followups",
      title: "Daniel follow-up is due",
      type: "followup_due",
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.data.message.deliverySurface, "orbit_ai_chat");
  assert.equal(result.data.message.turnKind, "proactive");
  assert.equal(result.data.provenance.source, "live-policy:orbit-ai-proactive-agent");
  assert.equal(
    result.data.provenance.generationMethod,
    "live-policy-proactive-turn",
  );
  assert.equal(result.data.provenance.safety.notificationDelivered, false);
  assert.equal(result.data.provenance.safety.pushProviderRequested, false);
  assert.equal(result.data.provenance.safety.liveDatabaseWriteExecuted, false);
  assert.match(result.data.nextAction, /Orbit AI chat/i);
});
