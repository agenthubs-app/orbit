import assert from "node:assert/strict";
import test from "node:test";

import { buildApiProbeRequest } from "../../shared/ui/api-probe-form";

test("API probe GET requests preserve action query and submitted scenarios", () => {
  const request = buildApiProbeRequest({
    action: "/api/contacts/demo-contact-1?fixture=stable",
    entries: [["scenario", "failure"]],
    method: "GET",
    origin: "https://orbit.local",
  });

  assert.deepEqual(request, {
    method: "GET",
    url: "/api/contacts/demo-contact-1?fixture=stable&scenario=failure",
  });
});

test("API probe PATCH requests serialize exact JSON fields and arrays", () => {
  const request = buildApiProbeRequest({
    action: "/api/contacts/demo-contact-1",
    arrayFields: ["addTags"],
    entries: [
      ["status", "active"],
      ["addTags", "topic:venture-ecosystem"],
      ["note", "Keep the preview deterministic."],
    ],
    method: "PATCH",
    origin: "https://orbit.local",
  });

  assert.deepEqual(request, {
    body: JSON.stringify({
      status: "active",
      addTags: ["topic:venture-ecosystem"],
      note: "Keep the preview deterministic.",
    }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
    url: "/api/contacts/demo-contact-1",
  });
});

test("body-less PATCH probes keep the route method without inventing data", () => {
  const request = buildApiProbeRequest({
    action: "/api/connections/demo-connection-1/stage?scenario=failure",
    entries: [],
    method: "PATCH",
    origin: "https://orbit.local",
  });

  assert.deepEqual(request, {
    method: "PATCH",
    url: "/api/connections/demo-connection-1/stage?scenario=failure",
  });
});
