import assert from "node:assert/strict";
import test from "node:test";

import { resolveLegacyDeepLinkHref } from "../src/view-models/legacy-route";

test("known old deep links keep their mapped destination and query", () => {
  assert.equal(resolveLegacyDeepLinkHref("/app/home/cards", {}), "/contacts/list");
  assert.equal(resolveLegacyDeepLinkHref("/app/account/login", { next: "/home" }), "/account/login?next=%2Fhome");
});

test("unknown or malformed deep links reach 404 instead of silently going home", () => {
  assert.equal(resolveLegacyDeepLinkHref("/removed-page", {}), null);
  assert.equal(resolveLegacyDeepLinkHref("/tasks/%2e%2e", {}), null);
});
