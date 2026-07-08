import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

function source(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertNoExternalDeliveryOrWrite(relativePath: string): void {
  const fileSource = source(relativePath);

  assert.doesNotMatch(fileSource, /\bfetch\s*\(/);
  assert.doesNotMatch(fileSource, /XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(fileSource, /sendgrid|postmark|gmail|smtp|twilio/i);
  assert.doesNotMatch(fileSource, /pushManager|showNotification|APNs|FCM|firebase/i);
  assert.doesNotMatch(fileSource, /calendar\.google|googleapis|GraphClient/i);
  assert.doesNotMatch(fileSource, /createClient|Supabase|new\s+Client\s*\(/i);
}

test("proactive calendar service creates one local email-like message for activities starting within one hour", async () => {
  const module = await importProjectModule<{
    createOrbitAiProactiveCalendarMessageService: (options?: {
      now?: () => string;
    }) => {
      createMessagesForUpcomingActivities: (input: {
        activities: readonly {
          activityId: string;
          title: string;
          startsAt: string;
          endsAt: string;
          people: readonly { name: string; context: string }[];
          recommendedPreparation: string;
          relationshipContext: string;
          sourceLabel: string;
          evidenceIds: readonly string[];
        }[];
      }) => {
        success: boolean;
        data?: {
          messages: readonly {
            activityId: string;
            body: string;
            conversationHref: string;
            conversationId: string;
            dedupeKey: string;
            deliverySurface: string;
            messageId: string;
            peopleContext: string;
            preparationPrompt: string;
            subject: string;
            timeLabel: string;
          }[];
          provenance: {
            safety: {
              calendarProviderRequested: false;
              calendarUpdateExecuted: false;
              emailProviderRequested: false;
              externalNetworkRequested: false;
              externalSideEffectsExecuted: false;
              notificationDelivered: false;
              pushProviderRequested: false;
              smsProviderRequested: false;
            };
          };
        };
      };
    };
  }>("features/orbit-ai/proactive-calendar-service.ts");

  const service = module.createOrbitAiProactiveCalendarMessageService({
    now: () => "2026-07-08T09:00:00.000Z",
  });
  const result = service.createMessagesForUpcomingActivities({
    activities: [
      {
        activityId: "event:soon",
        title: "Seed investor preparation call",
        startsAt: "2026-07-08T09:45:00.000Z",
        endsAt: "2026-07-08T10:15:00.000Z",
        people: [
          {
            context: "warm intro from last week's founder salon",
            name: "Mina Park",
          },
        ],
        recommendedPreparation:
          "Review the investor's climate portfolio and prepare two follow-up paths.",
        relationshipContext:
          "Mina is connected through the founder salon and asked for a short operator update.",
        sourceLabel: "Local calendar fixture",
        evidenceIds: ["evidence:calendar:event-soon"],
      },
      {
        activityId: "event:later",
        title: "Tomorrow partnership review",
        startsAt: "2026-07-08T11:30:00.000Z",
        endsAt: "2026-07-08T12:00:00.000Z",
        people: [],
        recommendedPreparation: "Review later.",
        relationshipContext: "Outside the one-hour window.",
        sourceLabel: "Local calendar fixture",
        evidenceIds: ["evidence:calendar:event-later"],
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.messages.length, 1);

  const message = result.data?.messages[0];
  assert.equal(message?.activityId, "event:soon");
  assert.match(message?.subject ?? "", /Seed investor preparation call/);
  assert.match(message?.timeLabel ?? "", /09:45/);
  assert.match(message?.peopleContext ?? "", /Mina Park/);
  assert.match(message?.body ?? "", /warm intro/);
  assert.match(message?.preparationPrompt ?? "", /climate portfolio/);
  assert.match(message?.conversationHref ?? "", /^\/app\/agent\?proactive=/);
  assert.equal(message?.deliverySurface, "orbit_in_app_inbox");
  assert.equal(result.data?.provenance.safety.externalSideEffectsExecuted, false);
  assert.equal(result.data?.provenance.safety.emailProviderRequested, false);
  assert.equal(result.data?.provenance.safety.smsProviderRequested, false);
  assert.equal(result.data?.provenance.safety.pushProviderRequested, false);
  assert.equal(result.data?.provenance.safety.calendarUpdateExecuted, false);
});

test("proactive calendar service is idempotent for the same activity window and can skip delivered keys", async () => {
  const module = await importProjectModule<{
    createOrbitAiProactiveCalendarMessageService: (options?: {
      now?: () => string;
    }) => {
      createMessagesForUpcomingActivities: (input: {
        activities: readonly {
          activityId: string;
          title: string;
          startsAt: string;
          endsAt: string;
          people: readonly { name: string; context: string }[];
          recommendedPreparation: string;
          relationshipContext: string;
          sourceLabel: string;
          evidenceIds: readonly string[];
        }[];
        deliveredDedupeKeys?: readonly string[];
      }) => {
        success: boolean;
        data?: {
          messages: readonly {
            conversationId: string;
            dedupeKey: string;
            messageId: string;
          }[];
        };
      };
    };
  }>("features/orbit-ai/proactive-calendar-service.ts");

  const service = module.createOrbitAiProactiveCalendarMessageService({
    now: () => "2026-07-08T09:00:00.000Z",
  });
  const activity = {
    activityId: "event:soon",
    title: "Seed investor preparation call",
    startsAt: "2026-07-08T09:45:00.000Z",
    endsAt: "2026-07-08T10:15:00.000Z",
    people: [{ context: "relationship context", name: "Mina Park" }],
    recommendedPreparation: "Prepare two paths.",
    relationshipContext: "Mina asked for an operator update.",
    sourceLabel: "Local calendar fixture",
    evidenceIds: ["evidence:calendar:event-soon"],
  } as const;

  const first = service.createMessagesForUpcomingActivities({
    activities: [activity],
  });
  const second = service.createMessagesForUpcomingActivities({
    activities: [activity],
  });
  const delivered = service.createMessagesForUpcomingActivities({
    activities: [activity],
    deliveredDedupeKeys: [first.data?.messages[0]?.dedupeKey ?? ""],
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.deepEqual(second.data?.messages, first.data?.messages);
  assert.equal(delivered.data?.messages.length, 0);
});

test("proactive message opens an Orbit AI conversation seeded by the triggering calendar activity", async () => {
  const module = await importProjectModule<{
    createOrbitAiProactiveCalendarMessageService: (options?: {
      now?: () => string;
    }) => {
      createMessagesForUpcomingActivities: (input: {
        activities: readonly {
          activityId: string;
          title: string;
          startsAt: string;
          endsAt: string;
          people: readonly { name: string; context: string }[];
          recommendedPreparation: string;
          relationshipContext: string;
          sourceLabel: string;
          evidenceIds: readonly string[];
        }[];
      }) => {
        success: boolean;
        data?: {
          conversations: readonly {
            activityId: string;
            firstAssistantResponse: string;
            initialPrompt: string;
            sourceMessageId: string;
          }[];
          messages: readonly { messageId: string }[];
        };
      };
    };
  }>("features/orbit-ai/proactive-calendar-service.ts");

  const result = module
    .createOrbitAiProactiveCalendarMessageService({
      now: () => "2026-07-08T09:00:00.000Z",
    })
    .createMessagesForUpcomingActivities({
      activities: [
        {
          activityId: "event:soon",
          title: "Seed investor preparation call",
          startsAt: "2026-07-08T09:45:00.000Z",
          endsAt: "2026-07-08T10:15:00.000Z",
          people: [
            {
              context: "warm intro from last week's founder salon",
              name: "Mina Park",
            },
          ],
          recommendedPreparation:
            "Review the investor's climate portfolio and prepare two follow-up paths.",
          relationshipContext:
            "Mina is connected through the founder salon and asked for a short operator update.",
          sourceLabel: "Local calendar fixture",
          evidenceIds: ["evidence:calendar:event-soon"],
        },
      ],
    });

  const message = result.data?.messages[0];
  const conversation = result.data?.conversations[0];

  assert.equal(conversation?.sourceMessageId, message?.messageId);
  assert.equal(conversation?.activityId, "event:soon");
  assert.match(conversation?.initialPrompt ?? "", /Seed investor preparation call/);
  assert.match(conversation?.firstAssistantResponse ?? "", /09:45/);
  assert.match(conversation?.firstAssistantResponse ?? "", /Mina Park/);
  assert.match(conversation?.firstAssistantResponse ?? "", /climate portfolio/);
});

test("proactive calendar implementation and docs prohibit external delivery side effects", () => {
  assertNoExternalDeliveryOrWrite(
    "features/orbit-ai/proactive-calendar-service.ts",
  );

  const doc = source("features/orbit-ai/PROACTIVE_AGENT_LIVE_IMPLEMENTATION.md");
  assert.match(doc, /one-hour timing window/i);
  assert.match(doc, /local delivery/i);
  assert.match(doc, /no external email/i);
  assert.match(doc, /push notification/i);
  assert.match(doc, /SMS/i);
  assert.match(doc, /calendar update/i);
  assert.match(doc, /privacy/i);
  assert.match(doc, /Replacement tests/i);
});
