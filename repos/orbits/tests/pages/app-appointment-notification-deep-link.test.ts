import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitAppointmentNegotiation } from "../../app/(app)/app/events/[id]/orbit-appointment-negotiation";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: { lang: "" } },
});

function renderNegotiation(props: { appointmentId: string; contactId: string; eventId: string }) {
  return create(createElement(OrbitLanguageProvider, {
    children: createElement(OrbitAppointmentNegotiation, props),
    initialLanguage: "zh",
  }));
}

function appointment(contactId = "contact:ren") {
  return {
    appointmentId: "appointment:aiko-ren",
    authorityRequestId: "request:aiko-ren",
    confirmed: null,
    contactId,
    eventId: "event:launch",
    pendingProposalRevision: 2,
    projection: { calendar: "not_synced", meeting: "not_synced", revision: null },
    proposals: [{
      candidateTimes: [
        { candidateId: "slot:1", startsAtUtc: "2026-09-01T01:00:00.000Z" },
        { candidateId: "slot:2", startsAtUtc: "2026-09-02T01:00:00.000Z" },
        { candidateId: "slot:3", startsAtUtc: "2026-09-03T01:00:00.000Z" },
      ],
      durationMinutes: 30,
      medium: { kind: "video" },
      note: "Counter proposal",
      proposedBy: "other",
      revision: 2,
      timezone: "Asia/Tokyo",
    }],
    status: "negotiating",
    version: 3,
  };
}

test("appointment notification deep link loads the exact actor-scoped appointment and exposes response controls", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return Response.json({ data: appointment(), success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = renderNegotiation({
        appointmentId: "appointment:aiko-ren",
        contactId: "contact:ren",
        eventId: "event:launch",
      });
    });
    assert.deepEqual(urls, ["/api/appointments/appointment%3Aaiko-ren"]);
    const output = JSON.stringify(renderer.toJSON());
    assert.match(output, /Counter proposal/);
    assert.match(output, /接受|反提时间|拒绝/u);
    assert.match(output, /data-appointment-deep-link/);
    assert.doesNotMatch(output, /开始约时间/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => renderer.unmount());
  }
});

test("appointment deep link fails closed when the actor-scoped contact does not match", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ data: appointment("contact:someone-else"), success: true })) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = renderNegotiation({
        appointmentId: "appointment:aiko-ren",
        contactId: "contact:ren",
        eventId: "event:launch",
      });
    });
    const output = JSON.stringify(renderer.toJSON());
    assert.match(output, /该约谈不属于当前联系人和活动/u);
    assert.doesNotMatch(output, /Counter proposal/);
    assert.doesNotMatch(output, /开始约时间/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => renderer.unmount());
  }
});
