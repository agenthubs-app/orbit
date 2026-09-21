import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type {
  OrbitPartyPersonView,
  OrbitPartyViewModel,
} from "../../app/(app)/app/orbit-party-route-view-model";
import { EventLive } from "../../app/(app)/app/events/events-0918/event-live";

/**
 * 现场屏（/app/events/[id]/live，Orbit_0918）参与者交互：交换联系方式在推荐 / 名单 / 图谱三处共用同一状态，
 * 分桌理由 / 破冰来自已发布结果。原 /app/party 版本的「画像截止 / 编辑入口」与「参会者详情抽屉」不在现场屏决定范围
 * （详情抽屉由任务 5 的参会者弹窗接回），故不再断言。
 */
const EVENT_ID = "event:tokyo/founder-night";
const PROFILE_DEADLINE = "2026-08-03T09:00:00.000Z";
const RESULTS_AVAILABLE = "2026-08-03T10:00:00.000Z";
const NOW = "2026-08-03T10:30:00.000Z";

function attendee(
  overrides: Partial<OrbitPartyPersonView> = {},
): OrbitPartyPersonView {
  return {
    company: "LoopMatter",
    contactId: null,
    contactRequestDirection: null,
    contactRequestId: null,
    contactRequestRevision: null,
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
      { at: "2026-08-03T09:00:00.000Z", description: { en: "Doors open", zh: "开放入场" }, label: { en: "Check-in", zh: "签到" }, time: "09:00" },
      { at: "2026-08-03T09:30:00.000Z", description: { en: "Curated introductions", zh: "定向介绍" }, label: { en: "Round one", zh: "第一轮" }, time: "09:30" },
    ],
    attendees: [person],
    checkedInAt: null,
    checkInAvailable: true,
    contactRequests: [],
    eventId: EVENT_ID,
    eventName: "Tokyo Founder Connection Night",
    eventEndsAt: "2026-09-22T12:00:00.000Z",
    eventPhase: "active",
    eventStartsAt: "2026-09-22T08:30:00.000Z",
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

function tabButton(renderer: ReactTestRenderer, tab: string) {
  return renderer.root.findAll(
    (node) => node.type === "button" && node.props["data-live-tab"] === tab,
  )[0];
}

test("a graph node selects the same one-person consent control and sends only that participant request", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  let requestUrl = "";
  globalThis.fetch = (async (url, init) => {
    requestUrl = String(url);
    requestBody = String(init?.body ?? "");
    return Response.json({
      data: { requestId: "event-contact-request:aiko", revision: 1 },
      success: true,
    });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(<EventLive initialTab="graph" now={NOW} viewModel={partyViewModel()} />);
    });
    const graphNode = renderer.root.find(
      (node) => node.type === "button" && node.props["data-graph-participant"] === "participant:aiko",
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
      JSON.stringify({
        expectedRevision: null,
        targetParticipantId: "participant:aiko",
      }),
    );
    assert.match(JSON.stringify(renderer.toJSON()), /等待对方确认/u);
    assert.equal(
      renderer.root.findAll((node) => node.type === "button" && node.props["data-event-contact-action"] === "request").length,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
  }
});

test("recommendations, attendee directory, and graph use the same owner contact id", async () => {
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
      renderer = create(<EventLive initialTab="home" now={NOW} viewModel={viewModel} />);
    });

    for (const tab of ["rec", "all", "graph"] as const) {
      await act(async () => {
        tabButton(renderer, tab).props.onClick();
      });
      if (tab === "graph") {
        const graphNode = renderer.root.find(
          (node) => node.type === "button" && node.props["data-graph-participant"] === person.id,
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
      assert.equal(
        renderer.root.findAll((node) => node.type === "button" && node.props["data-event-contact-action"] === "request").length,
        0,
        `${tab} must not offer a new request once the contact exists`,
      );
    }
  } finally {
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
  }
});

test("a request sent from the recommendation card is reflected on the directory card for the same person", async () => {
  const originalFetch = globalThis.fetch;
  const person = attendee();
  const requested: string[] = [];
  globalThis.fetch = (async (url, init) => {
    requested.push(`${init?.method ?? "GET"} ${String(url)}`);
    return Response.json({
      data: { requestId: "event-contact-request:aiko", revision: 1 },
      success: true,
    });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(<EventLive initialTab="rec" now={NOW} viewModel={partyViewModel({ attendees: [person], recommendations: [person] })} />);
    });
    const requestButtons = renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-event-contact-action"] === "request",
    );
    assert.equal(requestButtons.length, 1);
    await act(async () => {
      await requestButtons[0].props.onClick();
    });
    assert.deepEqual(requested, [`POST /api/events/${encodeURIComponent(EVENT_ID)}/operations/contact-requests`]);
    await act(async () => {
      tabButton(renderer, "all").props.onClick();
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.type === "button" && node.props["data-event-contact-action"] === "request",
      ).length,
      0,
    );
    const control = renderer.root.find(
      (node) => node.props["data-event-contact-participant"] === person.id,
    );
    assert.equal(control.props["data-event-contact-request-id"], "event-contact-request:aiko");
    assert.match(JSON.stringify(renderer.toJSON()), /等待对方确认/u);
    assert.equal(
      renderer.root.findAll((node) => node.type === "button" && node.props["data-event-contact-action"] === "withdraw").length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
  }
});

test("the group tab renders AI member-level rationales without replacing table icebreakers", async () => {
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
    renderer = create(<EventLive initialTab="home" now={NOW} viewModel={viewModel} />);
  });

  try {
    await act(async () => {
      tabButton(renderer, "group").props.onClick();
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
