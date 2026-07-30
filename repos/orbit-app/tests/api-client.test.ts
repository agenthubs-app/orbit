import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient, type FetchLike } from "../src/api/client";

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "X-Orbit-Feature-Mode": "live",
      ...(init.headers ?? {})
    },
    status: init.status ?? 200
  });
}

test("Orbit API client unwraps success envelopes and runtime headers", async () => {
  const calls: Array<RequestInfo | URL> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push(input);
    assert.equal(
      (init?.headers as Record<string, string>).Accept,
      "application/json"
    );
    assert.equal(init?.credentials, "include");
    return response(JSON.stringify({ success: true, data: { ok: true } }));
  };
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl
  });

  const result = await client.get<{ ok: boolean }>("/api/health");

  assert.equal(result.success, true);
  if (!result.success) {
    assert.fail("Expected a successful API result");
  }
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.meta.featureMode, "live");
  assert.equal(String(calls[0]), "http://localhost:3000/api/health");
});

test("Orbit API client returns failure envelopes without throwing", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      response(
        JSON.stringify({
          success: false,
          error: {
            code: "NOT_IMPLEMENTED",
            message: "Live service is missing"
          }
        }),
        { status: 503 }
      )
  });

  const result = await client.get("/api/app/bootstrap");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.code, "NOT_IMPLEMENTED");
  assert.equal(result.status, 503);
});

test("Orbit API client localizes business-card OCR failures from stable context", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      response(
        JSON.stringify({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            context: {
              businessCardScanOcrErrorCode: "BUSINESS_CARD_OCR_UNCONFIGURED"
            },
            message: "Cloud business card OCR is not configured."
          }
        }),
        { status: 503 }
      )
  });

  const result = await client.post("/api/contact-drafts/business-card/scan");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(
    result.error.message,
    "名片识别服务尚未配置。当前不会生成候选或写入联系人；你可以先粘贴名片文字，或稍后再试。"
  );
  assert.equal(
    result.error.context?.businessCardScanOcrErrorCode,
    "BUSINESS_CARD_OCR_UNCONFIGURED"
  );
  assert.doesNotMatch(result.error.message, /Cloud|OCR|configured/u);
});

test("Orbit API client preserves already-localized server errors", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "请先填写联系人姓名。"
          }
        }),
        { status: 400 }
      )
  });

  const result = await client.post("/api/contact-drafts/manual");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.message, "请先填写联系人姓名。");
});

test("Orbit API client sends PATCH requests with JSON bodies", async () => {
  const calls: Array<{
    init: RequestInit | undefined;
    input: RequestInfo | URL;
  }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ init, input });
    return response(
      JSON.stringify({ success: true, data: { relationshipStage: "active" } })
    );
  };
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000/",
    fetchImpl
  });

  const result = await client.patch<{ relationshipStage: string }>(
    "/api/connections/connection_001/stage",
    {
      body: { relationshipStage: "active" }
    }
  );

  assert.equal(result.success, true);
  assert.equal(String(calls[0]?.input), "http://localhost:3000/api/connections/connection_001/stage");
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>)["Content-Type"],
    "application/json"
  );
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({ relationshipStage: "active" })
  );
});

test("Orbit API client sends PUT requests with JSON bodies", async () => {
  const calls: Array<{
    init: RequestInit | undefined;
    input: RequestInfo | URL;
  }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ init, input });
    return response(
      JSON.stringify({ success: true, data: { currentLevel: "high" } })
    );
  };
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000/",
    fetchImpl
  });

  const result = await client.put<{ currentLevel: string }>("/api/agent/settings", {
    body: { actorLabel: "移动端用户", requestedLevel: "high" }
  });

  assert.equal(result.success, true);
  assert.equal(String(calls[0]?.input), "http://localhost:3000/api/agent/settings");
  assert.equal(calls[0]?.init?.method, "PUT");
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>)["Content-Type"],
    "application/json"
  );
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({ actorLabel: "移动端用户", requestedLevel: "high" })
  );
});

test("Orbit API client sends DELETE requests without a body", async () => {
  const calls: Array<{
    init: RequestInit | undefined;
    input: RequestInfo | URL;
  }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ init, input });
    return response(JSON.stringify({ success: true, data: { deleted: true } }));
  };
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000/",
    fetchImpl
  });

  const result = await client.delete<{ deleted: boolean }>(
    "/api/ai/conversations/sessions/agent-session%2F001"
  );

  assert.equal(result.success, true);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:3000/api/ai/conversations/sessions/agent-session%2F001"
  );
  assert.equal(calls[0]?.init?.method, "DELETE");
  assert.equal(calls[0]?.init?.body, undefined);
});

test("Orbit API client includes stored auth cookies when provided", async () => {
  const calls: Array<{
    init: RequestInit | undefined;
    input: RequestInfo | URL;
  }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ init, input });
    return response(JSON.stringify({ success: true, data: { ok: true } }));
  };
  const client = createOrbitApiClient({
    authCookieHeader: "authjs.session-token=session-token",
    baseUrl: "http://localhost:3000/",
    fetchImpl
  });

  const getResult = await client.get<{ ok: boolean }>("/api/account/me");
  const postResult = await client.post<{ ok: boolean }>("/api/account/me", {
    body: { displayName: "小雨" }
  });

  assert.equal(getResult.success, true);
  assert.equal(postResult.success, true);
  for (const call of calls) {
    assert.equal(
      (call.init?.headers as Record<string, string>).Cookie,
      "authjs.session-token=session-token"
    );
    assert.equal(call.init?.credentials, "omit");
  }
});

test("Orbit API client reports non JSON responses as controlled failures", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      new Response("<html>bad gateway</html>", {
        headers: { "Content-Type": "text/html" },
        status: 502
      })
  });

  const result = await client.get("/api/health");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.code, "ORBIT_APP_NON_JSON_RESPONSE");
  assert.equal(
    result.error.message,
    "Orbit 服务返回了无法识别的内容，请稍后重试。"
  );
  assert.doesNotMatch(result.error.message, /Expected JSON|text\/html/u);
  assert.equal(result.status, 502);
});

test("Orbit API client reports invalid JSON as controlled failures", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      new Response("{bad json", {
        headers: { "Content-Type": "application/json" },
        status: 502
      })
  });

  const result = await client.get("/api/health");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.code, "ORBIT_APP_INVALID_JSON");
  assert.equal(
    result.error.message,
    "Orbit 服务返回的数据暂时无法解析，请稍后重试。"
  );
  assert.doesNotMatch(result.error.message, /JSON|Unexpected|parse/u);
  assert.equal(result.status, 502);
});

test("Orbit API client reports invalid envelopes with Chinese failure copy", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () => response(JSON.stringify({ ok: true }))
  });

  const result = await client.get("/api/health");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.code, "ORBIT_APP_INVALID_ENVELOPE");
  assert.equal(
    result.error.message,
    "Orbit 服务返回的数据格式暂时无法识别，请稍后重试。"
  );
  assert.doesNotMatch(result.error.message, /Response|envelope|did not match/u);
  assert.equal(result.status, 200);
});

test("Orbit API client reports network failures as offline failures", async () => {
  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () => {
      throw new Error("Network request failed");
    }
  });

  const result = await client.get("/api/health");

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected a failed API result");
  }
  assert.equal(result.error.code, "ORBIT_APP_NETWORK_ERROR");
  assert.equal(
    result.error.message,
    "暂时无法连接 Orbit 服务，请检查网络后再试。"
  );
  assert.doesNotMatch(result.error.message, /Network request failed/u);
  assert.equal(result.status, 0);
});
