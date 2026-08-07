import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventRegistrationWorkspace } from "../../app/(app)/app/events/[id]/register/event-registration-workspace";
import type { SignedAdaptiveInterviewStep } from "../../features/events/registration/interview-response-contract";

test("an initial AI failure offers an in-place real-model retry without a fallback question", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const step: SignedAdaptiveInterviewStep = {
    done: false,
    signedQuestion: {
      question: {
        acknowledgment: "",
        field: "targetAttendees",
        options: ["Founders", "Investors"],
        prompt: "Who do you want to meet at this event?",
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "test-model",
          provider: "test-provider",
        },
      },
      questionToken: "signed-real-model-question",
    },
  };
  globalThis.fetch = (async () =>
    Response.json({ data: step, success: true })) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          admissionControlled={false}
          event={{ id: "event-retry", title: "Retry Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={null}
          language="en"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-interview-retry"] !== undefined,
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll((node) =>
        typeof node.children[0] === "string" &&
        node.children[0].includes("substitute question"),
      ).length > 0,
      true,
    );

    const retry = renderer.root.find(
      (node) => node.props["data-registration-interview-retry"] !== undefined,
    );
    await act(async () => {
      await retry.props.onClick();
    });

    assert.equal(
      renderer.root.findAll(
        (node) => node.type === "h2" && node.children.includes(step.signedQuestion!.question.prompt),
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-interview-retry"] !== undefined,
      ).length,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("two quick answers submit registration without requesting a third interview question", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const eventId = "event-two-question-finish";
  const requests: { body: unknown; url: string }[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      clearInterval() {},
      removeEventListener() {},
      setInterval() {
        return 1;
      },
      setTimeout(callback: () => void) {
        callback();
        return 1;
      },
      localStorage: {
        getItem: (key: string) =>
          key === `orbit-quick-answers:${eventId}`
            ? JSON.stringify({
                targetAttendees: "硬件供应链的创始人",
                valueOffered: "海外渠道资源",
              })
            : null,
        removeItem() {},
        setItem() {},
      },
    },
  });
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push({
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      url,
    });
    if (url.endsWith("/registration/persona")) {
      return Response.json({
        data: {
          persona: {
            energyStyle: "Focused",
            industryTags: ["Technology"],
            offering: "海外渠道资源",
            openers: ["你目前最关注哪个市场？"],
            provenance: {
              fallbackReason: null,
              generationMethod: "orbit-agent-model-adaptive",
              model: "test-model",
              provider: "test-provider",
            },
            seeking: "硬件供应链的创始人",
            tagline: "连接硬件与海外市场",
            tags: ["硬件", "出海"],
          },
        },
        success: true,
      });
    }
    if (url.endsWith("/registration")) {
      return Response.json({
        data: {
          participantProfile: { answers: {} },
          status: "rsvped",
        },
        success: true,
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          admissionControlled={false}
          event={{ id: eventId, title: "Two Question Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={{
            question: {
              acknowledgment: "",
              field: "targetAttendees",
              options: ["Founders", "Investors"],
              prompt: "Who do you want to meet?",
              provenance: {
                fallbackReason: null,
                generationMethod: "orbit-agent-model-adaptive",
                model: "test-model",
                provider: "test-provider",
              },
            },
            questionToken: "signed-target-attendees-question",
          }}
          language="zh"
          prefilledPositioning="创始人 @ Orbit"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });

    assert.equal(
      requests.some((request) => request.url.endsWith("/registration/interview")),
      false,
      "the registration flow must not request an optional third question",
    );
    const registrationRequest = requests.find((request) =>
      request.url.endsWith("/registration"),
    );
    assert.deepEqual(registrationRequest?.body, {
      answers: {
        positioning: "创始人 @ Orbit",
        targetAttendees: "硬件供应链的创始人",
        valueOffered: "海外渠道资源",
      },
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-stage"] === "persona",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});

test("the questionnaire progress counts only the two required event answers", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const secondStep: SignedAdaptiveInterviewStep = {
    done: false,
    signedQuestion: {
      question: {
        acknowledgment: "明白了，你想围绕创业者建立连接。",
        field: "valueOffered",
        options: ["行业经验", "合作资源"],
        prompt: "你最适合为遇到的人提供什么？",
        provenance: {
          fallbackReason: null,
          generationMethod: "orbit-agent-model-adaptive",
          model: "test-model",
          provider: "test-provider",
        },
      },
      questionToken: "signed-value-offered-question",
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    },
  });
  globalThis.fetch = (async () =>
    Response.json({ data: secondStep, success: true })) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          admissionControlled={false}
          event={{ id: "event-progress", title: "Progress Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={{
            question: {
              acknowledgment: "",
              field: "targetAttendees",
              options: ["创业者", "投资人"],
              prompt: "你最希望认识谁？",
              provenance: {
                fallbackReason: null,
                generationMethod: "orbit-agent-model-adaptive",
                model: "test-model",
                provider: "test-provider",
              },
            },
            questionToken: "signed-target-question",
          }}
          language="zh"
          prefilledPositioning="创始人 @ Orbit"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });

    let progress = renderer.root.findByProps({ role: "progressbar" });
    assert.equal(progress.props["aria-valuemax"], 2);
    assert.equal(progress.props["aria-valuenow"], 1);
    assert.equal(
      renderer.root.findAllByProps({
        "data-registration-progress-label": "1/2",
      }).length,
      1,
    );

    const firstOption = renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-reg-option"] !== undefined,
    )[0];
    assert.ok(firstOption);
    await act(async () => {
      firstOption.props.onClick();
      await Promise.resolve();
    });

    progress = renderer.root.findByProps({ role: "progressbar" });
    assert.equal(progress.props["aria-valuenow"], 2);
    assert.equal(
      renderer.root.findAllByProps({
        "data-registration-progress-label": "2/2",
      }).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
