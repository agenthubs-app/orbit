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
          event={{ id: "event-retry", title: "Retry Night", venue: "Tokyo" }}
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
