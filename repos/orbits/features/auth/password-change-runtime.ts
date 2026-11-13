import { auth } from "../../auth";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createPasswordChangeService, createPasswordChangeStore, type PasswordChangeAccount } from "./password-change";
import type { PasswordChangeHttpDeps } from "./password-change-http";

async function sessionAccount(): Promise<PasswordChangeAccount | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  return userId && email ? { userId, email } : null;
}

function configuredService() {
  const database = createConfiguredPostgresLiveRecordStore();
  return database ? createPasswordChangeService(createPasswordChangeStore(database.client, database.workspaceId)) : null;
}

export const configuredPasswordChangeDeps: PasswordChangeHttpDeps = {
  resolveAccount: sessionAccount,
  resolveService: configuredService,
};
