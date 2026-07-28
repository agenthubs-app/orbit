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

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveAgentSignalRequest();
    if (!context) return agentSignalUnauthorizedResponse();
    const url = new URL(request.url);
    return NextResponse.json({
      data: {
        signals: await context.service.list({
          includeResolved: url.searchParams.get("includeResolved") === "true",
          limit: Number(url.searchParams.get("limit") ?? 30),
        }),
      },
    });
  } catch (error) {
    return agentSignalErrorResponse(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const context = await resolveAgentSignalRequest();
    if (!context) return agentSignalUnauthorizedResponse();
    const result = await context.service.refresh();
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
        ...result,
        automationRuns: automationRuns.map((automation) => ({
          automationId: automation.automationId,
          status: automation.lastRun?.status ?? automation.status,
        })),
      },
    });
  } catch (error) {
    return agentSignalErrorResponse(error);
  }
}
