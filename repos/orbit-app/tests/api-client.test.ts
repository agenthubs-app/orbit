import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient, type FetchLike } from "../src/api/client";
import { onSessionExpired } from "../src/api/session-expiry";
import type { OrbitApiBytes, OrbitApiRequestOptions } from "../src/api/client";

test("binary options reject simultaneous JSON and raw bodies at compile time", () => {
  // @ts-expect-error JSON and binary bodies are mutually exclusive.
  const invalid: OrbitApiRequestOptions = { body: {}, rawBody: new Uint8Array() };
  assert.ok(invalid);
});

test("raw bytes reach fetch unchanged with declared MIME and explicit-cookie isolation", async () => {
  let captured: RequestInit | undefined;
  const bytes = new Uint8Array([0, 255, 17, 128]);
  const client = createOrbitApiClient({
    authCookieHeader: "test-session=synthetic",
    fetchImpl: async (_url, init) => {
      captured = init;
      return response(JSON.stringify({ success: true, data: {} }));
    }
  });
  await client.put("/api/test/content", { rawBody: bytes, headers: { "Content-Type": "image/jpeg" } });
  assert.equal(captured?.body, bytes);
  assert.equal(captured?.credentials, "omit");
  assert.equal(new Headers(captured?.headers).get("Content-Type"), "image/jpeg");
  assert.equal(new Headers(captured?.headers).get("Cookie"), "test-session=synthetic");
});

test("bytes success preserves exact bytes, MIME, status and meta", async () => {
  const bytes = new Uint8Array([0, 255, 17, 128]);
  const client = createOrbitApiClient({ fetchImpl: async () => new Response(bytes, {
    status: 206, headers: { "Content-Type": "image/jpeg", "X-Orbit-Privacy": "private" }
  }) });
  const result = await client.get<OrbitApiBytes>("/api/test/image", { responseType: "bytes" });
  assert.equal(result.success, true);
  if (!result.success) assert.fail();
  assert.deepEqual(result.data, { bytes, contentType: "image/jpeg" });
  assert.equal(result.status, 206);
  assert.equal(result.meta.privacy, "private");
});

test("binary requests preserve localized JSON failures and 401 expiry", async () => {
  let expiries = 0;
  const unsubscribe = onSessionExpired(() => { expiries += 1; });
  try {
    for (const status of [401, 404, 503]) {
      const client = createOrbitApiClient({ fetchImpl: async () => response(JSON.stringify({
        success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "NOT_FOUND", message: "Not found" }
      }), { status }) });
      const result = await client.get("/api/test/image", { responseType: "bytes" });
      assert.equal(result.success, false);
      if (result.success) assert.fail();
      assert.equal(result.status, status);
      assert.match(result.error.message, /[\u3400-\u9fff]/u);
    }
    assert.equal(expiries, 1);
  } finally { unsubscribe(); }
});

test("GET coalescing separates representation, headers, accounts, servers and body-bearing requests", async () => {
  let count = 0;
  const fetchImpl: FetchLike = async () => {
    count += 1;
    return response(JSON.stringify({ success: true, data: {} }));
  };
  const client = createOrbitApiClient({ fetchImpl });
  const calls = [
    client.get("/api/test/image"), client.get("/api/test/image"),
    client.get("/api/test/image", { responseType: "bytes" }),
    client.get("/api/test/image", { responseType: "bytes" }),
    client.get("/api/test/image", { headers: { "X-Test": "other" } }),
    createOrbitApiClient({ fetchImpl, authCookieHeader: "other=synthetic" }).get("/api/test/image"),
    createOrbitApiClient({ fetchImpl, baseUrl: "http://localhost:9999" }).get("/api/test/image"),
    client.get("/api/test/image", { rawBody: new Uint8Array([1]) }),
    client.get("/api/test/image", { rawBody: new Uint8Array([1]) }),
    client.get("/api/test/image", { body: {} }), client.get("/api/test/image", { body: {} })
  ];
  await Promise.all(calls);
  assert.equal(count, 9);
});

test("binary read failures and oversized responses are visible failures", async () => {
  for (const kind of ["read", "declared", "actual"]) {
    const res = new Response(kind === "actual" ? new Uint8Array(10 * 1024 * 1024 + 1) : "x", {
      headers: { "Content-Type": "image/png", ...(kind === "declared" ? { "Content-Length": "10485761" } : {}) }
    });
    if (kind === "read") res.arrayBuffer = async () => { throw new Error("read failed"); };
    const client = createOrbitApiClient({ fetchImpl: async () => res });
    const result = await client.get("/api/test/image", { responseType: "bytes" });
    assert.equal(result.success, false);
    if (result.success) assert.fail();
    assert.equal(result.error.code, kind === "read" ? "ORBIT_APP_BINARY_READ_ERROR" : "ORBIT_APP_BINARY_TOO_LARGE");
  }
});

test("binary mode still validates JSON envelopes and never exposes JSON success as image bytes", async () => {
  for (const body of ["{bad", '{"ok":true}', '{"success":true,"data":{}}']) {
    const client = createOrbitApiClient({ fetchImpl: async () => response(body) });
    const result = await client.get("/api/test/image", { responseType: "bytes" });
    assert.equal(result.success, false);
  }
});

test("AbortSignal reaches fetch and independently cancellable GETs do not coalesce", async () => {
  const controller = new AbortController();
  const signals: Array<AbortSignal | null | undefined> = [];
  const client = createOrbitApiClient({ fetchImpl: async (_url, init) => {
    signals.push(init?.signal);
    return response('{"success":true,"data":{}}');
  } });
  await Promise.all([client.get("/api/test/image", { signal: controller.signal }), client.get("/api/test/image", { signal: controller.signal })]);
  assert.deepEqual(signals, [controller.signal, controller.signal]);
});

test("raw transport accepts 10 MiB but rejects over-limit and dual-body requests before fetch", async () => {
  let calls = 0;
  const client = createOrbitApiClient({ fetchImpl: async () => {
    calls++;
    return response('{"success":true,"data":{}}');
  } });
  const valid = await client.put("/api/test/content", { rawBody: new Uint8Array(10485760) });
  assert.equal(valid.success, true);
  for (const [options, expectedCode] of [
    [{ rawBody: new Uint8Array(10485761) }, "ORBIT_APP_BINARY_TOO_LARGE"],
    [{ rawBody: new Uint8Array([1]), body: {} }, "ORBIT_APP_INVALID_BODY"]
  ] as const) {
    const result = await client.put("/api/test/content", options as OrbitApiRequestOptions);
    assert.equal(result.success, false);
    if (result.success) assert.fail();
    assert.equal(result.error.code, expectedCode);
  }
  assert.equal(calls, 1);
});

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

test("Orbit API client coalesces identical concurrent GET requests", async () => {
  let fetchCount = 0;
  let resolveFetch!: (value: Response) => void;
  const deferredResponse = new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  });
  const fetchImpl: FetchLike = async () => {
    fetchCount += 1;
    if (fetchCount > 1) {
      return response(JSON.stringify({ success: true, data: { ok: true } }));
    }
    return await deferredResponse;
  };
  const client = createOrbitApiClient({
    authCookieHeader: "authjs.session-token=session-token",
    baseUrl: "http://localhost:3000",
    fetchImpl
  });

  const first = client.get<{ ok: boolean }>("/api/profile");
  const second = client.get<{ ok: boolean }>("/api/profile");

  assert.equal(fetchCount, 1);
  resolveFetch(response(JSON.stringify({ success: true, data: { ok: true } })));

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);

  await client.get<{ ok: boolean }>("/api/profile");
  assert.equal(fetchCount, 2);
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
  assert.match(result.error.message, /手动录入/u);
  assert.doesNotMatch(result.error.message, /粘贴名片文字/u);
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
