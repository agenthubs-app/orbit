/** R21 local-only retention task. Production scheduling requires a separate authorization. */
import { createStorageOrbitAgentChatSessionProvider } from "../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
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
  let cursor: string | null = null;
  let scanned = 0;
  let deleted = 0;
  let pages = 0;
  do {
    if (++pages > 1000) throw new Error("Retention page cap reached; work remains");
    const page = await provider.listSessionSummariesPage({ cursor, limit: 50 });
    for (const session of page.items) {
      scanned += 1;
      if (session.organization.pinned) continue;
      if (await provider.deleteExpiredSession(session.id, now, async () => false)) deleted += 1;
    }
    cursor = page.hasMore ? page.nextCursor : null;
    if (page.hasMore && !cursor) throw new Error("Retention cursor missing; work remains");
  } while (cursor);
  console.log(JSON.stringify({ actorId, workspaceId, scanned, deleted, pages, at: now.toISOString() }));
  } finally {
    await client.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
