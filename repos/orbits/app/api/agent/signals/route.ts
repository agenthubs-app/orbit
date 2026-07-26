import { NextResponse } from "next/server";
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
    return NextResponse.json({
      data: await context.service.refresh(),
    });
  } catch (error) {
    return agentSignalErrorResponse(error);
  }
}
