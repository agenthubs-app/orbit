import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { accountDesignFixtures } from "../fixtures/account-design";
import { demoAccountIntegrations, demoAccountMemories, demoAccountSuggestions } from "../../orbits/shared/mock/demo-world/account";
import { integrationState } from "../src/screens/me/settings-api";
test("R18a private App fixture snapshot matches the canonical demo world and has three provider states", () => {
  assert.deepEqual(accountDesignFixtures.integrations, demoAccountIntegrations);
  assert.deepEqual(accountDesignFixtures.memories, demoAccountMemories);
  assert.deepEqual(accountDesignFixtures.suggestions, demoAccountSuggestions);
  assert.equal(integrationState(accountDesignFixtures.integrations.empty[0]), "disconnected");
  assert.equal(integrationState(accountDesignFixtures.integrations.few[0]), "connected");
  assert.equal(integrationState(accountDesignFixtures.integrations.few[1]), "disconnected");
  assert.ok(accountDesignFixtures.integrations.many.every(row => integrationState(row) === "connected"));
});
test("R18a fixture runtime is isolated behind the App development guard", () => {
  const source = readFileSync("src/screens/me/useAccountDesign.ts", "utf8");
  assert.ok(source.indexOf('!__DEV__') < source.indexOf('import("../../../fixtures/account-design")'));
  assert.ok(source.includes('!path.includes("?design=")'));
  for (const file of ["MyPageScreen", "AccountIorbitScreen", "AccountIntegrationsScreen"]) assert.ok(!readFileSync(`src/screens/me/${file}.tsx`, "utf8").includes('from "./design-fixtures"'));
});
