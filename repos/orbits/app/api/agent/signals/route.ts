import { NextResponse } from "next/server";
import { createAgentAutomationService } from "../../../../features/agent/automations/service-factory";
import { runAgentAutomationsForSignals } from "../../../../features/agent/automations/runner";
import { createAgentMemoryService } from "../../../../features/agent/memory/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import {
  agentSignalErrorResponse,
  agentSignalUnauthorizedResponse,
  resolveAgentSignalRequest,
} from "./request";
import {
  agentSignalRefreshForView,
  listAgentSignalsForView,
} from "./view";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveAgentSignalRequest();
    if (!context) return agentSignalUnauthorizedResponse();
    const url = new URL(request.url);
    return NextResponse.json({
      data: {
        signals: await listAgentSignalsForView(context.service, url),
      },
      success: true,
    });
  } catch (error) {
    return agentSignalErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await resolveAgentSignalRequest();
    if (!context) return agentSignalUnauthorizedResponse();
    const result = await context.service.refresh();
    const viewResult = await agentSignalRefreshForView(
      context.service,
      new URL(request.url),
      result,
    );
    const actionableSignals = result.signals.filter(
      (signal) => signal.status === "new",
    );
    const mode = resolveModuleMode();
    const automationRuns = await runAgentAutomationsForSignals(
      createAgentAutomationService({
        actorId: context.actorId,
        mode,
      }),
      actionableSignals,
      {
        actorId: context.actorId,
        memory: await createAgentMemoryService({
          actorId: context.actorId,
          mode,
        }).context(),
        workerId: `signal-refresh:${context.actorId.slice(0, 80)}`,
      },
    );
    return NextResponse.json({
      data: {
        ...viewResult,
        automationRuns: automationRuns.map((automation) => ({
          automationId: automation.automationId,
          status: automation.lastRun?.status ?? automation.status,
        })),
      },
      success: true,
    });
  } catch (error) {
    return agentSignalErrorResponse(error);
  }
}
