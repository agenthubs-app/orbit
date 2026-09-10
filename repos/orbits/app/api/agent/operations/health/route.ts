import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { createAgentOperationsService } from "../../../../../features/agent/operations/service-factory";
import { createAgentPreferencesService } from "../../../../../features/agent/preferences";
import { resolveOrbitAgentModelProviderSelection } from "../../../../../features/orbit-ai/gemini-provider";
import { resolveLiveDatabaseConnectionConfig } from "../../../../../shared/storage/live-database-config";

export const dynamic = "force-dynamic";

// provider 名与 gemini-provider 的 resolveProvider 共用同一选择逻辑，
// 这样未设置 ORBIT_AGENT_PROVIDER 时自动选中的 provider 也会被如实报告。
function providerStatus() {
  const { provider, selection } = resolveOrbitAgentModelProviderSelection();
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
    selection,
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
