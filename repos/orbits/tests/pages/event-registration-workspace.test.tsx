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
        field: "positioning",
        options: ["Building", "Scaling"],
        prompt: "How should attendees understand what you are building?",
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

test("a failed optional-question fetch keeps committed core answers and offers finishing", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const eventId = "event-core-finish";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
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
  // 种入定位+速答后，当前题是"期待结果"；回答它即核心齐全。选答题请求
  // 全部失败——已答内容必须保留，且降级面板要提供"完成报名"。
  globalThis.fetch = (async () => {
    throw new Error("optional question generation unavailable");
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;

  try {
    await act(async () => {
      renderer = create(
        <EventRegistrationWorkspace
          admissionControlled={false}
          event={{ id: eventId, title: "Core Finish Night", venue: "Tokyo" }}
          initialAdmissionApplication={null}
          initialRegistration={null}
          initialSignedQuestion={{
            question: {
              acknowledgment: "",
              field: "desiredOutcome",
              options: ["Find partners", "Meet investors"],
              prompt: "What outcome do you want?",
              provenance: {
                fallbackReason: null,
                generationMethod: "orbit-agent-model-adaptive",
                model: "test-model",
                provider: "test-provider",
              },
            },
            questionToken: "signed-desired-outcome-question",
          }}
          language="zh"
          prefilledPositioning="创始人 @ Orbit"
          profile={{ displayName: "Aiko" }}
        />,
      );
    });

    const optionButton = renderer.root.findAll(
      (node) =>
        node.type === "button" && node.props["data-reg-option"] !== undefined,
    )[0];
    assert.ok(optionButton, "the desiredOutcome option should render");
    await act(async () => {
      await optionButton.props.onClick();
    });

    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-complete-anyway"] !== undefined,
      ).length,
      1,
      "core-complete fallback must offer finishing registration",
    );
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-registration-interview-retry"] !== undefined,
      ).length,
      1,
      "retrying the optional questions stays available",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});
