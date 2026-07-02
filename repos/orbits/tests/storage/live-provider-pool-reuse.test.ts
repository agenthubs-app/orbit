import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

const liveStorageProviders = [
  "features/connections/storage/connection-live-record-provider.ts",
  "features/acquisition/storage/event-attendee-live-record-provider.ts",
  "features/chat/storage/chat-conversation-live-record-provider.ts",
  "features/agent/storage/agent-action-live-record-provider.ts",
] as const;

test("configured feature live providers reuse the shared Postgres record store", () => {
  for (const path of liveStorageProviders) {
    const contents = source(path);

    assert.match(
      contents,
      /createConfiguredPostgresLiveRecordStore/,
      `${path} should reuse the configured shared live record store`,
    );
    assert.doesNotMatch(
      contents,
      /createPgLiveRecordSqlClient/,
      `${path} must not create its own Postgres client`,
    );
    assert.doesNotMatch(
      contents,
      /createPostgresLiveRecordStore/,
      `${path} must not create its own Postgres record store`,
    );
  }
});
