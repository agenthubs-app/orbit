import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { Text } from "react-native";

import { createOrbitApiClient } from "../src/api/client";
import { resultToRouteState } from "../src/view-models/route-state";
import { renderedText } from "./helpers/render";

test("API resource failures render localized server error copy", async () => {
  const client = createOrbitApiClient({
    baseUrl: "https://orbit.example",
    fetchImpl: async () => new Response(JSON.stringify({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected request error" }
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    })
  });

  const result = await client.get<unknown>("/api/resource");
  const state = resultToRouteState(result, () => false);

  assert.equal(state.kind, "failure");
  assert.match(
    renderedText(React.createElement(Text, null, state.error.message)),
    /Orbit 服务暂时出了问题，请稍后重试。/u
  );
});
