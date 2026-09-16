import assert from "node:assert/strict";
import test from "node:test";
import { resolveReadSurface, surfaces } from "../src/data/offline-read/route-domain-inventory";

const consumerFile = "src/screens/schedule/PersonalScheduleAssociations.tsx";
test("association summary reads use exact notes/contact domains, not the personal schedule domain", () => {
  for (const [suffix, domainId] of [["notes", "notes"], ["contacts", "contacts"]]) {
    const path = `/api/schedule-items/association-options/${suffix}`;
    const policy = resolveReadSurface("GET", `${path}?q=LY&cursor=page-2&limit=20`);
    assert.equal(policy.domainId, domainId);
    assert.equal(policy.readPersistence, "durable_normalized");
    assert.equal(policy.mutationPolicy, "online_only");
    assert.equal(policy.binaryPolicy, "metadata_only");
    assert.ok(surfaces.some(row => row.consumerFile === consumerFile && row.method === "GET" && row.endpointTemplate === path));
  }
});

test("association summary policy rejects unknown kinds, nested paths and non-read methods", () => {
  for (const path of ["/api/schedule-items/association-options/unknown", "/api/schedule-items/association-options/notes/private", "/api/schedule-items/association-options/%2Fnotes", "/api/schedule-items/association-options/notes#private"]) {
    assert.throws(() => resolveReadSurface("GET", path), /UNREGISTERED_READ/);
  }
  for (const method of ["POST", "PATCH", "DELETE"]) assert.throws(() => resolveReadSurface(method, "/api/schedule-items/association-options/notes"), /UNREGISTERED_READ/);
});

test("selected identity reads remain registered while obsolete association search consumers are absent", () => {
  const rows = surfaces.filter(row => row.consumerFile === consumerFile);
  assert.deepEqual(rows.map(row => [row.method, row.endpointTemplate]).sort(), [
    ["GET", "/api/contacts/:id"], ["GET", "/api/notes/:id"],
    ["GET", "/api/schedule-items/association-options/contacts"], ["GET", "/api/schedule-items/association-options/notes"],
  ].sort());
});
