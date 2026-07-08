import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for Sprint 90 calendar-action previews`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

interface CalendarPreviewSideEffects {
  externalCalendarMutation: false;
  messageSend: false;
  notificationDelivery: false;
  outsideNetworkRequest: false;
  savedRecordWrite: false;
}

interface CalendarActionPreview {
  actionId: string;
  confirmationStatus: "unconfirmed";
  completionBoundary: {
    confirmationAvailable: false;
    noExternalEventCreated: true;
    state: "awaiting_live_calendar_adapter";
  };
  itemId: string;
  label: string;
  localOnly: true;
  source: {
    artifactSource: string;
    evidenceIds: readonly string[];
    label: string;
  };
  state: "staged_unconfirmed";
  sideEffects: CalendarPreviewSideEffects;
  wouldAdd: {
    date: string;
    endTime: string | null;
    location: string | null;
    reason: string;
    relatedLink: {
      href: string;
      label: string;
    };
    startTime: string;
    time: string;
    timeZone: string;
    title: string;
  };
}

interface CalendarActionService {
  cancelPreview: (input: { actionId: string }) => {
    data: {
      actionId: string;
      state: "cancelled";
      sideEffects: CalendarPreviewSideEffects;
    };
    success: true;
  };
  createPreviews: (input: {
    conversation: { artifacts: readonly unknown[] };
    locale?: "en" | "zh";
  }) => {
    data: {
      previews: readonly CalendarActionPreview[];
      safety: CalendarPreviewSideEffects;
    };
    success: true;
  };
  stagePreview: (input: { preview: CalendarActionPreview }) => {
    data: CalendarActionPreview;
    success: true;
  };
}

function sideEffectsAreFalse(sideEffects: CalendarPreviewSideEffects) {
  assert.equal(sideEffects.savedRecordWrite, false);
  assert.equal(sideEffects.externalCalendarMutation, false);
  assert.equal(sideEffects.notificationDelivery, false);
  assert.equal(sideEffects.messageSend, false);
  assert.equal(sideEffects.outsideNetworkRequest, false);
}

function readFirstArtifactItem(conversation: {
  artifacts: readonly {
    result: {
      generatedView: {
        sections: readonly {
          items: readonly {
            actions: readonly { href?: string; label: string }[];
            id: string;
            metadata: readonly { label: string; value: string }[];
            reason?: string;
            title: string;
          }[];
        }[];
      } | null;
    };
  }[];
}) {
  return conversation.artifacts[0]?.result.generatedView?.sections[0]?.items[0];
}

function metadataValue(
  item: { metadata: readonly { label: string; value: string }[] },
  labels: readonly string[],
) {
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  return item.metadata.find((entry) =>
    normalized.has(entry.label.toLowerCase()),
  )?.value;
}

function manualArtifact(input: {
  endTime?: string;
  href?: string;
  kind: string;
  location?: string;
  reason?: string;
  startTime?: string;
  source?: string;
  time?: string;
  title?: string;
}) {
  return {
    result: {
      generatedView: {
        sections: [
          {
            items: [
              {
                actions: input.href
                  ? [
                      {
                        actionId: `${input.kind}:review:manual`,
                        href: input.href,
                        label: "Review source",
                        requiresConfirmation: true,
                      },
                    ]
                  : [],
                evidenceIds: ["evidence:calendar-action:manual"],
                id: `${input.kind}:manual-item`,
                metadata: [
                  ...(input.startTime
                    ? [{ label: "Start", value: input.startTime }]
                    : []),
                  ...(input.endTime
                    ? [{ label: "End", value: input.endTime }]
                    : []),
                  ...(input.time
                    ? [{ label: "When", value: input.time }]
                    : []),
                  ...(input.location
                    ? [{ label: "Location", value: input.location }]
                    : []),
                  ...(input.source
                    ? [{ label: "Source", value: input.source }]
                    : []),
                ],
                reason: input.reason,
                title: input.title ?? "Manual calendar candidate",
              },
            ],
            title: "Manual section",
          },
        ],
        summary: "Manual preview source",
      },
      provenance: {
        evidenceIds: ["evidence:calendar-action:manual"],
        source: "test:manual-artifact",
      },
    },
    task: {
      artifactId: `artifact:${input.kind}:manual`,
      kind: input.kind,
    },
  };
}

test("calendar-action service creates previews only from concrete title time link and reason", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAiCalendarActionService: () => CalendarActionService;
  }>("features/orbit-ai/calendar-action-service.ts");
  const conversationModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: {
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    actions: readonly { href?: string; label: string }[];
                    id: string;
                    metadata: readonly { label: string; value: string }[];
                    reason?: string;
                    title: string;
                  }[];
                }[];
              } | null;
            };
            task: { artifactId: string; kind: string };
          }[];
        };
        success: boolean;
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const service = serviceModule.createOrbitAiCalendarActionService();
  const eventConversation =
    conversationModule.createMockOrbitAgentConversationService().sendMessage({
      locale: "en",
      message:
        "Recommend events where I can meet investors for seed fundraising and founder feedback.",
    }).data;
  const eventItem = readFirstArtifactItem(eventConversation!);
  const eventPreview = service.createPreviews({
    conversation: eventConversation!,
    locale: "en",
  }).data.previews[0];

  assert.equal(eventPreview.label, "Preview add to calendar");
  assert.equal(eventPreview.wouldAdd.title, eventItem?.title);
  assert.equal(
    eventPreview.wouldAdd.time,
    metadataValue(eventItem!, ["Timing", "When"]),
  );
  assert.equal(eventPreview.wouldAdd.reason, eventItem?.reason);
  assert.equal(eventPreview.wouldAdd.relatedLink.href, eventItem?.actions[0]?.href);
  assert.equal(eventPreview.confirmationStatus, "unconfirmed");
  assert.equal(eventPreview.completionBoundary.confirmationAvailable, false);
  assert.equal(eventPreview.completionBoundary.noExternalEventCreated, true);
  assert.equal(
    eventPreview.completionBoundary.state,
    "awaiting_live_calendar_adapter",
  );
  assert.equal(eventPreview.localOnly, true);
  sideEffectsAreFalse(eventPreview.sideEffects);

  const todoConversation =
    conversationModule.createMockOrbitAgentConversationService().sendMessage({
      locale: "en",
      message:
        "What should I do today? Summarize my to-do list from conversations and schedule.",
    }).data;
  const todoItem = readFirstArtifactItem(todoConversation!);
  const todoPreview = service.createPreviews({
    conversation: todoConversation!,
    locale: "en",
  }).data.previews[0];

  assert.equal(todoPreview.wouldAdd.title, todoItem?.title);
  assert.equal(todoPreview.wouldAdd.time, metadataValue(todoItem!, ["Due"]));
  assert.equal(todoPreview.wouldAdd.reason, todoItem?.reason);
  assert.equal(todoPreview.wouldAdd.relatedLink.href, todoItem?.actions[0]?.href);

  const contactConversation = {
    artifacts: [
      manualArtifact({
        href: "/app/contacts/contact_010",
        kind: "contact_recommendations",
        reason: "Meet before asking for the introduction.",
        source: "Relationship graph",
        time: "2026-07-09T10:00:00+09:00",
        title: "Meet 胡家明 before the intro request",
      }),
    ],
  };
  const followupConversation = {
    artifacts: [
      manualArtifact({
        href: "/app/contacts/contact_010",
        kind: "followup_queue",
        reason: "A clear follow-up window exists.",
        source: "Followups service",
        time: "2026-07-08T15:00:00+09:00",
        title: "Follow up with Aoba Technologies",
      }),
    ],
  };

  assert.equal(
    service.createPreviews({ conversation: contactConversation }).data.previews
      .length,
    1,
  );
  assert.equal(
    service.createPreviews({ conversation: followupConversation }).data.previews
      .length,
    1,
  );

  const missingTime = {
    artifacts: [
      manualArtifact({
        href: "/app/events/demo-event-1",
        kind: "event_recommendations",
        reason: "No concrete time should mean no calendar affordance.",
        source: "Events service",
      }),
    ],
  };
  const missingReason = {
    artifacts: [
      manualArtifact({
        href: "/app/events/demo-event-1",
        kind: "event_recommendations",
        source: "Events service",
        time: "2026-07-09T10:00:00+09:00",
      }),
    ],
  };

  assert.equal(service.createPreviews({ conversation: missingTime }).data.previews.length, 0);
  assert.equal(service.createPreviews({ conversation: missingReason }).data.previews.length, 0);
});

test("calendar-action service supports to-do summary cards without side effects", async () => {
  const serviceModule = await importProjectModule<{
    ORBIT_AI_CALENDAR_ACTION_SUPPORTED_ARTIFACT_KINDS: readonly string[];
    createOrbitAiCalendarActionService: () => CalendarActionService;
  }>("features/orbit-ai/calendar-action-service.ts");
  const service = serviceModule.createOrbitAiCalendarActionService();
  const conversation = {
    artifacts: [
      manualArtifact({
        href: "/app/contacts/contact_010",
        kind: "todo_summary",
        reason:
          "Saved conversation context says this follow-up has a clear decision window.",
        source: "Saved relationship conversation",
        time: "2026-07-08T15:00:00+09:00",
        title: "Send the Aoba pilot timeline recap before the decision window",
      }),
    ],
  };

  assert.ok(
    serviceModule.ORBIT_AI_CALENDAR_ACTION_SUPPORTED_ARTIFACT_KINDS.includes(
      "todo_summary",
    ),
    "Sprint 90 must enumerate the to-do artifact kind in the calendar-action gate",
  );

  const preview = service.createPreviews({
    conversation,
    locale: "zh",
  }).data.previews[0];

  assert.equal(preview.artifactId, "artifact:todo_summary:manual");
  assert.equal(preview.itemId, "todo_summary:manual-item");
  assert.equal(preview.state, "staged_unconfirmed");
  assert.equal(preview.confirmationStatus, "unconfirmed");
  assert.equal(preview.localOnly, true);
  assert.equal(preview.source.label, "已保存关系对话");
  assert.equal(
    preview.wouldAdd.title,
    conversation.artifacts[0].result.generatedView.sections[0].items[0].title,
  );
  assert.equal(preview.wouldAdd.date, "2026-07-08");
  assert.equal(preview.wouldAdd.startTime, "15:00");
  assert.equal(preview.wouldAdd.endTime, null);
  assert.equal(preview.wouldAdd.timeZone, "Asia/Tokyo");
  assert.equal(preview.wouldAdd.location, null);
  assert.equal(preview.wouldAdd.relatedLink.href, "/app/contacts/contact_010");
  sideEffectsAreFalse(preview.sideEffects);

  const staged = service.stagePreview({ preview });
  assert.equal(staged.data.state, "staged_unconfirmed");
  assert.equal(staged.data.completionBoundary.confirmationAvailable, false);
  assert.equal(staged.data.completionBoundary.noExternalEventCreated, true);
  sideEffectsAreFalse(staged.data.sideEffects);

  const cancelled = service.cancelPreview({ actionId: preview.actionId });
  assert.equal(cancelled.data.state, "cancelled");
  sideEffectsAreFalse(cancelled.data.sideEffects);
});

test("calendar-action staging and cancellation remain no-side-effect local previews", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAiCalendarActionService: () => CalendarActionService;
  }>("features/orbit-ai/calendar-action-service.ts");
  const service = serviceModule.createOrbitAiCalendarActionService();
  const preview = service.createPreviews({
    conversation: {
      artifacts: [
        manualArtifact({
          href: "/app/events/demo-event-1",
          kind: "event_recommendations",
          reason: "This source-backed event has a specific review window.",
          source: "Events recommendation artifact",
          time: "2026-07-09T10:00:00+09:00",
          title: "Calendar preview safety review",
        }),
      ],
    },
  }).data.previews[0];
  const globals = globalThis as typeof globalThis & {
    fetch?: typeof fetch;
  };
  const originalFetch = globals.fetch;
  let outsideNetworkRequestCount = 0;
  globals.fetch = (() => {
    outsideNetworkRequestCount += 1;
    throw new Error("calendar-action preview must not request the network");
  }) as typeof fetch;

  try {
    const staged = service.stagePreview({ preview });
    const cancelled = service.cancelPreview({ actionId: preview.actionId });

    assert.equal(staged.success, true);
    assert.equal(staged.data.state, "staged_unconfirmed");
    assert.equal(staged.data.completionBoundary.confirmationAvailable, false);
    assert.equal(staged.data.completionBoundary.noExternalEventCreated, true);
    assert.equal(cancelled.success, true);
    assert.equal(cancelled.data.state, "cancelled");
    sideEffectsAreFalse(staged.data.sideEffects);
    sideEffectsAreFalse(cancelled.data.sideEffects);
    assert.equal(outsideNetworkRequestCount, 0);
  } finally {
    if (originalFetch) {
      globals.fetch = originalFetch;
    } else {
      delete globals.fetch;
    }
  }
});
