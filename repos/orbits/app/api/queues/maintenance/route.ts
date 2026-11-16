import { handleCallback } from "@vercel/queue";
import { isCanonicalReminderWakeMessage, processConfiguredCanonicalReminderWake } from "../../../../features/notifications/canonical-reminder-wake";
import { projectConfiguredReminderInbox } from "../../../../features/notifications/configured-canonical-reminder-maintenance";

export const maxDuration = 300;

// queue/v2beta restricts invocation to Vercel queue infrastructure. The topic (historically
// `maintenance-heartbeat`) now carries only delayed reminder wakes; scheduled maintenance runs from the hourly
// cron (/api/internal/maintenance). Anything else on the topic, such as a tick left over from the retired
// heartbeat chain, is acknowledged and dropped.
const consume = handleCallback(async (message: unknown) => {
  if (!isCanonicalReminderWakeMessage(message)) return;
  let outcome: string;
  try {
    outcome = (await processConfiguredCanonicalReminderWake(message)).outcome;
  } catch {
    throw new Error("Canonical reminder wake execution unavailable.");
  }
  console.info(JSON.stringify({ event: "canonical_reminder_wake", planId: message.planId, outcome }));
  if (outcome !== "delivered") return;
  try {
    await projectConfiguredReminderInbox();
  } catch {
    // The reminder is delivered; the inbox row follows on the next maintenance pass.
    console.error(JSON.stringify({ event: "canonical_reminder_wake_projection_failed" }));
  }
}, {
  visibilityTimeoutSeconds: 360,
  retry: () => ({ afterSeconds: 60 }),
});

export async function POST(request: Request): Promise<Response> { return consume(request); }
