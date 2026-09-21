import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { CrmSidebar } from "../../app/(app)/app/contacts/orbit-crm-sidebar";
import { OrbitRealCardsList } from "../../app/(app)/app/contacts/orbit-real-contacts";
import { OrbitRealCardsPipelineView } from "../../app/(app)/app/contacts/orbit-real-cards-pipeline-view";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { mountOrbitRealCardConnection, relationshipProgressLinkLabels } from "./contact-relationship-initialization-mount-helper";

let model: OrbitContactsViewModel;
let contactId: string;
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

  test(`${language} SSR waits for relationship readback before rendering the legacy next-step card`, () => {
    const links = progressLinks(render(createElement(OrbitRealCardConnection, { contactId, viewModel: model })));
    assert.deepEqual(links, [label]);
    assert.match(render(createElement(OrbitRealCardConnection, { contactId, viewModel: model })), language === "zh" ? /关系状态尚未确认/ : /Relationship state unavailable/);
  });

  test(`${language} mounted legacy readback keeps all three relationship progress links`, async (t) => {
    let reads = 0;
    const root = await mountOrbitRealCardConnection(t, {
      contactId,
      language,
      viewModel: model,
      fetcher: (async (input, init) => {
        reads += 1;
        assert.equal(String(input), `/api/contacts/${encodeURIComponent(contactId)}/relationship-initialization`);
        assert.equal(init?.cache, "no-store");
        assert.equal(init?.credentials, "same-origin");
        assert.equal(init?.method, undefined);
        return new Response(null, { status: 404 });
      }) as typeof fetch,
    });
    assert.equal(reads, 1);
    assert.deepEqual(relationshipProgressLinkLabels(root), [label, openLabel, openLabel]);
  });

}
