import { pathToFileURL } from "node:url";

import { runProfileContractRepairOperator } from "../features/events/registration/profile-contract-repair/operator-runner";
import { loadLocalEnv } from "./load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";

export async function main(argv: unknown = process.argv.slice(2)): Promise<void> {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  const explicitWorkspaceId = process.env.ORBIT_WORKSPACE_ID?.trim();
  if (!config || !explicitWorkspaceId || config.workspaceId !== explicitWorkspaceId) {
    throw new Error("Profile contract repair operator configuration is unavailable.");
  }
  console.log(JSON.stringify(await runProfileContractRepairOperator(argv, config)));
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch(() => {
    console.error("Profile contract repair operator failed.");
    process.exitCode = 1;
  });
}
