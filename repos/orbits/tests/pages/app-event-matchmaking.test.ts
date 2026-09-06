import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitEventMatchmaking } from "../../app/(app)/app/events/[id]/orbit-event-matchmaking";
import { OrbitRealEventDetail } from "../../app/(app)/app/events/[id]/orbit-real-event-detail";
import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { eventDetailRouteToOrbitLandingEventView } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";

test("the event journey passes the canonical registration window to matching recovery", async () => {
  const model = await loadAppEventDetailRoute({ eventId: "demo-event-1", mode: "mock" });
  assert.equal(model.routeState, "success");
  if (model.routeState !== "success") return;
  const base = eventDetailRouteToOrbitLandingEventView(model);
  const originalFetch = globalThis.fetch;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setInterval, clearInterval, location: { search: "", href: "https://orbit.example/app/events/demo-event-1" } },
  });
  globalThis.fetch = async () => new Response(null, { status: 403 });
  try {
    for (const status of ["upcoming", "active", "ended"] as const) {
      for (const availability of ["open", "profile_edit_closed", "registration_closed", "unavailable"] as const) {
        let renderer!: ReactTestRenderer;
        try {
          await act(async () => {
            renderer = create(createElement(OrbitRealEventDetail, {
              event: { ...base, status, stats: { ...base.stats, authed: true, youRsvped: true } },
              registrationAvailability: availability,
            }));
          });
          const matching = renderer.root.findByType(OrbitEventMatchmaking);
          assert.equal(matching.props.registrationOpen, status === "upcoming" && availability === "open");
          assert.equal(
            matching.findAllByType("a").some((node) => String(node.props.href).endsWith("/register")),
            status === "upcoming" && availability === "open",
          );
        } finally {
          if (renderer) await act(async () => renderer.unmount());
        }
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("matching recovery distinguishes an expired session from closed or unknown registration", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [401, 403]) {
      for (const registrationOpen of [true, false, undefined]) {
        globalThis.fetch = async () => new Response(null, { status });
        let renderer!: ReactTestRenderer;
        try {
          await act(async () => {
            renderer = create(createElement(OrbitEventMatchmaking, {
              eventId: "event:closed-test", authenticated: true, registrationOpen,
            }));
          });
          const hrefs = renderer.root.findAllByType("a").map((node) => node.props.href as string);
          assert.equal(hrefs.some((href) => href.endsWith("/register")), status === 403 && registrationOpen === true);
          assert.equal(hrefs.some((href) => href.startsWith("/app/account/login?next=")), status === 401);
          if (status === 401) {
            const login = new URL(hrefs[0], "https://orbit.example");
            assert.equal(login.searchParams.get("next"), "/app/events/event:closed-test");
          }
        } finally {
          if (renderer) await act(async () => renderer.unmount());
        }
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("event matching reads only published operations and uses canonical consent", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/events/[id]/orbit-event-matchmaking.tsx",
    ),
    "utf8",
  );

  assert.match(source, /\/operations`/);
  assert.match(source, /\/operations\/participants\//);
  assert.match(source, /\/operations\/contact-requests/);
  assert.match(source, /\/withdraw/);
  assert.match(source, /根据双方报名画像匹配，每条推荐都能查看依据/);
  assert.match(source, /等待对方同意，联系方式仍保持隐藏/);
  assert.match(source, /data-operations-state="locked"/);
  assert.match(source, /data-operations-state="processing"/);
  assert.match(source, /data-operations-state="failed"/);
  assert.match(source, /data-event-participant-directory/);
  // The detail dialog must be re-parented to the page root. Left inside the
  // matchmaking section it inherits the journey nite panel's --ink/--surface
  // overrides and renders as a transparent panel behind a white scrim; moved
  // all the way to document.body it loses the Orbit .card/.btn override layer,
  // which is scoped under [data-orbit-real-page].
  assert.match(source, /createPortal\(/);
  assert.match(source, /closest<HTMLElement>\("\[data-orbit-real-page\]"\)/);
  assert.doesNotMatch(source, /\/api\/events\/.*\/matchmaking/);
  assert.doesNotMatch(source, /\/api\/agent\/matchmaking/);
  assert.doesNotMatch(source, /type="datetime-local"/);
  assert.doesNotMatch(source, /candidate\.evidenceIds/);
  assert.doesNotMatch(source, /otherParticipant\.(email|phone)/);
});

test("the post-event center exposes the attendee report through the normal event journey", () => {
  const source = readFileSync(
    join(
      projectRoot,
      "app/(app)/app/events/[id]/orbit-post-event-center.tsx",
    ),
    "utf8",
  );

  assert.match(source, /data-post-event-report-link/);
  assert.match(source, /查看完整活动报告/);
  assert.match(source, /\/app\/events\/\$\{encodeURIComponent\(eventId\)\}\/analytics/);
});

test("a withdrawn outgoing request stays visible and can be requested again", async () => {
  const originalFetch = globalThis.fetch;
  const withdrawnRequest = {
    contactId: null,
    requestId: "request:maya-julia",
    revision: 2,
    requesterParticipantId: "participant:maya",
    status: "withdrawn",
    targetParticipantId: "participant:julia",
  };
  const observedUrls: string[] = [];
  globalThis.fetch = (async (url, init) => {
    if (init?.method === "POST") {
      observedUrls.push(String(url));
      return Response.json({ data: withdrawnRequest, success: true });
    }
    return Response.json({ data: operations([withdrawnRequest]), success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });
    assert.match(JSON.stringify(renderer.toJSON()), /申请已撤回/u);
    const requestAgain = renderer.root.find(
      (node) => node.type === "button" && node.props.children === "再次申请",
    );
    await act(async () => {
      requestAgain.props.onClick();
    });
    assert.equal(
      observedUrls[0],
      "/api/events/event%3Atokyo-ai-night/operations/contact-requests",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => renderer.unmount());
  }
});

function operations(contactRequests: readonly Record<string, unknown>[] = []) {
  return {
    configuration: {
      eventEndsAt: "2026-08-04T09:00:00.000Z",
      profileEditDeadlineAt: "2026-08-04T05:30:00.000Z",
      resultsAvailableAt: "2026-08-04T05:50:00.000Z",
    },
    contactRequests,
    directory: [
      {
        company: "Orbit Ventures",
        displayName: "Maya",
        experienceHighlight: "Built a cross-border fund",
        industry: "Venture capital",
        languages: ["zh", "en"],
        needs: ["AI founders"],
        offers: ["Japan market access"],
        participantId: "participant:maya",
        role: "Investor",
        topics: ["AI", "cross-border"],
      },
      {
        company: "Julia AI",
        displayName: "Julia",
        experienceHighlight: "Scaled enterprise AI deployments",
        industry: "Enterprise AI",
        languages: ["en"],
        needs: ["Japan distribution"],
        offers: ["Enterprise AI implementation"],
        participantId: "participant:julia",
        role: "Founder",
        topics: ["AI", "enterprise"],
      },
    ],
    me: {
      company: "Orbit Ventures",
      displayName: "Maya",
      experienceHighlight: "Built a cross-border fund",
      industry: "Venture capital",
      languages: ["zh", "en"],
      needs: ["AI founders"],
      offers: ["Japan market access"],
      participantId: "participant:maya",
      role: "Investor",
      topics: ["AI", "cross-border"],
    },
    recommendations: {
      noMatchReason: null,
      recommendations: [{
        icebreakers: ["Which enterprise segment has the shortest sales cycle?"],
        memberHint: "Compare Japan distribution with Julia's enterprise deployment playbook.",
        reasons: ["Maya's Japan network complements Julia's enterprise AI delivery."],
        score: 94,
        targetParticipantId: "participant:julia",
      }],
      sourceParticipantId: "participant:maya",
    },
    resultsState: "ready",
    roundOneTable: null,
    roundTwoTable: null,
  };
}

test("recommendation card keeps a visible state action after business-card request and opens accepted contact", async () => {
  const originalFetch = globalThis.fetch;
  const pendingRequest = {
    contactId: null,
    requestId: "request:maya-julia",
    revision: 1,
    requesterParticipantId: "participant:maya",
    status: "awaiting_target_consent",
    targetParticipantId: "participant:julia",
  };
  let state: "none" | "pending" | "accepted" = "none";
  let postCount = 0;
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === "POST") {
      postCount += 1;
      state = "pending";
      return Response.json({ data: pendingRequest, success: true });
    }
    return Response.json({
      data: operations(
        state === "none"
          ? []
          : state === "pending"
            ? [pendingRequest]
            : [{
                ...pendingRequest,
                contactId: "contact:event-consent:maya-julia",
                status: "accepted",
              }],
      ),
      success: true,
    });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });
    const requestButton = renderer.root.find(
      (node) => node.props["data-contact-request-state"] === "none",
    );
    await act(async () => {
      requestButton.props.onClick();
    });
    const waitingButton = renderer.root.find(
      (node) => node.props["data-contact-request-state"] === "awaiting_target_consent",
    );
    assert.equal(postCount, 1);
    assert.equal(waitingButton.type, "button");
    assert.equal(waitingButton.props.disabled, true);
    assert.match(JSON.stringify(renderer.toJSON()), /等待对方同意/u);

    state = "accepted";
    await act(async () => {
      renderer.update(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });
    // Re-mount to exercise the same page load boundary with the accepted canonical side.
    await act(async () => {
      renderer.unmount();
      renderer = create(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });
    const accepted = renderer.root.find(
      (node) => node.props["data-contact-request-state"] === "accepted",
    );
    assert.equal(
      accepted.props.href,
      "/app/contacts/contact%3Aevent-consent%3Amaya-julia",
    );
    assert.match(JSON.stringify(renderer.toJSON()), /打开联系人/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => renderer.unmount());
    }
  }
});

test("failed requests remain retryable while declined requests stay visible and non-retryable", async () => {
  const originalFetch = globalThis.fetch;
  let declined = false;
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === "POST") {
      return Response.json(
        { error: { message: "temporary write failure" }, success: false },
        { status: 503 },
      );
    }
    return Response.json({
      data: operations(declined ? [{
        contactId: null,
        requestId: "request:maya-julia",
        revision: 2,
        requesterParticipantId: "participant:maya",
        status: "declined",
        targetParticipantId: "participant:julia",
      }] : []),
      success: true,
    });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });
    const requestButton = renderer.root.find(
      (node) => node.props["data-contact-request-state"] === "none",
    );
    await act(async () => {
      requestButton.props.onClick();
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-contact-request-state"] === "none",
      ).length,
      1,
      "a transport failure keeps the original idempotent request action available",
    );

    declined = true;
    await act(async () => {
      renderer.unmount();
      renderer = create(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });
    const declinedButton = renderer.root.find(
      (node) => node.props["data-contact-request-state"] === "declined",
    );
    assert.equal(declinedButton.props.disabled, true);
    assert.match(JSON.stringify(renderer.toJSON()), /对方暂不交换/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => renderer.unmount());
    }
  }
});

test("the participant directory search filters on name, company, industry and topics", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({ data: operations(), success: true })) as typeof fetch;
  let renderer!: ReactTestRenderer;

  const cardIds = () => renderer.root
    .findAll((node) => typeof node.props["data-event-directory-participant"] === "string")
    .map((node) => node.props["data-event-directory-participant"] as string);
  const search = async (value: string) => {
    const input = renderer.root.find(
      (node) => node.type === "input" && node.props.type === "search",
    );
    await act(async () => {
      input.props.onChange({ target: { value } });
    });
  };

  try {
    await act(async () => {
      renderer = create(createElement(OrbitEventMatchmaking, {
        eventId: "event:tokyo-ai-night",
      }));
    });

    // The directory ships collapsed, so there is nothing to search until it opens.
    assert.deepEqual(cardIds(), []);
    const toggle = renderer.root.find(
      (node) => node.type === "button" && node.props["aria-expanded"] === false,
    );
    await act(async () => {
      toggle.props.onClick();
    });
    assert.deepEqual(cardIds().sort(), ["participant:julia", "participant:maya"]);

    // Display name.
    await search("julia");
    assert.deepEqual(cardIds(), ["participant:julia"]);

    // Industry, which no card prints — proves the haystack is wider than the card.
    await search("venture");
    assert.deepEqual(cardIds(), ["participant:maya"]);

    // Company, case-insensitively.
    await search("JULIA AI");
    assert.deepEqual(cardIds(), ["participant:julia"]);

    // Topic shared by both.
    await search("  ai  ");
    assert.deepEqual(cardIds().sort(), ["participant:julia", "participant:maya"]);

    // No match keeps the field and explains itself instead of showing a blank grid.
    await search("nobody");
    assert.deepEqual(cardIds(), []);
    const empty = renderer.root.find(
      (node) => node.props["data-event-directory-empty"] !== undefined,
    );
    assert.match(JSON.stringify(empty.props.children), /没有匹配「nobody」的参会者/u);

    // Clearing restores the full directory.
    await search("");
    assert.deepEqual(cardIds().sort(), ["participant:julia", "participant:maya"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => renderer.unmount());
  }
});
