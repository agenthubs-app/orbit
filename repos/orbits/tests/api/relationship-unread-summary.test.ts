import assert from "node:assert/strict";
import test from "node:test";
import type { z } from "zod";
import type { ContractMatches } from "../../shared/contract-check";
import type { RelationshipUnreadSummaryDTO } from "../../shared/contract/relationship-communication";
import { relationshipUnreadSummarySchema } from "../../shared/api-schema/relationship-unread-summary";
import { createRelationshipUnreadSummaryGetHandler } from "../../app/api/relationship-communication/unread-summary/handler";

const matches: ContractMatches<z.infer<typeof relationshipUnreadSummarySchema>, RelationshipUnreadSummaryDTO> = true;
test("badge schema and shared response contract match", () => assert.equal(matches, true));

test("badge is authenticated before database access and never echoes database errors", async () => {
  const response = await createRelationshipUnreadSummaryGetHandler({ resolveActor: async () => null,
    read: async () => { throw new Error("must not read"); } })();
  assert.equal(response.status, 401);
  const failed = await createRelationshipUnreadSummaryGetHandler({
    resolveActor: async () => ({ id: "account:one", accountId: "account:one", userId: "raw:one", name: "Test", email: "one@example.test" }),
    read: async actorId => { assert.equal(actorId, "account:one"); throw new Error("private database error"); },
  })();
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("private database error"));
});
