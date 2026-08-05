import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { OrbitPartyPersonView } from "../../app/(app)/app/orbit-party-route-view-model";
import { EventContactRequestControl } from "../../app/(app)/app/party/event-operations-controls";

const EVENT_ID = "event:e2e:orbit-connection-night";
const REQUEST_ID = "event-contact-request:4a99-test";

function person(
  overrides: Partial<OrbitPartyPersonView> = {},
): OrbitPartyPersonView {
  return {
    company: "LoopMatter",
    contactId: null,
    contactRequestDirection: "incoming",
    contactRequestId: REQUEST_ID,
    contactRequestRevision: 1,
    contactRequestStatus: "incoming",
    g: "g-indigo",
    groupNumber: null,
    icebreakers: [],
    id: "participant:aiko",
    industry: "Circular economy",
    initial: "A",
    isRecommended: false,
    memberHint: null,
    name: "Aiko Mori",
    noMatchReason: null,
    offering: "Packaging reuse pilot data",
    reason: "Registered participant directory profile.",
    score: 0,
    seat: null,
    seeking: "Manufacturing buyers",
    summary: "Climate founder",
    title: "Climate founder",
    topics: ["Circular economy"],
    ...overrides,
  };
}

test("incoming contact accept immediately enters busy state and posts the exact persisted request", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  globalThis.fetch = (async (url, init) => {
    if (String(url) === "/api/appointments") {
      return Response.json({ data: [], success: true });
    }
    observedUrl = String(url);
    observedInit = init;
    return response;
  }) as typeof fetch;

  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventContactRequestControl
          eventId={EVENT_ID}
          person={person()}
          showAcceptedWorkflow
          t={(copy) => copy.en}
        />,
      );
    });
    const acceptButtons = renderer.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["data-event-contact-action"] === "accept",
    );
    assert.equal(acceptButtons.length, 1);

    let action!: Promise<void>;
    act(() => {
      action = acceptButtons[0].props.onClick() as Promise<void>;
    });

    const busyAcceptButtons = renderer.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["data-event-contact-action"] === "accept",
    );
    assert.equal(busyAcceptButtons.length, 1);
    assert.equal(busyAcceptButtons[0].props.disabled, true);
    assert.equal(busyAcceptButtons[0].props["aria-busy"], true);
    assert.match(JSON.stringify(renderer.toJSON()), /Saving/u);
    assert.equal(
      observedUrl,
      `/api/events/${encodeURIComponent(EVENT_ID)}/operations/contact-requests/${encodeURIComponent(REQUEST_ID)}/respond`,
    );
    assert.equal(observedInit?.method, "POST");
    assert.equal(
      observedInit?.body,
      JSON.stringify({ accept: true, expectedRevision: 1 }),
    );

    await act(async () => {
      resolveResponse(
        Response.json({
          data: { contactId: "contact:owner:aiko", revision: 2, status: "accepted" },
          success: true,
        }),
      );
      await action;
    });
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-event-contact-action"] === "accept",
      ).length,
      0,
    );
    assert.match(JSON.stringify(renderer.toJSON()), /Contact exchange accepted/u);
    const contactLinks = renderer.root.findAll(
      (node) =>
        node.type === "a" &&
        node.props.href ===
          `/app/contacts/${encodeURIComponent("contact:owner:aiko")}`,
    );
    assert.equal(contactLinks.length, 1);
    const rendered = JSON.stringify(renderer.toJSON());
    const encounterIndex = rendered.indexOf("data-human-encounter-capture");
    const appointmentActionIndex = rendered.indexOf("data-party-appointment-action");
    const appointmentIndex = rendered.indexOf("data-appointment-negotiation");
    const contactIndex = rendered.indexOf(`/app/contacts/${encodeURIComponent("contact:owner:aiko")}`);
    assert.ok(encounterIndex >= 0, "accepted exchange exposes encounter capture");
    assert.ok(appointmentActionIndex > encounterIndex, "appointment action follows encounter capture");
    assert.ok(appointmentIndex > appointmentActionIndex, "appointment negotiation is mounted");
    assert.ok(contactIndex > appointmentIndex, "contact link remains the final workflow action");
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("a reused control reads a newly arrived request id from props instead of stale local state", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  globalThis.fetch = (async (url) => {
    observedUrl = String(url);
    return Response.json({
      data: { contactId: null, revision: 2, status: "declined" },
      success: true,
    });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventContactRequestControl
          eventId={EVENT_ID}
          person={person({
            contactRequestDirection: null,
            contactRequestId: null,
            contactRequestStatus: "none",
          })}
          t={(copy) => copy.en}
        />,
      );
    });
    await act(async () => {
      renderer.update(
        <EventContactRequestControl
          eventId={EVENT_ID}
          person={person()}
          t={(copy) => copy.en}
        />,
      );
    });
    const declineButtons = renderer.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["data-event-contact-action"] === "decline",
    );
    assert.equal(declineButtons.length, 1);

    await act(async () => {
      await (declineButtons[0].props.onClick() as Promise<void>);
    });
    assert.equal(
      observedUrl,
      `/api/events/${encodeURIComponent(EVENT_ID)}/operations/contact-requests/${encodeURIComponent(REQUEST_ID)}/respond`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("an outgoing pending request can be withdrawn, then requested again", async () => {
  const originalFetch = globalThis.fetch;
  const observedUrls: string[] = [];
  const observedBodies: unknown[] = [];
  let renderer!: ReactTestRenderer;
  globalThis.fetch = (async (url, init) => {
    observedUrls.push(String(url));
    observedBodies.push(init?.body);
    if (String(url).endsWith("/withdraw")) {
      return Response.json({
        data: { contactId: null, revision: 2, status: "withdrawn" },
        success: true,
      });
    }
    return Response.json({
      data: { requestId: REQUEST_ID, revision: 3, status: "awaiting_target_consent" },
      success: true,
    });
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(
        <EventContactRequestControl
          eventId={EVENT_ID}
          person={person({
            contactRequestDirection: "outgoing",
            contactRequestStatus: "awaiting_target_consent",
          })}
          t={(copy) => copy.en}
        />,
      );
    });
    const withdraw = renderer.root.find(
      (node) => node.props["data-event-contact-action"] === "withdraw",
    );
    await act(async () => {
      await (withdraw.props.onClick() as Promise<void>);
    });
    assert.equal(
      observedUrls[0],
      `/api/events/${encodeURIComponent(EVENT_ID)}/operations/contact-requests/${encodeURIComponent(REQUEST_ID)}/withdraw`,
    );
    assert.equal(observedBodies[0], JSON.stringify({ expectedRevision: 1 }));
    const requestAgain = renderer.root.find(
      (node) => node.props["data-event-contact-action"] === "request-again",
    );
    await act(async () => {
      await (requestAgain.props.onClick() as Promise<void>);
    });
    assert.equal(
      observedUrls[1],
      `/api/events/${encodeURIComponent(EVENT_ID)}/operations/contact-requests`,
    );
    assert.equal(observedBodies[1], JSON.stringify({ expectedRevision: 2, targetParticipantId: "participant:aiko" }));
    assert.match(JSON.stringify(renderer.toJSON()), /Waiting for their consent/u);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("a newly created request can be withdrawn immediately without refreshing", async () => {
  const originalFetch = globalThis.fetch;
  let renderer!: ReactTestRenderer;
  let laterSurface!: ReactTestRenderer;
  const sharedPerson = person({
    contactRequestDirection: null,
    contactRequestId: null,
    contactRequestRevision: null,
    contactRequestStatus: "none",
  });
  globalThis.fetch = (async (url) => {
    if (String(url).endsWith("/withdraw")) {
      return Response.json({
        data: { contactId: null, revision: 2, status: "withdrawn" },
        success: true,
      });
    }
    return Response.json({
      data: { requestId: REQUEST_ID, revision: 1 },
      success: true,
    });
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(
        <EventContactRequestControl
          eventId={EVENT_ID}
          person={sharedPerson}
          t={(copy) => copy.en}
        />,
      );
    });
    const request = renderer.root.find(
      (node) => node.props["data-event-contact-action"] === "request",
    );
    await act(async () => {
      await (request.props.onClick() as Promise<void>);
    });
    const withdraw = renderer.root.find(
      (node) => node.props["data-event-contact-action"] === "withdraw",
    );
    await act(async () => {
      await (withdraw.props.onClick() as Promise<void>);
    });
    assert.match(JSON.stringify(renderer.toJSON()), /Contact request withdrawn/u);
    await act(async () => {
      laterSurface = create(
        <EventContactRequestControl
          eventId={EVENT_ID}
          person={sharedPerson}
          t={(copy) => copy.en}
        />,
      );
    });
    assert.match(
      JSON.stringify(laterSurface.toJSON()),
      /Contact request withdrawn/u,
      "a newly mounted Party surface reads the latest lifecycle instead of stale route props",
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
    laterSurface?.unmount();
  }
});

test("an owner-scoped contact id wins over a stale request projection", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <EventContactRequestControl
        eventId={EVENT_ID}
        person={person({
          contactId: "contact:owner:participant:aiko/primary",
          contactRequestDirection: null,
          contactRequestId: null,
          contactRequestStatus: "none",
        })}
        showAcceptedWorkflow
        t={(copy) => copy.en}
      />,
    );
  });

  try {
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-event-contact-action"] === "request",
      ).length,
      0,
    );
    assert.match(JSON.stringify(renderer.toJSON()), /Contact exchange accepted/u);
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "a" &&
          node.props.href ===
            `/app/contacts/${encodeURIComponent("contact:owner:participant:aiko/primary")}`,
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll((node) => node.props["data-human-encounter-capture"] !== undefined).length,
      1,
    );
    assert.match(
      JSON.stringify(renderer.toJSON()),
      /accepted exchange is missing its request id/u,
    );
  } finally {
    renderer.unmount();
  }
});

test("an accepted contact stays compact outside the participant detail drawer", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <EventContactRequestControl
        eventId={EVENT_ID}
        person={person({
          contactId: "contact:owner:aiko",
          contactRequestDirection: "outgoing",
          contactRequestStatus: "accepted",
        })}
        t={(copy) => copy.en}
      />,
    );
  });

  try {
    const summaries = renderer.root.findAll(
      (node) => node.props["data-party-accepted-contact-summary"] !== undefined,
    );
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].props.style.display, "flex");
    assert.equal(
      renderer.root.findAll((node) => node.props["data-party-post-contact-workflow"] !== undefined).length,
      0,
    );
  } finally {
    renderer.unmount();
  }
});
