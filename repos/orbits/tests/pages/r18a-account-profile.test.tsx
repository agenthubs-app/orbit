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

test("only the review state shows unaccepted design candidates", () => {
  const store = createAccountDesignFixtureStore();
  const regular = renderToStaticMarkup(createElement(OrbitLanguageProvider, {
    initialLanguage: "ja",
    children: createElement(AccountProfilePage, {
      initialPayload: store.read("actor", "50").data,
      suggestions: ["シリーズA のリード投資家"],
    }),
  }));
  assert.ok(regular.includes("AI の候補"));
  assert.ok(regular.includes("シリーズA のリード投資家"));
  assert.ok(!render(store.read("actor", "25").data).includes("AI の候補"));
});

test("100% design summary shows hosted and upcoming rows from canonical fixture counts", () => {
  const payload = createAccountDesignFixtureStore().read("actor", "100").data;
  const html = renderToStaticMarkup(createElement(OrbitLanguageProvider, {
    initialLanguage: "ja",
    children: createElement(AccountProfilePage, { initialPayload: payload, eventSummary: { hosted: 2, active: 1, attending: 2 } }),
  }));
  assert.ok(html.includes("主催したイベント"));
  assert.ok(html.includes("参加するイベント"));
  assert.ok(html.includes("2件"));
});
