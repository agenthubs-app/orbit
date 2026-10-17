import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { mobileLoginHref } from "../src/view-models/mobile-route-access";
import { renderToHtml } from "./helpers/render";

function privateAccountHtml(auth: { ready: boolean; signedIn: boolean }): string {
  const source = readFileSync("src/components/OrbitRouteAccessBoundary.tsx", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const colors = { bg: "white", accentText: "black" };
  const module = { exports: {} as { withOrbitPrivateRoute: (Screen: React.ComponentType) => React.ComponentType } };
  const div = ({ children }: React.PropsWithChildren) => React.createElement("div", {}, children);
  const requireBoundary = (name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react-native") return { View: div, ActivityIndicator: div, StyleSheet: { create: (styles: unknown) => styles } };
    if (name.endsWith("/OrbitLocaleContext")) return { useOrbitLocale: () => ({ t: (key: string) => key }) };
    if (name.endsWith("/ui/Text")) return { UiText: div };
    if (name.endsWith("/AuthSessionProvider")) return { useOrbitAuthSession: () => auth };
    if (name.endsWith("/tokens")) return { spacing: { md: 12, sm: 8 }, typography: { body: 14 } };
    if (name.endsWith("/theme")) return { useOrbitTheme: () => ({ colors }), createThemedStyles: (factory: (value: unknown) => unknown) => () => ({ colors, styles: factory(colors) }) };
    if (name.endsWith("/mobile-route-access")) return { mobileLoginHref };
    if (name === "expo-router") return { Stack: div, usePathname: () => "/settings/integrations", useGlobalSearchParams: () => ({}), Redirect: ({ href }: { href: string }) => React.createElement("div", { "data-redirect": href }) };
    throw new Error(`Unexpected boundary dependency ${name}`);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: requireBoundary });
  const Protected = module.exports.withOrbitPrivateRoute(() => React.createElement("div", {}, "PRIVATE_ACCOUNT_CONTENT"));
  return renderToHtml(React.createElement(Protected));
}

test("R18a private account surfaces redirect signed-out users without rendering a legacy login card", () => {
  const html = privateAccountHtml({ ready: true, signedIn: false });
  assert.ok(html.includes('data-redirect="/account/login?next=%2Fsettings%2Fintegrations"'), html);
  assert.ok(!html.includes("PRIVATE_ACCOUNT_CONTENT"));
  assert.ok(!html.includes("checkingSignIn"));
});
test("R18a unconfirmed auth never renders protected account content", () => {
  const html = privateAccountHtml({ ready: false, signedIn: false });
  assert.ok(html.includes("shell.checkingSignIn"));
  assert.ok(!html.includes("PRIVATE_ACCOUNT_CONTENT"));
  assert.ok(!html.includes("data-redirect"));
});
test("R18a confirmed private route retains authenticated account content", () => {
  assert.ok(privateAccountHtml({ ready: true, signedIn: true }).includes("PRIVATE_ACCOUNT_CONTENT"));
});
test("every R18a App account entry uses the proven private route boundary", () => {
  for (const route of ["app/(app)/profile.tsx", "app/profile/edit.tsx", "app/profile/preview.tsx", "app/profile/tags.tsx", "app/profile/suggestions.tsx", "app/profile/more.tsx", "app/account/permissions.tsx", "app/settings.tsx", "app/settings/[section].tsx", "app/settings/integrations.tsx", "app/settings/iorbit.tsx", "app/settings/api.tsx"]) {
    assert.match(readFileSync(route, "utf8"), /export default withOrbitPrivateRoute\(/, route);
  }
});
