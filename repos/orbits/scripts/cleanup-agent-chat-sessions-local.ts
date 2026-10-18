/** R21 local-only retention task. Production scheduling requires a separate authorization. */
import { createStorageOrbitAgentChatSessionProvider } from "../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { expireOrbitAgentChatSessions } from "../features/orbit-ai/storage/orbit-agent-chat-session-retention";
import { createTransactionalOrbitAgentChatOrganizationStore } from "../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";

function requiredFlag(name: string): string {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = flag?.slice(name.length + 3).trim();
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function localTestDatabase(value: string): boolean {
  const url = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    && decodeURIComponent(url.pathname.slice(1)).toLowerCase().includes("test")
    && !url.search && !url.username && !url.password;
}

async function main() {
  const connectionString = process.env.ORBIT_AGENT_SESSION_TEST_DATABASE_URL ?? "";
  if (!connectionString || !localTestDatabase(connectionString)) throw new Error("A credential-free localhost test database URL is required");
  const actorId = requiredFlag("actor");
  const workspaceId = requiredFlag("workspace");
  const now = new Date(requiredFlag("now"));
  if (!Number.isFinite(now.getTime())) throw new Error("--now must be an ISO timestamp");

  const client = createTransactionalPostgresClient({ connectionString, max: 3 });
  try {
    const provider = createStorageOrbitAgentChatSessionProvider({
      actorId, workspaceId, store: createPostgresLiveRecordStore({ client }),
      summaryPageClient: client, transactionClient: client,
      summaryPageSecret: "R21-local-session-retention-cursor-secret",
    });
    const organization = createTransactionalOrbitAgentChatOrganizationStore({ actorId, client, workspaceId });
    const result = await expireOrbitAgentChatSessions({ provider, organization, now });
    console.log(JSON.stringify({ actorId, workspaceId, ...result, at: now.toISOString() }));
    if (result.truncated) throw new Error("Retention scan cap reached; work remains");
  } finally {
    await client.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
