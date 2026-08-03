import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type {
  OrbitPartyPersonView,
  OrbitPartyViewModel,
} from "../../app/(app)/app/orbit-party-route-view-model";
import {
  OrbitRealParty,
  OrbitRealPartyGraph,
} from "../../app/(app)/app/dashboard/orbit-real-party";

const EVENT_ID = "event:tokyo/founder-night";
const PROFILE_DEADLINE = "2026-08-03T09:00:00.000Z";
const RESULTS_AVAILABLE = "2026-08-03T10:00:00.000Z";

function attendee(
  overrides: Partial<OrbitPartyPersonView> = {},
): OrbitPartyPersonView {
  return {
    company: "LoopMatter",
    contactId: null,
    contactRequestDirection: null,
    contactRequestId: null,
    contactRequestStatus: "none",
    g: "g-indigo",
    groupNumber: 2,
    icebreakers: ["Which buyer signal changed your rollout plan?"],
    id: "participant:aiko",
    industry: "Circular economy",
    initial: "A",
    isRecommended: true,
    memberHint: "Compare enterprise procurement cycles.",
    name: "Aiko Mori",
    noMatchReason: null,
    offering: "Packaging reuse pilot data",
    reason: "Her enterprise pilots complement your manufacturing network.",
    score: 91,
    seat: "T2-S3",
    seeking: "Manufacturing buyers",
    summary: "Climate founder scaling reusable packaging in Japan.",
    title: "Founder",
    topics: ["Reuse systems", "Enterprise procurement"],
    ...overrides,
  };
}

function partyViewModel(
  overrides: Partial<OrbitPartyViewModel> = {},
): OrbitPartyViewModel {
  const person = attendee();
  return {
    accessCode: "TOKYO-8431",
    agenda: [
      { description: "Doors open", label: "Check-in", time: "18:00" },
      { description: "Curated introductions", label: "Round one", time: "18:30" },
    ],
    attendees: [person],
    checkedInAt: null,
    checkInAvailable: true,
    contactRequests: [],
    eventId: EVENT_ID,
    eventName: "Tokyo Founder Connection Night",
    eventPhase: "active",
    eventVenue: "Marunouchi Hall",
    generationNotice: null,
    graph: {
      edges: [
        {
          fromParticipantId: "participant:me",
          id: "edge:recommendation:aiko",
          kind: "recommendation",
          label: "Complementary market access",
          toParticipantId: person.id,
        },
      ],
      nodes: [
        {
          company: person.company,
          displayName: person.name,
          participantId: person.id,
        },
      ],
    },
    icebreakers: [],
    me: {
      groupNumber: 1,
      initial: "L",
      name: "Li Wei",
      participantId: "participant:me",
      offering: ["Japan market partnerships"],
      prompts: ["Ask about her latest pilot."],
      role: "Investor",
      seat: "T1-S1",
      seeking: ["Circular economy founders"],
      topics: ["Climate", "Go-to-market"],
    },
    profileEditDeadlineAt: PROFILE_DEADLINE,
    profileEditable: false,
    recommendationNoMatchReason: null,
    recommendations: [person],
    resultsAvailableAt: RESULTS_AVAILABLE,
    resultsState: "ready",
    roundOne: null,
    roundTwo: null,
    tableMates: [],
    ...overrides,
  };
}

function installModalDocumentStub() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const documentStub = {
    activeElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
    writable: true,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  };
}

test("Party renders both operational times and locks event-persona editing at the exact deadline state", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OrbitRealParty viewModel={partyViewModel()} />);
  });

  try {
    const times = renderer.root.findAll((node) => node.type === "time");
    assert.deepEqual(
      times.map((node) => node.props.dateTime),
      [PROFILE_DEADLINE, RESULTS_AVAILABLE],
    );
    const lockedActions = renderer.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["data-event-profile-action"] === "locked",
    );
    assert.equal(lockedActions.length, 1);
    assert.equal(lockedActions[0].props.disabled, true);
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "a" &&
          node.props["data-event-profile-action"] === "edit",
      ).length,
      0,
    );
    assert.match(JSON.stringify(renderer.toJSON()), /画像截止时间已到/u);
  } finally {
    renderer.unmount();
  }
});

test("Party exposes the event-persona route only while the profile is editable", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <OrbitRealParty
        viewModel={partyViewModel({ profileEditable: true })}
      />,
    );
  });

  try {
    const editActions = renderer.root.findAll(
      (node) =>
        node.type === "a" &&
        node.props["data-event-profile-action"] === "edit",
    );
    assert.equal(editActions.length, 1);
    assert.equal(
      editActions[0].props.href,
      `/app/events/${encodeURIComponent(EVENT_ID)}/register`,
    );
  } finally {
    renderer.unmount();
  }
});

test("a graph node opens the same one-person consent control and sends only that participant request", async () => {
  const restoreDocument = installModalDocumentStub();
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  let requestUrl = "";
  globalThis.fetch = (async (url, init) => {
    requestUrl = String(url);
    requestBody = String(init?.body ?? "");
    return Response.json({
      data: { requestId: "event-contact-request:aiko" },
      success: true,
    });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(<OrbitRealPartyGraph viewModel={partyViewModel()} />);
    });
    const graphNode = renderer.root.find(
      (node) => node.props["data-graph-participant"] === "participant:aiko",
    );
    await act(async () => {
      graphNode.props.onClick();
    });
    const requestButton = renderer.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-event-contact-action"] === "request",
    );
    await act(async () => {
      await (requestButton.props.onClick() as Promise<void>);
    });
    assert.equal(
      requestUrl,
      `/api/events/${encodeURIComponent(EVENT_ID)}/operations/contact-requests`,
    );
    assert.equal(
      requestBody,
      JSON.stringify({ targetParticipantId: "participant:aiko" }),
    );
    assert.match(JSON.stringify(renderer.toJSON()), /等待对方授权/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    restoreDocument();
  }
});

test("recommendations, attendee directory, and graph use the same owner contact id", async () => {
  const restoreDocument = installModalDocumentStub();
  const contactId = "contact:owner:li/participant:aiko";
  const person = attendee({
    contactId,
    contactRequestStatus: "none",
  });
  const viewModel = partyViewModel({
    attendees: [person],
    graph: {
      edges: [],
      nodes: [
        {
          company: person.company,
          displayName: person.name,
          participantId: person.id,
        },
      ],
    },
    recommendations: [person],
  });
  const href = `/app/contacts/${encodeURIComponent(contactId)}`;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(<OrbitRealParty viewModel={viewModel} />);
    });

    for (const tab of ["recommendations", "attendees", "graph"] as const) {
      const tabButton = renderer.root.findAll(
        (node) =>
          node.type === "button" && node.props["data-party-tab"] === tab,
      )[0];
      await act(async () => {
        tabButton.props.onClick();
      });
      if (tab === "graph") {
        const graphNode = renderer.root.find(
          (node) => node.props["data-graph-participant"] === person.id,
        );
        await act(async () => {
          graphNode.props.onClick();
        });
      }
      assert.equal(
        renderer.root.findAll(
          (node) => node.type === "a" && node.props.href === href,
        ).length,
        1,
        `${tab} should render the same owner-scoped contact`,
      );
    }
  } finally {
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    restoreDocument();
  }
});

test("Party table renders AI member-level rationales without replacing table icebreakers", async () => {
  const person = attendee();
  const viewModel = partyViewModel({
    roundOne: {
      icebreakers: [
        "Compare the evidence behind each current priority",
        "Identify one dependency the table can unblock",
        "Agree on one concrete post-event introduction",
      ],
      memberPrompts: [
        "Ask which procurement signal is strongest",
        "Compare the evidence needed for a pilot",
      ],
      members: [
        {
          ...person,
          groupingRationale:
            "Aiko contributes enterprise procurement access that complements your Japan partnership experience.",
        },
      ],
      myRationale:
        "Your Japan partnership experience anchors the implementation and market-entry side of this table.",
      rationale:
        "This table connects circular-economy implementation evidence with enterprise buying access.",
      seat: "R1-T1-S1",
      tableNumber: 1,
      theme: "From pilot evidence to enterprise adoption",
    },
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OrbitRealParty viewModel={viewModel} />);
  });

  try {
    const tableTab = renderer.root.findAll(
      (node) =>
        node.type === "button" && node.props["data-party-tab"] === "table",
    )[0];
    await act(async () => {
      tableTab.props.onClick();
    });
    const rationaleNodes = renderer.root.findAll(
      (node) => node.props["data-party-member-rationale"] !== undefined,
    );
    assert.deepEqual(
      rationaleNodes.map((node) => node.props["data-party-member-rationale"]),
      ["self", person.id],
    );
    const rendered = JSON.stringify(renderer.toJSON());
    assert.match(rendered, /你为什么被分到这桌/u);
    assert.match(rendered, /成员分组理由/u);
    assert.match(rendered, /全桌破冰/u);
    for (const icebreaker of viewModel.roundOne!.icebreakers) {
      assert.match(rendered, new RegExp(icebreaker, "u"));
    }
  } finally {
    renderer.unmount();
  }
});
