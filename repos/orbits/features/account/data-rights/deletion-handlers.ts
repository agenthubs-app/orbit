import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { accountDeletionCreateInputSchema } from "../../../shared/api-schema/account";
import type { AccountDeletionRequestContract } from "../../../shared/contract/account";
import { AppError, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { readBody, type ContractReply } from "../../redesign-contracts/route";
import { createAccountDeletionRecordStore, type AccountDeletionRecord } from "./deletion-records";

type Store = Pick<ReturnType<typeof createAccountDeletionRecordStore>, "get" | "request" | "cancel">;

export function createConfiguredAccountDeletionStore(): ReturnType<typeof createAccountDeletionRecordStore> | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? createAccountDeletionRecordStore({ db: runtime.client, workspaceId: runtime.workspaceId }) : null;
}

function project(record: AccountDeletionRecord): AccountDeletionRequestContract {
  return { requestedAt: record.requestedAt, purgeAfter: record.purgeAfter, cancelledAt: record.cancelledAt, status: record.status };
}

export function createAccountDeletionLiveHandlers(deps: { resolveActor?: ResolveAuthenticatedApiActor; store?: Store | null } = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const store = () => deps.store !== undefined ? deps.store : createConfiguredAccountDeletionStore();
  const unavailable = (): ContractReply => ({ error: new AppError("SERVICE_UNAVAILABLE", "Account deletion is unavailable.") });
  const internal = (): ContractReply => ({ error: new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE) });
  async function actor() {
    try { return await resolveActor(); }
    catch { return "unavailable" as const; }
  }
  return {
    async get(_request: Request): Promise<ContractReply> {
      const principal = await actor();
      if (principal === "unavailable") return unavailable();
      if (!principal) return { error: new AppError("UNAUTHORIZED", "Sign in to view account status.") };
      const resolved = store();
      if (!resolved) return unavailable();
      try {
        const found = await resolved.get(principal.id);
        return { data: found && found.status !== "cancelled" ? project(found) : null };
      } catch { return internal(); }
    },
    async request(request: Request): Promise<ContractReply> {
      const principal = await actor();
      if (principal === "unavailable") return unavailable();
      if (!principal || !principal.userId) return { error: new AppError("UNAUTHORIZED", "Sign in to request account deletion.") };
      const body = await readBody(request, accountDeletionCreateInputSchema);
      if (body.ok === false) return body.reply;
      const resolved = store();
      if (!resolved) return unavailable();
      try {
        const result = await resolved.request(principal.id, principal.userId, body.value.reauthReceipt);
        if (result.kind === "bad-receipt") return { error: new AppError("FORBIDDEN", "Reauthenticate to request deletion."), context: { reason: "REAUTH_REQUIRED" } };
        if (result.kind === "host-blocked") return { error: new AppError("CONFLICT", "Cancel or transfer events with registered participants first."), context: { reason: "HOST_EVENT_HAS_REGISTRATIONS" } };
        return result.request ? { data: project(result.request), status: result.kind === "accepted" ? 202 : 200 } : internal();
      } catch { return internal(); }
    },
    async cancel(_request: Request): Promise<ContractReply> {
      const principal = await actor();
      if (principal === "unavailable") return unavailable();
      if (!principal) return { error: new AppError("UNAUTHORIZED", "Sign in to cancel account deletion.") };
      const resolved = store();
      if (!resolved) return unavailable();
      try {
        const result = await resolved.cancel(principal.id);
        if (result.kind === "too-late") return { error: new AppError("CONFLICT", "The cancellation period has ended."), context: { reason: "DELETION_TOO_LATE" } };
        return { data: result.request ? project(result.request) : null };
      } catch { return internal(); }
    },
  };
}

let live: ReturnType<typeof createAccountDeletionLiveHandlers> | null = null;
export function accountDeletionLiveHandlers() {
  live ??= createAccountDeletionLiveHandlers();
  return live;
}
