import assert from "node:assert/strict";
import test from "node:test";

test("download grant lasts five minutes and binds actor, export, and site origin", async () => {
  const { createAccountExportDownloadGrant, verifyAccountExportDownloadGrant } = await import("../../features/account/data-rights/download-grant");
  const secret = "test-secret-value-1234567890";
  const now = new Date("2026-10-20T00:00:00.000Z");
  const url = createAccountExportDownloadGrant({ actorId: "alice", exportId: "export:one", secret, now,
    requestUrl: "http://localhost:3400/api/account/exports", publicBaseUrl: "https://orbit.example.com" });
  assert.equal(url.origin, "https://orbit.example.com");
  assert.equal(url.pathname, "/api/account/exports/export%3Aone/download");
  assert.equal(verifyAccountExportDownloadGrant({ actorId: "alice", exportId: "export:one", secret, url, now: new Date(now.getTime() + 299_999) }), true);
  assert.equal(verifyAccountExportDownloadGrant({ actorId: "alice", exportId: "export:one", secret, url, now: new Date(now.getTime() + 300_000) }), false);
  assert.equal(verifyAccountExportDownloadGrant({ actorId: "bob", exportId: "export:one", secret, url, now }), false);
  assert.equal(verifyAccountExportDownloadGrant({ actorId: "alice", exportId: "export:two", secret, url, now }), false);
  url.searchParams.set("sig", "tampered");
  assert.equal(verifyAccountExportDownloadGrant({ actorId: "alice", exportId: "export:one", secret, url, now }), false);
});
