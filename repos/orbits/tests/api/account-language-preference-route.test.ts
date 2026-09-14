import assert from "node:assert/strict";
import test from "node:test";

import { createAccountLanguagePreferenceRouteHandlers } from "../../app/api/account/language-preference/handlers";
import {
  ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS,
  type AccountLanguagePreferenceService,
} from "../../features/account-language/contract";

const actorId = "actor:route-language";

function request(method: "GET" | "PUT", body?: unknown) {
  return new Request("https://orbit.example/api/account/language-preference", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("the route requires an authenticated actor before reading or writing", async () => {
  let calls = 0;
  const service: AccountLanguagePreferenceService = {
    async read() { calls += 1; throw new Error("must not run"); },
    async save() { calls += 1; throw new Error("must not run"); },
  };
  const route = createAccountLanguagePreferenceRouteHandlers({
    createService: () => service,
    resolveActor: async () => null,
  });

  assert.equal((await route.GET(request("GET"))).status, 401);
  assert.equal((await route.PUT(request("PUT", {}))).status, 401);
  assert.equal(calls, 0);
});

test("an authenticated request fails visibly when durable storage is unconfigured", async () => {
  const route = createAccountLanguagePreferenceRouteHandlers({
    createService: () => null,
    resolveActor: async () => ({ id: actorId }),
  });

  for (const response of [
    await route.GET(request("GET")),
    await route.PUT(request("PUT", {
      mode: "manual",
      language: "en",
      expectedUpdatedAt: null,
      mutationId: "unconfigured",
    })),
  ]) {
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "SERVICE_UNAVAILABLE");
  }
});

test("GET and PUT expose only the authenticated actor's strict preference contract", async () => {
  const readActors: string[] = [];
  const saves: unknown[] = [];
  const service: AccountLanguagePreferenceService = {
    async read({ actorId: actor }) {
      readActors.push(actor);
      return { success: true, data: { mode: "system", language: null, updatedAt: null } };
    },
    async save(input) {
      saves.push(input);
      return {
        success: true,
        data: {
          mode: "manual",
          language: "ja",
          mutationId: "route-save",
          updatedAt: "2026-09-15T04:50:00.000Z",
        },
      };
    },
  };
  const route = createAccountLanguagePreferenceRouteHandlers({
    createService: () => service,
    resolveActor: async () => ({ id: actorId }),
  });

  const get = await route.GET(request("GET"));
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).data, { mode: "system", language: null, updatedAt: null });
  assert.deepEqual(readActors, [actorId]);

  const body = { mode: "manual", language: "ja", expectedUpdatedAt: null, mutationId: "route-save" };
  const put = await route.PUT(request("PUT", body));
  assert.equal(put.status, 200);
  assert.deepEqual((await put.json()).data, {
    mode: "manual",
    language: "ja",
    mutationId: "route-save",
    updatedAt: "2026-09-15T04:50:00.000Z",
  });
  assert.deepEqual(saves, [{ actorId, input: body }]);
});

test("invalid JSON is validation failure and service conflicts map to HTTP 409", async () => {
  const service: AccountLanguagePreferenceService = {
    async read() {
      return { success: true, data: { mode: "system", language: null, updatedAt: null } };
    },
    async save({ input }) {
      if (Object.keys(input).length === 0) {
        return { success: false, error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_MUTATION_INVALID };
      }
      return { success: false, error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_VERSION_CONFLICT };
    },
  };
  const route = createAccountLanguagePreferenceRouteHandlers({
    createService: () => service,
    resolveActor: async () => ({ id: actorId }),
  });
  const invalid = await route.PUT(new Request("https://orbit.example/api/account/language-preference", {
    method: "PUT",
    body: "{",
  }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");

  const conflict = await route.PUT(request("PUT", {
    mode: "manual",
    language: "en",
    expectedUpdatedAt: null,
    mutationId: "conflict",
  }));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "CONFLICT");
});
