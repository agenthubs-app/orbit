/**
 * W0050 SC-04：`POST /api/contacts/:id/reconnect-draft`（待唤醒「起草邮件」）。
 * - 本人联系人 → 200 `{ draft }`（模板，provider = template）；他人的、已删除的、不存在的 → 404，与不存在相同；
 * - 未登录 → 401；整个请求 0 次付费 AI 请求、0 次写库（statement 计量）。
 * 归属读取用真实 PostgreSQL（`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createReconnectDraftRouteHandlers, readOwnedContact } from "../../app/api/contacts/[id]/reconnect-draft/route-handlers";
import { PAID_AI_HOSTS } from "../../scripts/test-paid-ai-boundary.mjs";
import { ALICE, BOB, databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

function request(language: "zh" | "en" = "zh") {
  return new Request("http://localhost/api/contacts/x/reconnect-draft", { body: JSON.stringify({ language }), headers: { "content-type": "application/json" }, method: "POST" });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });

test("SC-04: own contact → editable template draft; another actor's, deleted or unknown contact → 404; no paid AI, no writes", databaseTest, async (t) => {
  const original = globalThis.fetch;
  const paid: string[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (PAID_AI_HOSTS.includes(new URL(url).hostname)) paid.push(url);
    return original(input as never, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  await withNetworkDatabase(async (harness) => {
    await harness.addContact(ALICE, `${ALICE}:zhou`, { displayName: "周杰", organization: "北辰资本", role: "合伙人" });
    await harness.addContact(ALICE, `${ALICE}:gone`, { displayName: "已删" });
    await harness.deleteRecord("contacts", `${ALICE}:gone`);
    await harness.addContact(BOB, `${BOB}:secret`, { displayName: "Bob 的人" });
    harness.meter.writes.length = 0;
    const handlers = createReconnectDraftRouteHandlers({
      readContact: (actorId, contactId) => readOwnedContact({ client: harness.client, workspaceId: WORKSPACE }, actorId, contactId),
      readGoal: async () => "拿到天使轮融资",
      resolveActor: async () => ({ id: ALICE }) as never,
    });
    const ok = await handlers.POST(request(), context(encodeURIComponent(`${ALICE}:zhou`)));
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.success, true);
    assert.equal(body.data.draft.provider, "template");
    assert.match(body.data.draft.body, /^周杰您好：[\s\S]*拿到天使轮融资[\s\S]*北辰资本担任合伙人/);
    const en = await (await handlers.POST(request("en"), context(`${ALICE}:zhou`))).json();
    assert.match(en.data.draft.body, /^Hi 周杰,/);
    for (const id of [`${BOB}:secret`, `${ALICE}:gone`, `${ALICE}:missing`]) {
      const response = await handlers.POST(request(), context(id));
      assert.equal(response.status, 404, id);
      assert.doesNotMatch(JSON.stringify(await response.json()), /Bob 的人|已删/);
    }
    assert.deepEqual(harness.meter.writes, [], "drafting never writes");
    assert.deepEqual(paid, [], "drafting never calls a model");
    const anonymous = createReconnectDraftRouteHandlers({ resolveActor: async () => null });
    assert.equal((await anonymous.POST(request(), context(`${ALICE}:zhou`))).status, 401);
  });
});
