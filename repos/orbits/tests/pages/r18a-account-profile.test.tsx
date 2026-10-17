import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountProfilePage } from "../../app/(app)/app/orbit-2026/account/AccountProfilePage";
import { createAccountDesignFixtureStore } from "../../features/profile/design-fixtures/service";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

const render = (initialPayload: ReturnType<ReturnType<typeof createAccountDesignFixtureStore>["read"]>["data"]) => renderToStaticMarkup(
  createElement(OrbitLanguageProvider, { initialLanguage: "ja", children: createElement(AccountProfilePage, { initialPayload }) }),
);

test("account profile renders server card states and live-filtered preview", () => {
  const store = createAccountDesignFixtureStore();
  for (const [payload, score] of [[store.read("actor", "25").data, 25], [store.read("actor", "50").data, 50], [store.read("actor", "100").data, 100]] as const) {
    const html = render(payload);
    assert.match(html, new RegExp(`${score}%`));
    assert.ok(html.includes("公開プレビュー"));
    assert.ok(html.includes("/app/events?tab=going"));
    assert.ok(!html.includes("今月の閲覧"));
    assert.ok(!html.includes("ご利用プラン"));
  }
  const hidden = structuredClone(store.read("actor", "100").data);
  if (!hidden.profile) throw new Error("missing test profile");
  hidden.profile.publicFields = { companyRole: false, offeringSeeking: false, intro: false };
  const html = render(hidden);
  assert.ok(!html.includes(hidden.profile.bio ?? "sample-bio"));
});
