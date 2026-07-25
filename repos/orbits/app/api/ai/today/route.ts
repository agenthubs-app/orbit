import { NextResponse } from "next/server";
import { createAgentLedgerService } from "../../../../features/agent/service-factory";
import { projectLedgerEntriesToTodayWorkItems } from "../../../../features/agent/runtime/today-projection";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  const result = await createAgentLedgerService().listEntries({
    status: search.get("status"),
    workflowKey: search.get("workflow"),
    createdAfter: search.get("createdAfter"),
    createdBefore: search.get("createdBefore"),
  });
  if (result.success === false) {
    return NextResponse.json(
      {
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      },
      { status: 503 },
    );
  }
  const items = projectLedgerEntriesToTodayWorkItems(result.data.entries);
  return NextResponse.json(
    {
      data: {
        state: items.length ? "success" : "empty",
        sections: {
          decide: items.filter((item) => item.section === "decide"),
          prepared: items.filter((item) => item.section === "prepared"),
          recent: items.filter((item) => item.section === "recent"),
        },
        actionIds: items.flatMap((item) =>
          item.actionId ? [item.actionId] : [],
        ),
        evidenceIds: result.data.provenance.evidenceIds,
      },
    },
    { status: 200 },
  );
}
