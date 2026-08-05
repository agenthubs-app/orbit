import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitEncounterCapture } from "../../app/(app)/app/events/[id]/orbit-encounter-capture";

function renderCapture(): ReactTestRenderer {
  return create(<OrbitEncounterCapture contactId="contact:ren" eventId="event:salon" />);
}

test("a successful encounter save rotates the idempotency identity before a changed second version", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { body: Record<string, unknown>; key: string }[] = [];
  globalThis.fetch = (async (_input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      key: String((init?.headers as Record<string, string>)["idempotency-key"]),
    });
    return Response.json({ data: { encounterId: `encounter:${requests.length}` }, success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = renderCapture(); });
    const note = renderer.root.find((node) => node.type === "textarea" && node.props["aria-label"] === "交流记录");
    await act(async () => { note.props.onChange({ target: { value: "Compared a Tokyo retail pilot." } }); });
    const form = renderer.root.find((node) => node.type === "form");
    await act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
    assert.equal(requests.length, 1);
    assert.equal(renderer.root.find((node) => node.type === "button" && node.props.type === "submit").props.disabled, true, "an unchanged saved snapshot cannot create a duplicate encounter");

    const editedNote = renderer.root.find((node) => node.type === "textarea" && node.props["aria-label"] === "交流记录");
    await act(async () => { editedNote.props.onChange({ target: { value: "Compared the pilot and agreed to review conversion data." } }); });
    assert.equal(renderer.root.find((node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
    await act(async () => { await renderer.root.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); });

    assert.equal(requests.length, 2);
    assert.notEqual(requests[0]?.key, requests[1]?.key, "a changed post-save memo is a new encounter version");
    assert.equal(requests[1]?.body.noteText, "Compared the pilot and agreed to review conversion data.");
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("a failed encounter save reuses the same idempotency identity for a safe retry", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { body: Record<string, unknown>; key: string }[] = [];
  globalThis.fetch = (async (_input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      key: String((init?.headers as Record<string, string>)["idempotency-key"]),
    });
    return requests.length === 1
      ? Response.json({ error: { code: "TEMPORARY" } }, { status: 503 })
      : Response.json({ data: { encounterId: "encounter:retry" }, success: true });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = renderCapture(); });
    const note = renderer.root.find((node) => node.type === "textarea" && node.props["aria-label"] === "交流记录");
    await act(async () => { note.props.onChange({ target: { value: "A detailed retry-safe conversation record." } }); });
    const submit = async () => renderer.root.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    await act(async () => { await submit(); });
    await act(async () => { await submit(); });
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.key, requests[1]?.key);
    assert.equal(requests[0]?.body.observedAt, requests[1]?.body.observedAt);
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});
