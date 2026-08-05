import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitPostEventCenter } from "../../app/(app)/app/events/[id]/orbit-post-event-center";

const EVENT_ID = "event:post-event-ai-state";

interface PostEventAiStateTestEnvelope {
  artifact: null;
  eventId: string;
  failureCode: string | null;
  status: "failed" | "unconfigured";
  updatedAt: null;
}

async function renderArtifactState(
  data: PostEventAiStateTestEnvelope,
  encounters: readonly { encounterId: string; talked: string }[] = [{ encounterId: "encounter:real", talked: "yes" }],
): Promise<ReactTestRenderer> {
  globalThis.fetch = (async (url) => {
    const href = String(url);
    if (href === `/api/encounters?eventId=${encodeURIComponent(EVENT_ID)}`) {
      return Response.json({ data: encounters, success: true });
    }
    if (href === "/api/appointments") return Response.json({ data: [], success: true });
    if (href.endsWith("/post-event/artifact")) return Response.json({ data, success: true });
    if (href.endsWith("/post-event/followups")) return Response.json({ data: [], success: true });
    throw new Error(`Unexpected URL ${href}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OrbitPostEventCenter acceptedContacts={1} eventId={EVENT_ID} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return renderer;
}

test("post-event center maps compatible artifact failure codes to honest button rules", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    { action: null, code: "EVENT_NOT_ENDED", copy: /活动结束后/u, expectedState: "not_available", status: "failed" },
    { action: null, code: "AI_EVIDENCE_REQUIRED", copy: /真实交流/u, expectedState: "evidence_required", status: "failed" },
    { action: null, code: "AI_PROVIDER_UNCONFIGURED", copy: /AI 服务尚未配置/u, expectedState: "provider_unconfigured", status: "unconfigured" },
    { action: null, code: "AI_ARTIFACT_SERVICE_UNAVAILABLE", copy: /AI 产物服务暂时不可用/u, expectedState: "service_unavailable", status: "unconfigured" },
    { action: "request", code: null, copy: /尚未.*发起 AI 会后复盘/u, expectedState: "not_requested", status: "unconfigured" },
    { action: "retry", code: "MODEL_REQUEST_FAILED", copy: /AI 服务拒绝或中止/u, expectedState: "failed", status: "failed" },
    { action: null, code: "AI_ARTIFACT_POLICY_REJECTED", copy: /未通过证据策略校验/u, expectedState: "failed", status: "failed" },
  ] as const;
  try {
    for (const value of cases) {
      const renderer = await renderArtifactState({
        artifact: null,
        eventId: EVENT_ID,
        failureCode: value.code,
        status: value.status,
        updatedAt: null,
      });
      const state = renderer.root.find((node) => node.props["data-post-event-ai-state"] !== undefined);
      assert.equal(state.props["data-post-event-ai-state"], value.expectedState);
      assert.equal(state.props["data-post-event-ai-failure-code"], value.code ?? undefined);
      assert.match(JSON.stringify(renderer.toJSON()), value.copy);
      const actions = renderer.root.findAll((node) => node.props["data-post-event-ai-action"] !== undefined);
      assert.deepEqual(actions.map((node) => node.props["data-post-event-ai-action"]), value.action ? [value.action] : []);
      assert.equal(renderer.root.findAll((node) => node.props["data-post-event-ai-artifact"] !== undefined).length, 0);
      renderer.unmount();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("post-event center does not treat no-conversation evidence as eligible AI input", async () => {
  const originalFetch = globalThis.fetch;
  let renderer: ReactTestRenderer | null = null;
  try {
    renderer = await renderArtifactState({
      artifact: null,
      eventId: EVENT_ID,
      failureCode: null,
      status: "unconfigured",
      updatedAt: null,
    }, [{ encounterId: "encounter:not-confirmed", talked: "no" }]);
    const action = renderer.root.find((node) => node.props["data-post-event-ai-action"] === "request");
    assert.equal(action.props.disabled, true);
    assert.match(JSON.stringify(renderer.toJSON()), /请先记录真实交流/u);
  } finally {
    renderer?.unmount();
    globalThis.fetch = originalFetch;
  }
});
