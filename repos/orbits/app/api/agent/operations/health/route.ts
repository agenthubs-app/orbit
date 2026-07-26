import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { createAgentOperationsService } from "../../../../../features/agent/operations/service-factory";
import { createAgentPreferencesService } from "../../../../../features/agent/preferences";
import { resolveLiveDatabaseConnectionConfig } from "../../../../../shared/storage/live-database-config";

export const dynamic = "force-dynamic";

function providerStatus() {
  const configuredProvider =
    process.env.ORBIT_AGENT_PROVIDER?.trim().toLowerCase();
  const provider =
    configuredProvider === "deepseek" ||
    configuredProvider === "openai" ||
    configuredProvider === "gpt"
      ? configuredProvider === "gpt"
        ? "openai"
        : configuredProvider
      : "gemini";
  const configured = Boolean(
    provider === "deepseek"
      ? process.env.DEEPSEEK_API_KEY?.trim()
      : provider === "openai"
        ? process.env.OPENAI_API_KEY?.trim()
        : process.env.GEMINI_API_KEY?.trim(),
  );
  return {
    configured,
    provider,
  };
}

export async function GET(): Promise<Response> {
  const session = await auth();
  const actorId = session?.user?.id?.trim();
  if (!actorId) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in is required for Agent operations health.",
        },
      },
      { status: 401 },
    );
  }
  const [worker, preferences] = await Promise.all([
    createAgentOperationsService({ actorId }).workerHealth(),
    createAgentPreferencesService({ actorId }).get(),
  ]);
  return NextResponse.json({
    data: {
      ai: providerStatus(),
      database: {
        durable: Boolean(resolveLiveDatabaseConnectionConfig()),
      },
      policy: {
        externalCalendarWritesEnabled:
          preferences.externalCalendarWritesEnabled,
        externalMessages: "never",
        writesRequireConfirmation: true,
      },
      worker,
    },
  });
}
