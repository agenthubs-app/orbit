import { NextResponse } from "next/server";
import { createAgentPlaybookCompiler } from "../../../../../features/agent/playbooks/compiler";
import {
  agentAutomationErrorResponse,
  agentAutomationUnauthorizedResponse,
  resolveAgentAutomationRequest,
} from "../request";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await resolveAgentAutomationRequest();
  if (!context) return agentAutomationUnauthorizedResponse();
  const body = (await request.json().catch(() => null)) as {
    request?: unknown;
    locale?: unknown;
    timeZone?: unknown;
  } | null;
  if (
    !body ||
    typeof body.request !== "string" ||
    typeof body.timeZone !== "string"
  ) {
    return agentAutomationErrorResponse(
      new Error("A Playbook request and IANA time zone are required."),
    );
  }
  const result = await createAgentPlaybookCompiler().compile({
    locale: body.locale === "en" ? "en" : "zh",
    request: body.request,
    timeZone: body.timeZone,
  });
  if (result.success === false) {
    return agentAutomationErrorResponse(
      new Error(result.error.message),
      {
        code: result.error.code,
        status:
          result.error.code === "PLAYBOOK_PROVIDER_FAILED"
            ? 503
            : 422,
      },
    );
  }
  return NextResponse.json({ data: { draft: result.draft } });
}
