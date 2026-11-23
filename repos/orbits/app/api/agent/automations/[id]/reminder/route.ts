import { NextResponse } from "next/server";
import { setTaskReminder } from "../../../../../../features/agent/automations/reminder";
import { createAutomationRunStore } from "../../../../../../features/agent/automations/runs";
import { scheduledTaskView } from "../../../../../../features/agent/automations/task-view";
import { agentScheduledTaskReminderInputSchema } from "../../../../../../shared/api-schema/agent-v1";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  resolveAgentAutomationRequest,
} from "../../request";

export const dynamic = "force-dynamic";

/**
 * agent-design AG16: the reminder switch of one scheduled task, as the owner flips it on the task's own page — it takes
 * effect at once, with no card (saying it in the conversation makes a card instead). One switch per task, covering the
 * owner's phone and browser; no other task changes. Body: `{ push: boolean }`. A `locale` sent by older clients is
 * accepted and ignored: the reminder's sentence follows the language of the task's results. Answers with the task as
 * the list shows it.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestContext = await resolveAgentAutomationRequest();
  if (!requestContext) return agentAutomationUnauthorizedResponse();
  const parsed = agentScheduledTaskReminderInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "The body must be { push: boolean }." } }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    const automation = await setTaskReminder(requestContext.service, id, { push: parsed.data.push });
    if (!automation) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "No scheduled task matches that id." } }, { status: 404 });
    }
    const storage = requestContext.storage;
    const lastRun = storage ? (await createAutomationRunStore(storage.direct.store, storage.workspaceId).list(requestContext.actorId, automation.automationId, 20))[0] ?? null : null;
    return NextResponse.json({ success: true, data: { task: scheduledTaskView(automation, lastRun, new Date().toISOString()) } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return agentAutomationErrorResponse(error);
  }
}
