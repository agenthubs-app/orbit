import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalAccountExportStore } from "./local-zip";
import { createPrivateAccountExportStore } from "./private-zip";

export function createConfiguredAccountExportFileStore(workspaceId: string, env: Record<string, string | undefined> = process.env) {
  if (env.ORBIT_DATABASE_TARGET === "local" && !(env.NODE_ENV === "production" && env.VERCEL_ENV === "production")) {
    return createLocalAccountExportStore({ workspaceId, root: env.ORBIT_LOCAL_EXPORT_STORAGE_DIR ?? join(tmpdir(), "orbit-account-exports") });
  }
  return createPrivateAccountExportStore({ workspaceId });
}
