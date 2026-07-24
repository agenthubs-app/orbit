/**
 * Agent ledger API route 测试：直接调用 route handler，校验 envelope 与状态码。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GET as listLedger } from "../../app/api/agent/ledger/route";
import { POST as applyTransition } from "../../app/api/agent/ledger/[id]/transition/route";
import { PATCH as updateDraft } from "../../app/api/agent/ledger/[id]/draft/route";

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("GET /api/agent/ledger returns the ledger envelope", async () => {
  const response = await listLedger(
    new Request("http://localhost/api/agent/ledger"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entries.length, 6);
});

test("POST transition confirm executes selected operations", async () => {
  const response = await applyTransition(
    new Request("http://localhost/api/agent/ledger/ledger-followup-alex-chen/transition", {
      body: JSON.stringify({
        transition: "confirm",
        selectedOperationIds: ["op-alex-save-note", "op-alex-reminder", "op-alex-draft"],
        actorLabel: "航太郎",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    routeContext("ledger-followup-alex-chen"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.entry.status, "completed");
});

test("POST transition with unknown entry returns 404 envelope", async () => {
  const response = await applyTransition(
    new Request("http://localhost/api/agent/ledger/nope/transition", {
      body: JSON.stringify({ transition: "confirm", selectedOperationIds: ["x"] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    routeContext("nope"),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
});

test("PATCH draft updates the draft preview", async () => {
  const response = await updateDraft(
    new Request("http://localhost/api/agent/ledger/ledger-followup-alex-chen/draft", {
      body: JSON.stringify({
        operationId: "op-alex-draft",
        draftText: "Alex，周三下午方便吗？",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    routeContext("ledger-followup-alex-chen"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  const draft = body.data.entry.operations.find(
    (operation: { operationId: string }) => operation.operationId === "op-alex-draft",
  );
  assert.equal(draft.draftPreview, "Alex，周三下午方便吗？");
});
