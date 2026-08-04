import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresEventProfileResponseReader } from "../../features/events/event-operations/profile-response-reader";
import type { EventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

function clientRecording(valuesSeen: unknown[][]): EventOperationsPostgresClient {
  return {
    async close() {},
    async query<TRow>(_text: string, values?: readonly unknown[]) {
      valuesSeen.push([...(values ?? [])]);
      return {
        rowCount: 1,
        rows: [
          {
            profile_payload: {
              registrationProfile: {
                answers: { industry: "Food logistics" },
              },
            },
            profile_version: "1",
            response_payload: null,
          } as TRow,
        ],
      };
    },
    async transaction<TValue>(operation: (client: EventOperationsPostgresClient) => Promise<TValue>) {
      return operation(this);
    },
  };
}

test("profile response reader binds only the placeholders selected by its query", async () => {
  const valuesSeen: unknown[][] = [];
  const reader = createPostgresEventProfileResponseReader({
    client: clientRecording(valuesSeen),
    workspaceId: "workspace:test",
  });

  await reader.read({
    eventId: "event:test",
    participantId: "participant:test",
  });
  await reader.read({
    eventId: "event:test",
    generationId: "generation:test",
    participantId: "participant:test",
  });

  assert.deepEqual(valuesSeen, [
    ["workspace:test", "event:test", "participant:test"],
    [
      "workspace:test",
      "event:test",
      "participant:test",
      "generation:test",
    ],
  ]);
});
