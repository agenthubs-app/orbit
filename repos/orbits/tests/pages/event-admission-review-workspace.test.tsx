import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventAdmissionReviewWorkspace } from "../../app/(app)/app/events/[id]/operations/admission/event-admission-review-workspace";
import type {
  EventAdmissionApplication,
  EventAdmissionPolicy,
} from "../../features/events/admission/contract";

const EVENT_ID = "event:review-ui";
const APPLICANT_ID = "actor:review-ui-applicant";
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function completeApplication(): EventAdmissionApplication {
  return {
    actorId: APPLICANT_ID,
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    eventId: EVENT_ID,
    policyVersion: 1,
    profilePayload: {
      answers: {
        desiredOutcome: "形成两个可落地的合作实验，并明确下一次约谈负责人",
        energyStyle: "小组深聊、先听后问、偏好基于事实交换观点",
        experienceHighlight: "负责过跨日本、东南亚三地的企业 AI 产品商业化",
        followUpPreference: "两天内邮件同步重点，下周安排 30 分钟 Meet",
        industry: "企业 AI、制造业数字化与气候科技",
        positioning: "跨境产品负责人兼产业生态建设者",
        targetAttendees: "制造集团创新负责人、渠道伙伴和行业研究者",
        valueOffered: "真实采购路径经验、双语产品落地方法和产业资源引荐",
      },
      displayName: "Aiko Mori",
      interviewResponses: [
        {
          answer: { customText: "制造集团创新负责人", displayText: "制造集团创新负责人", selectedOptionIds: [] },
          answerSource: "participant",
          answeredAt: "2026-08-05T10:00:00.000Z",
          field: "targetAttendees",
          generation: { method: "orbit-agent-model-adaptive", model: "gemini-2.5-pro", promptVersion: 3, provider: "google" },
          question: {
            fieldLabel: { en: "Who to meet", zh: "希望认识的人" },
            inputKind: "single_choice_with_custom",
            language: "zh",
            options: [{ id: "custom", label: "具体说明" }],
            prompt: "你希望对方现在正在解决什么具体问题？",
          },
          questionId: "question:target",
          questionSource: "ai_adaptive",
          responseId: "response:target",
          visibility: "matching_only",
        },
        {
          answer: { customText: null, displayText: "两天内邮件同步重点", selectedOptionIds: ["email"] },
          answerSource: "participant",
          answeredAt: "2026-08-05T10:01:00.000Z",
          field: "followUpPreference",
          generation: { method: "orbit-agent-model-adaptive", model: "gemini-2.5-pro", promptVersion: 3, provider: "google" },
          question: {
            fieldLabel: { en: "Follow-up preference", zh: "后续沟通偏好" },
            inputKind: "single_choice_with_custom",
            language: "zh",
            options: [{ id: "email", label: "邮件" }],
            prompt: "什么时间和沟通方式最适合你？",
          },
          questionId: "question:follow-up",
          questionSource: "ai_adaptive",
          responseId: "response:follow-up",
          visibility: "event_attendees",
        },
      ],
    },
    status: "pending_review",
    submittedAt: "2026-08-05T10:05:00.000Z",
    updatedAt: "2026-08-05T10:05:00.000Z",
  };
}

function listData(items = [completeApplication()]) {
  return {
    items: items.map((item) => ({
      actorId: item.actorId,
      applicationVersion: item.applicationVersion,
      decidedAt: item.decidedAt,
      decisionActorId: item.decisionActorId,
      displayName: item.profilePayload.displayName ?? null,
      status: item.status,
      submittedAt: item.submittedAt,
      updatedAt: item.updatedAt,
    })),
    nextCursor: null,
    total: items.length,
    view: "pending",
  };
}

function policyData(overrides: Partial<EventAdmissionPolicy> = {}) {
  const policy: EventAdmissionPolicy = {
    admissionMode: "approval_required",
    capacity: 36,
    eventId: EVENT_ID,
    policyVersion: 3,
    profileEditDeadlineAt: "2026-09-02T10:00:00.000Z",
    registrationClosesAt: "2026-09-03T10:00:00.000Z",
    registrationOpensAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:00.000Z",
    waitlistEnabled: true,
    ...overrides,
  };
  return { policy, policyVersion: policy.policyVersion };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("reviewer clicks a real applicant, sees every profile answer and adaptive response, then sends a versioned decision", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/reviews`;
  const policyUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/policy`;
  const writes: RequestInit[] = [];
  let decided = false;
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url, init) => {
    const target = String(url);
    if (target === policyUrl) {
      return Response.json({ data: policyData(), success: true });
    }
    if (target.startsWith(`${baseUrl}?`)) {
      return Response.json({ data: listData(decided ? [] : [completeApplication()]), success: true });
    }
    if (target === `${baseUrl}/${encodeURIComponent(APPLICANT_ID)}`) {
      return Response.json({ data: completeApplication(), success: true });
    }
    if (target === `${baseUrl}/${encodeURIComponent(APPLICANT_ID)}/decision`) {
      writes.push(init ?? {});
      decided = true;
      return Response.json({
        data: {
          ...completeApplication(),
          applicationVersion: 2,
          decidedAt: "2026-08-05T10:10:00.000Z",
          decisionActorId: "actor:reviewer",
          status: "admitted",
          updatedAt: "2026-08-05T10:10:00.000Z",
        },
        success: true,
      });
    }
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${target}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventAdmissionReviewWorkspace eventId={EVENT_ID} eventTitle="跨境产业合作专场" />);
      await flush();
    });
    const applicant = renderer.root.find(
      (node) => node.props["data-admission-review-applicant"] === APPLICANT_ID,
    );
    await act(async () => {
      applicant.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll(
      (node) => typeof node.props["data-admission-profile-field"] === "string",
    ).length, 8);
    assert.equal(renderer.root.findAll(
      (node) => typeof node.props["data-admission-adaptive-response"] === "string",
    ).length, 2);
    const rendered = JSON.stringify(renderer.toJSON());
    assert.match(rendered, /跨境产品负责人兼产业生态建设者/u);
    assert.match(rendered, /你希望对方现在正在解决什么具体问题/u);
    assert.match(rendered, /什么时间和沟通方式最适合你/u);

    const approve = renderer.root.find(
      (node) => node.props["data-admission-review-decision"] === "approve",
    );
    await act(async () => {
      approve.props.onClick();
      await flush();
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.method, "POST");
    assert.equal(writes[0]?.body, JSON.stringify({
      decision: "approve",
      expectedApplicationVersion: 1,
    }));
    assert.match(JSON.stringify(renderer.toJSON()), /报名已批准/u);
    assert.equal(renderer.root.findAll(
      (node) => node.props["data-admission-review-empty"] === "pending",
    ).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("review queue exposes retry and both empty states without stale applicant details", async () => {
  const originalFetch = globalThis.fetch;
  let fail = true;
  let renderer!: ReactTestRenderer;
  const policyUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/policy`;
  globalThis.fetch = (async (url) => {
    if (String(url) === policyUrl) {
      return Response.json({ data: policyData(), success: true });
    }
    if (fail) {
      fail = false;
      return Response.json({ error: { message: "审核服务暂时不可用" }, success: false }, { status: 503 });
    }
    return Response.json({ data: { ...listData([]), view: "pending" }, success: true });
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventAdmissionReviewWorkspace eventId={EVENT_ID} eventTitle="空队列活动" />);
      await flush();
    });
    assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 1);
    const retry = renderer.root.findAllByType("button").find((node) => node.children.join("") === "重试");
    assert.ok(retry);
    await act(async () => {
      retry.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 0);
    assert.equal(renderer.root.findAll(
      (node) => node.props["data-admission-review-empty"] === "pending",
    ).length, 1);

    const processed = renderer.root.findAllByProps({ role: "tab" }).find(
      (node) => node.children.join("") === "已处理",
    );
    assert.ok(processed);
    await act(async () => {
      processed.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll(
      (node) => node.props["data-admission-review-empty"] === "processed",
    ).length, 1);
    assert.equal(renderer.root.findAll(
      (node) => typeof node.props["data-admission-review-detail"] === "string",
    ).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("organizer policy panel shows the current version and saves only the versioned canonical fields", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/reviews`;
  const policyUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/policy`;
  const writes: RequestInit[] = [];
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url, init) => {
    const target = String(url);
    if (target === policyUrl && init?.method === "PUT") {
      writes.push(init);
      return Response.json({
        data: policyData({ policyVersion: 4, updatedAt: "2026-08-06T10:00:00.000Z" }),
        success: true,
      });
    }
    if (target === policyUrl) {
      return Response.json({ data: policyData(), success: true });
    }
    if (target.startsWith(`${baseUrl}?`)) {
      return Response.json({ data: listData([]), success: true });
    }
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${target}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(
        <EventAdmissionReviewWorkspace
          canConfigurePolicy
          eventId={EVENT_ID}
          eventTitle="政策配置活动"
        />,
      );
      await flush();
    });
    assert.equal(
      renderer.root.find(
        (node) => node.props["data-admission-policy-version"] === true,
      ).children.join(""),
      "当前版本 v3",
    );
    const form = renderer.root.find(
      (node) => node.props["data-admission-policy-form"] === true,
    );
    await act(async () => {
      form.props.onSubmit({ preventDefault() {} });
      await flush();
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.method, "PUT");
    assert.equal(writes[0]?.body, JSON.stringify({
      admissionMode: "approval_required",
      capacity: 36,
      expectedPolicyVersion: 3,
      profileEditDeadlineAt: "2026-09-02T10:00:00.000Z",
      registrationClosesAt: "2026-09-03T10:00:00.000Z",
      registrationOpensAt: "2026-09-01T10:00:00.000Z",
      waitlistEnabled: true,
    }));
    assert.match(JSON.stringify(renderer.toJSON()), /报名政策已保存为 v4/u);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("organizer policy panel makes conflict and unavailable states visible", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/reviews`;
  const policyUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/policy`;
  let policyReads = 0;
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url, init) => {
    const target = String(url);
    if (target === policyUrl && init?.method === "PUT") {
      return Response.json({ error: { message: "Admission policy changed. Refresh and try again." }, success: false }, { status: 409 });
    }
    if (target === policyUrl) {
      policyReads += 1;
      return Response.json({ data: policyData({ policyVersion: policyReads > 1 ? 4 : 3 }), success: true });
    }
    if (target.startsWith(`${baseUrl}?`)) {
      return Response.json({ data: listData([]), success: true });
    }
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${target}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventAdmissionReviewWorkspace canConfigurePolicy eventId={EVENT_ID} eventTitle="冲突活动" />);
      await flush();
    });
    const form = renderer.root.find(
      (node) => node.props["data-admission-policy-form"] === true,
    );
    await act(async () => {
      form.props.onSubmit({ preventDefault() {} });
      await flush();
    });
    assert.equal(renderer.root.findAll(
      (node) => node.props["data-admission-policy-status"] === "conflict",
    ).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /其他负责人更新/u);
    assert.equal(
      renderer.root.find(
        (node) => node.props["data-admission-policy-version"] === true,
      ).children.join(""),
      "当前版本 v4",
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }

  globalThis.fetch = (async () => Response.json(
    { error: { message: "政策服务暂时不可用" }, success: false },
    { status: 503 },
  )) as typeof fetch;
  try {
    await act(async () => {
      renderer = create(<EventAdmissionReviewWorkspace eventId={EVENT_ID} eventTitle="不可用活动" />);
      await flush();
    });
    assert.equal(renderer.root.findAll(
      (node) => node.props["data-admission-policy-status"] === "unavailable",
    ).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("organizer policy panel explains Event Operations activation prerequisites", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/reviews`;
  const policyUrl = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/policy`;
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url, init) => {
    const target = String(url);
    if (target === policyUrl && init?.method === "PUT") {
      return Response.json({
        error: {
          message: "Configure the event operations schedule before activating admission policy.",
        },
        success: false,
      }, { status: 409 });
    }
    if (target === policyUrl) {
      return Response.json({ data: policyData(), success: true });
    }
    if (target.startsWith(`${baseUrl}?`)) {
      return Response.json({ data: listData([]), success: true });
    }
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${target}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(
        <EventAdmissionReviewWorkspace
          canConfigurePolicy
          eventId={EVENT_ID}
          eventTitle="运营时间前置活动"
        />,
      );
      await flush();
    });
    const form = renderer.root.find(
      (node) => node.props["data-admission-policy-form"] === true,
    );
    await act(async () => {
      form.props.onSubmit({ preventDefault() {} });
      await flush();
    });
    assert.equal(renderer.root.findAll(
      (node) => node.props["data-admission-policy-status"] === "conflict",
    ).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /先配置活动运营时间/u);
    assert.match(JSON.stringify(renderer.toJSON()), /完成迁移/u);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("review page is canonical-only and the workspace keeps responsive, authenticated product navigation", () => {
  const page = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/operations/admission/page.tsx"),
    "utf8",
  );
  const workspace = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/operations/admission/event-admission-review-workspace.tsx"),
    "utf8",
  );
  assert.match(page, /createConfiguredEventCoreService/u);
  assert.match(page, /getPublishedEvent/u);
  assert.match(page, /capability: "admission\.read"/u);
  assert.match(page, /capability: "operations\.configure"/u);
  assert.match(page, /redirect\(`\/app\/account\/login\?next=/u);
  assert.doesNotMatch(page, /mockEventRecords|readPublicEventCatalogue|legacyEvent/u);
  assert.match(workspace, /<PublicTopNav active="events" \/>/u);
  assert.match(workspace, /repeat\(auto-fit, minmax\(min\(100%, 390px\), 1fr\)\)/u);
  assert.match(workspace, /EVENT_PARTICIPANT_PROFILE_FIELDS\.map/u);
  assert.match(workspace, /interviewResponses \?\? \[\]/u);
  assert.match(workspace, /EventAdmissionPolicyPanel/u);
  assert.match(workspace, /canConfigurePolicy/u);
});
