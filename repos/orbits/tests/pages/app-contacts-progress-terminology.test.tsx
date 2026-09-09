import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { CrmSidebar } from "../../app/(app)/app/contacts/orbit-crm-sidebar";
import { OrbitRealCardsList } from "../../app/(app)/app/contacts/orbit-real-contacts";
import { OrbitRealCardsPipelineView } from "../../app/(app)/app/contacts/orbit-real-cards-pipeline-view";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { createMockAgentLedgerService } from "../../features/agent/ledger/mock-service";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";

let model: OrbitContactsViewModel;
let contactId: string;
let requestLanguage: "zh" | "en" = "zh";
const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
// Server-component request/account boundaries need a request context in Next;
// replace those reads while retaining the actual page and ledger composition.
loader._load = (name, ...args) => {
  if (name.endsWith("/agent-request-context")) return {
    resolveAgentLedgerForServerPage: async () => createMockAgentLedgerService(),
  };
  if (name.endsWith("/orbit-language-server")) return {
    ...originalLoad(name, ...args) as Record<string, unknown>,
    getOrbitServerLanguage: async () => requestLanguage,
  };
  return originalLoad(name, ...args);
};
let AppAllActionsPage: typeof import("../../app/(app)/app/contacts/all-actions/page").default;
try {
  AppAllActionsPage = require("../../app/(app)/app/contacts/all-actions/page").default;
} finally {
  loader._load = originalLoad;
}
test.before(async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Expected local contact fixture");
  model = contactDetailRouteToOrbitContactsViewModel(route);
  contactId = route.contact.id;
});

function progressLinks(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*href="\/app\/contacts\/pipeline"[^>]*>([\s\S]*?)<\/a>/gu)]
    .map((match) => match[1]!.replace(/<[^>]+>/gu, "").trim());
}

for (const [language, label, openLabel] of [
  ["zh", "关系进展", "查看关系进展"],
  ["en", "Relationship progress", "View relationship progress"],
] as const) {
  const render = (child: ReactElement) => renderToStaticMarkup(createElement(
    OrbitLanguageProvider, { initialLanguage: language, children: child },
  ));

  test(`${language} sidebar preserves the pipeline destination under relationship progress`, () => {
    assert.deepEqual(progressLinks(render(createElement(CrmSidebar, { active: "pipeline" }))), [label]);
  });

  test(`${language} list desktop and narrow navigation use the same relationship label`, () => {
    assert.deepEqual(progressLinks(render(createElement(OrbitRealCardsList, { viewModel: model }))), [label, label]);
  });

  test(`${language} actual pipeline presenter uses relationship progress in both headings`, () => {
    const html = render(createElement(OrbitRealCardsPipelineView, { viewModel: model }));
    const headings = [...html.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/gu)].map((match) => match[1]);
    assert.deepEqual(headings, [label, label]);
    assert.deepEqual(progressLinks(html), [`${label}1`], "the sidebar keeps the one-contact count");
  });

  test(`${language} contact next step opens the same relationship progress destination`, () => {
    const links = progressLinks(render(createElement(OrbitRealCardConnection, { contactId, viewModel: model })));
    assert.deepEqual(links, [label, openLabel, openLabel]);
  });

  test(`${language} all-actions page keeps desktop and narrow relationship links aligned`, async () => {
    requestLanguage = language;
    assert.deepEqual(progressLinks(render(await AppAllActionsPage())), [label, label]);
  });
}
