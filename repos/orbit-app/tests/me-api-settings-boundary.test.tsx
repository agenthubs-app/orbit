import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { renderToHtml } from "./helpers/render";

// Evaluate just the real route, replacing its native screen/router/auth boundary.
// No browser or bundle: this checks undefined/false/true compile-time flag states.
function routeHtml(flag: boolean | undefined): string {
  const compiled = ts.transpileModule(readFileSync("app/settings/api.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} as { default: ComponentType } };
  const requireBoundary = (name: string) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith("/ApiSettingsScreen")) return { ApiSettingsScreen: () => createElement("div", {}, "api-settings-form") };
    if (name === "expo-router") return { Redirect: ({ href }: { href: string }) => createElement("div", { "data-redirect": href }) };
    if (name.endsWith("/OrbitRouteAccessBoundary")) return { withOrbitPrivateRoute: (Screen: ComponentType) => () => createElement("section", { "data-private-route": "true" }, createElement(Screen)) };
    throw new Error(`Unexpected route dependency ${name}`);
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireBoundary, ...(flag === undefined ? {} : { __DEV__: flag }) });
  return renderToHtml(createElement(module.exports.default));
}

test("R18a API settings route fails closed outside development and retains private auth boundary", () => {
  for (const flag of [undefined, false]) {
    const html = routeHtml(flag);
    assert.ok(html.includes('data-private-route="true"'));
    assert.ok(html.includes('data-redirect="/settings"'), html);
    assert.ok(!html.includes("api-settings-form"));
  }
  const development = routeHtml(true);
  assert.ok(development.includes('data-private-route="true"'));
  assert.ok(development.includes("api-settings-form"));
  assert.ok(!development.includes("data-redirect"));
});
