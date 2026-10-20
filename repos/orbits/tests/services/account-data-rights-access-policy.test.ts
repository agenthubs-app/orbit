import assert from "node:assert/strict";
import test from "node:test";

test("pending and purging accounts have narrow API and page access", async () => {
  const { accountRightsAccessDecision } = await import("../../features/account/data-rights/access-policy");
  const allowed = [
    ["GET", "/api/account/deletion-request"], ["DELETE", "/api/account/deletion-request"],
    ["GET", "/api/account/status"], ["GET", "/api/app/version"],
    ["GET", "/api/account/exports/export%3A1"], ["GET", "/api/account/exports/export%3A1/download"],
    ["POST", "/api/auth/signout"], ["POST", "/api/account/session/sign-out"],
  ];
  for (const [method, path] of allowed) assert.equal(accountRightsAccessDecision("pending", method, path), "allow", `${method} ${path}`);
  for (const [method, path] of [["GET", "/api/contacts"], ["POST", "/api/sync/push"], ["GET", "/api/sync/pull"], ["POST", "/api/account/exports"], ["GET", "/api/account/exports"]]) {
    assert.equal(accountRightsAccessDecision("pending", method, path), "reject-api", `${method} ${path}`);
  }
  assert.equal(accountRightsAccessDecision("pending", "GET", "/app/settings/account"), "redirect-pending");
  assert.equal(accountRightsAccessDecision("pending", "GET", "/app/account/pending"), "allow");
  assert.equal(accountRightsAccessDecision("purging", "DELETE", "/api/account/deletion-request"), "reject-api");
  assert.equal(accountRightsAccessDecision("active", "POST", "/api/sync/push"), "allow");
});
