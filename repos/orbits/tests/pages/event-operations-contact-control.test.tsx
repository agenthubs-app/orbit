/**
 * 交换联系方式状态机（`events-0918/live-controls.ts` `useEventContactRequest`）经其渲染面
 * `ContactAction`（event-contact-action.tsx）验证。原 party/event-operations-controls.tsx 的
 * `EventContactRequestControl` 已随 /app/party* 于 2026-09-22 删除；接受后的记录交流 / 约谈
 * 工作流改由参会者 / 约谈 / 记录交流弹窗承担（tests/pages/app-event-*-modal.test.tsx）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { ContactAction } from "../../app/(app)/app/events/events-0918/event-contact-action";
import { contactRequestStateKey, resetContactRequestStateCache, useEventContactRequest } from "../../app/(app)/app/events/events-0918/live-controls";
import type { OrbitPartyPersonView } from "../../app/(app)/app/orbit-party-route-view-model";

const EVENT_ID = "event:e2e:orbit-connection-night";

// 写操作结果缓存现按 <eventId participantId> 键（终审 M1）跨挂载共享；每条用例从空缓存开始。
test.beforeEach(() => resetContactRequestStateCache());
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
        <ContactAction
          eventId={EVENT_ID}
          open
          person={person()}
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

    act(() => {
      acceptButtons[0].props.onClick();
    });

    const busyAcceptButtons = renderer.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["data-event-contact-action"] === "accept",
    );
    assert.equal(busyAcceptButtons.length, 1);
    assert.equal(busyAcceptButtons[0].props.disabled, true);
    assert.equal(
      renderer.root.find((node) => node.props["data-event-contact-participant"] === "participant:aiko").props["aria-busy"],
      true,
    );
    assert.match(JSON.stringify(renderer.toJSON()), /Saving…/u);
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
      await response;
    });
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-event-contact-action"] === "accept",
      ).length,
      0,
    );
    assert.match(JSON.stringify(renderer.toJSON()), /Exchanged · open contact/u);
    const contactLinks = renderer.root.findAll(
      (node) =>
        node.type === "a" &&
        node.props.href ===
          `/app/contacts/${encodeURIComponent("contact:owner:aiko")}`,
    );
    assert.equal(contactLinks.length, 1);
    // The post-acceptance workflow (encounter capture / appointment) now lives in the
    // attendee / schedule / note modals; the inline control only exposes the contact link.
    assert.equal(
      renderer.root.findAll((node) => node.props["data-human-encounter-capture"] !== undefined).length,
      0,
    );
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
        <ContactAction
          eventId={EVENT_ID}
          open
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
        <ContactAction
          eventId={EVENT_ID}
          open
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
      declineButtons[0].props.onClick();
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
        <ContactAction
          eventId={EVENT_ID}
          open
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
      withdraw.props.onClick();
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
      requestAgain.props.onClick();
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
        <ContactAction
          eventId={EVENT_ID}
          open
          person={sharedPerson}
          t={(copy) => copy.en}
        />,
      );
    });
    const request = renderer.root.find(
      (node) => node.props["data-event-contact-action"] === "request",
    );
    await act(async () => {
      request.props.onClick();
    });
    const withdraw = renderer.root.find(
      (node) => node.props["data-event-contact-action"] === "withdraw",
    );
    await act(async () => {
      withdraw.props.onClick();
    });
    assert.equal(
      renderer.root.findAll((node) => node.props["data-event-contact-action"] === "request-again").length,
      1,
    );
    await act(async () => {
      laterSurface = create(
        <ContactAction
          eventId={EVENT_ID}
          open
          person={sharedPerson}
          t={(copy) => copy.en}
        />,
      );
    });
    assert.equal(
      laterSurface.root.findAll((node) => node.props["data-event-contact-action"] === "request-again").length,
      1,
      "a newly mounted live surface reads the latest lifecycle instead of stale route props",
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
      <ContactAction
        eventId={EVENT_ID}
        open
        person={person({
          contactId: "contact:owner:participant:aiko/primary",
          contactRequestDirection: null,
          contactRequestId: null,
          contactRequestStatus: "none",
        })}
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
    assert.match(JSON.stringify(renderer.toJSON()), /Exchanged · open contact/u);
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "a" &&
          node.props.href ===
            `/app/contacts/${encodeURIComponent("contact:owner:participant:aiko/primary")}`,
      ).length,
      1,
    );
  } finally {
    renderer.unmount();
  }
});


test("a request sent on one tab seeds a later-mounted instance for the same participant on another tab (Map keyed by event + participant, not by person object)", async () => {
  resetContactRequestStateCache();
  assert.equal(contactRequestStateKey("event:x", "participant:y"), "event:x participant:y");
  const originalFetch = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = (async () => {
    posts += 1;
    return Response.json({ data: { requestId: "event-contact-request:fresh", revision: 1 }, success: true });
  }) as typeof fetch;
  const fresh = () => person({ contactRequestDirection: null, contactRequestId: null, contactRequestRevision: null, contactRequestStatus: "none" });
  const snapshots: { tab: string; status: string | null; requestId: string | null }[] = [];
  function Probe({ tab, who }: { tab: string; who: OrbitPartyPersonView }) {
    const control = useEventContactRequest({ eventId: EVENT_ID, person: who, t: (copy) => copy.en });
    snapshots.push({ tab, status: control.status, requestId: control.requestId });
    return null;
  }
  let first!: ReactTestRenderer;
  let second!: ReactTestRenderer;
  try {
    // 页签 1：推荐卡上发申请（person 对象 A）
    await act(async () => { first = create(<ContactAction eventId={EVENT_ID} open person={fresh()} t={(copy) => copy.en} />); });
    const request = first.root.find((node) => node.type === "button" && node.props["data-event-contact-action"] === "request");
    await act(async () => { await (request.props.onClick() as Promise<void>); });
    assert.equal(posts, 1);
    assert.match(JSON.stringify(first.toJSON()), /Waiting for their consent/u);

    // 页签 2：之后才挂载，拿到的是另一个 person 对象 B（同一 participant id，投影仍是 none）
    await act(async () => { second = create(<Probe tab="all" who={fresh()} />); });
    const latest = snapshots.filter((entry) => entry.tab === "all").at(-1);
    assert.deepEqual(latest, { tab: "all", status: "awaiting_target_consent", requestId: "event-contact-request:fresh" }, "seeded from the shared Map, not from the stale projection");
    assert.equal(posts, 1, "no extra request");

    // 另一活动同一 participant id 不受影响
    let other!: ReactTestRenderer;
    function OtherEvent() {
      const control = useEventContactRequest({ eventId: "event:other", person: fresh(), t: (copy) => copy.en });
      snapshots.push({ tab: "other", status: control.status, requestId: control.requestId });
      return null;
    }
    await act(async () => { other = create(<OtherEvent />); });
    assert.equal(snapshots.filter((entry) => entry.tab === "other").at(-1)?.status, "none");
    await act(async () => { other.unmount(); });
  } finally {
    globalThis.fetch = originalFetch;
    if (first) await act(async () => { first.unmount(); });
    if (second) await act(async () => { second.unmount(); });
    resetContactRequestStateCache();
  }
});
