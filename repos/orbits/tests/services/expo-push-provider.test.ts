import assert from "node:assert/strict";
import test from "node:test";

import { createExpoPushProvider } from "../../features/notifications/expo-push-provider";

const input = {
  body: "准备企业 AI 诊断会提纲",
  data: { deepLink: "/tasks/task%3Aone", notificationId: "reminder:one" },
  deliveryId: "delivery:one",
  title: "待办提醒",
  token: "ExponentPushToken[test]",
};

test("Expo push provider sends a canonical payload and returns the ticket id", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const provider = createExpoPushProvider({
    fetchImpl: async (request, init) => {
      requests.push({ input: request, ...(init ? { init } : {}) });
      return new Response(JSON.stringify({ data: { id: "ticket:one", status: "ok" } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    },
    sleep: async () => undefined,
  });

  assert.deepEqual(await provider.send(input), { ok: true, providerMessageId: "ticket:one" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.input, "https://exp.host/--/api/v2/push/send");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    body: input.body,
    data: input.data,
    sound: "default",
    title: input.title,
    to: input.token,
  });
});

test("Expo push provider invalidates tokens rejected as DeviceNotRegistered", async () => {
  const provider = createExpoPushProvider({
    fetchImpl: async () => new Response(JSON.stringify({
      data: { details: { error: "DeviceNotRegistered" }, message: "not registered", status: "error" },
    }), { headers: { "content-type": "application/json" }, status: 200 }),
    sleep: async () => undefined,
  });
  assert.deepEqual(await provider.send(input), {
    code: "DEVICE_NOT_REGISTERED",
    ok: false,
    tokenInvalid: true,
  });
});

test("Expo push provider retries temporary transport failures with a hard limit", async () => {
  let calls = 0;
  const delays: number[] = [];
  const provider = createExpoPushProvider({
    fetchImpl: async () => {
      calls += 1;
      return calls < 3
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ data: { id: "ticket:retry", status: "ok" } }), {
            headers: { "content-type": "application/json" },
            status: 200,
          });
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  assert.deepEqual(await provider.send(input), { ok: true, providerMessageId: "ticket:retry" });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1_500]);
});
