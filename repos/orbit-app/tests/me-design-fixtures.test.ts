import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { accountDesignFixtures } from "../fixtures/account-design";
import { demoAccountIntegrations, demoAccountMemories, demoAccountSuggestions } from "../../orbits/shared/mock/demo-world/account";
import { integrationState } from "../src/screens/me/settings-api";
import { accountProfilePath } from "../src/screens/me/account-api";
test("R18a App board registrations reach canonical development-only fixture states", () => {
  const suite = JSON.parse(readFileSync("../orbits/scripts/visual/views/app-R18a.json", "utf8"));
  for (const view of suite.views) {
    const design = new URL(view.path, "http://fixture").searchParams.get("design");
    if (!design) continue;
    assert.notEqual(accountProfilePath(design, true), "/api/profile", view.id);
    assert.equal(accountProfilePath(design, false), "/api/profile", view.id);
  }
  const paths = new Map(suite.views.map((view: { id: string; path: string }) => [view.id, view.path]));
  assert.equal(paths.get("A-R18a-08"), "/settings/integrations?design=50");
  assert.equal(paths.get("A-R18a-09"), "/settings/iorbit?design=100");
  assert.equal(paths.get("A-R18a-10"), "/profile/suggestions?design=25");
  assert.equal(paths.get("A-R18a-11"), "/profile/suggestions?design=50");
  assert.equal(paths.get("A-R18a-12"), "/profile/suggestions?design=100");
});
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
test("R18a Metro production folding removes the fixture dependency before graph collection", () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require("@babel/core");
  const { inlinePlugin, constantFoldingPlugin } = require("metro-transform-plugins");
  const source = transpileModule(readFileSync("src/screens/me/useAccountDesign.ts", "utf8"), { compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ESNext } }).outputText;
  const folded = (dev: boolean) => {
    const inlined = transformSync(source, { configFile: false, babelrc: false, plugins: [[inlinePlugin, { dev }]] }).code;
    return transformSync(inlined, { configFile: false, babelrc: false, plugins: [constantFoldingPlugin] }).code;
  };
  assert.doesNotMatch(folded(false), /fixtures\/account-design/);
  assert.match(folded(true), /fixtures\/account-design/);
});
