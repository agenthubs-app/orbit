import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import { createElement, type ComponentType } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import { legacyTaskRedirect } from "../src/view-models/app-navigation";
import { renderToHtml } from "./helpers/render";

function load(file: string, dependencies: (name: string) => unknown): ComponentType {
  const source = readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} as Record<string, ComponentType> };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: dependencies });
  return file.endsWith("LegacyTaskRedirect.tsx") ? module.exports.LegacyTaskRedirect! : module.exports.default!;
}

function opened(pathname: string, params: Record<string, string> = {}): string {
  const router = {
    Redirect: ({ href }: { href: string }) => createElement("div", { "data-redirect": href }),
    useIsFocused: () => true,
    useLocalSearchParams: () => params,
    usePathname: () => pathname,
    useRouter: () => ({ canGoBack: () => false }),
  };
  const screen = (name: string) => (props: { actorId?: string; noteId?: string }) => createElement("div", {
    "data-memo-screen": name, "data-actor": props.actorId, "data-note": props.noteId, "data-contact": params.contactId,
  });
  const legacy = load("src/components/LegacyTaskRedirect.tsx", (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "expo-router") return router;
    if (name.endsWith("/app-navigation")) return { legacyTaskRedirect };
    if (name.endsWith("/shell-state")) return { rememberScroll() {}, shellScrollKey() { return ""; } };
    if (name.endsWith("/shell-navigation")) return { openMainTab() {} };
    throw new Error(`Unexpected legacy dependency ${name}`);
  });
  const file = pathname === "/notes" ? "app/notes/index.tsx" : pathname === "/notes/new" ? "app/notes/new.tsx"
    : pathname.endsWith("/edit") ? "app/notes/[id]/edit.tsx" : "app/notes/[id].tsx";
  const route = load(file, (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "expo-router") return router;
    if (name.endsWith("/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ ready: true, baseUrl: "http://local.test" }) };
    if (name.endsWith("/AuthSessionProvider")) return { useOrbitAuthSession: () => ({ ready: true, signedIn: true, actorId: "actor:test", cookieHeader: "cookie" }) };
    if (name.endsWith("/LegacyTaskRedirect")) return { LegacyTaskRedirect: legacy };
    if (name.endsWith("/OrbitRouteAccessBoundary")) return { withOrbitPrivateRoute: (Screen: ComponentType) => () => createElement("section", { "data-private-route": "true" }, createElement(Screen)) };
    for (const screenName of ["MemoListScreen", "NewMemoScreen", "MemoDetailScreen", "EditMemoScreen"]) {
      if (name.endsWith(`/memo/${screenName}`)) return { [screenName]: screen(screenName) };
    }
    throw new Error(`Unexpected route dependency ${name}`);
  });
  return renderToHtml(createElement(route));
}

test("legacy Memo URLs render their destination and keep contact and note identity", () => {
  const global = opened("/notes");
  assert.match(global, /data-private-route="true"/u);
  assert.match(global, /data-redirect="\/task\?seg=memo"/u);
  assert.doesNotMatch(global, /data-memo-screen/u);

  const scoped = opened("/notes", { contactId: "contact:one" });
  assert.match(scoped, /data-memo-screen="MemoListScreen"/u);
  assert.match(scoped, /data-contact="contact:one"/u);
  assert.doesNotMatch(scoped, /data-redirect/u);

  for (const [path, name] of [["/notes/new", "NewMemoScreen"], ["/notes/note%3Aone", "MemoDetailScreen"], ["/notes/note%3Aone/edit", "EditMemoScreen"]]) {
    const html = opened(path!, { contactId: "contact:one", id: "note:one" });
    assert.match(html, /data-private-route="true"/u);
    assert.ok(html.includes(`data-memo-screen="${name}"`), html);
    assert.match(html, /data-contact="contact:one"/u);
    if (name !== "NewMemoScreen") assert.match(html, /data-note="note:one"/u);
    assert.doesNotMatch(html, /data-redirect/u);
  }
});
