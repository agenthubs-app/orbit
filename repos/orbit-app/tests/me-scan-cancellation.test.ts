import assert from "node:assert/strict";
import test from "node:test";
import type { OrbitApiClient } from "../src/api/client";
import { scanOwnBusinessCard } from "../src/api/profile-onboarding";

test("R18a own-card scan forwards an optional cancellation signal without changing existing calls", async () => {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const client = { async post(path: string, options: Record<string, unknown>) {
    calls.push({ path, options });
    return { success: true, status: 200, data: { draft: { displayName: "佐藤", organization: "Orbit", role: "担当" } } };
  } } as unknown as OrbitApiClient;
  const image = { base64: "AAAA", mimeType: "image/jpeg", fileName: "card.jpg", size: 3 };
  const abort = new AbortController();
  assert.deepEqual(await scanOwnBusinessCard(client, image, abort.signal), { ok: true, name: "佐藤", company: "Orbit", title: "担当" });
  assert.equal(calls[0]?.options.signal, abort.signal);
  await scanOwnBusinessCard(client, image);
  assert.ok(!("signal" in calls[1]!.options));
  assert.deepEqual(calls[0]?.options.body, calls[1]?.options.body);
  assert.equal(calls[0]?.path, "/api/contact-drafts/business-card/scan");
});
