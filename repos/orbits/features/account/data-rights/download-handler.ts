import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { createConfiguredAccountExportService } from "./handlers";
import type { createAccountExportService } from "./service";

type DownloadService = Pick<ReturnType<typeof createAccountExportService>, "download">;

function denied(status: number, reason: string): Response {
  return Response.json({ error: reason }, { status, headers: { "cache-control": "private, no-store" } });
}

export function createAccountExportDownloadHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: DownloadService | null;
} = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const service = () => deps.service !== undefined ? deps.service : createConfiguredAccountExportService();
  return async (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    let actor;
    try { actor = await resolveActor(); }
    catch { return denied(503, "unavailable"); }
    if (!actor) return denied(401, "unauthorized");
    const resolved = service();
    if (!resolved) return denied(503, "unavailable");
    try {
      const { id } = await context.params;
      const outcome = await resolved.download(actor.id, id, new URL(request.url));
      switch (outcome.kind) {
        case "not-found": return denied(404, "not_found");
        case "invalid-grant": return denied(403, "invalid_grant");
        case "expired": return denied(410, "expired");
        case "unavailable": return denied(503, "unavailable");
        case "ok": {
          const fileName = outcome.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
          return new Response(new Uint8Array(outcome.bytes), { status: 200, headers: {
            "content-type": "application/zip", "content-length": String(outcome.bytes.byteLength),
            "content-disposition": `attachment; filename="${fileName}"`,
            "cache-control": "private, no-store", "x-content-type-options": "nosniff",
          } });
        }
      }
    } catch {
      return denied(503, "unavailable");
    }
  };
}
