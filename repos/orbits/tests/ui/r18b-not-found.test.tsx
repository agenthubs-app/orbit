import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NotFoundPage } from "../../app/(app)/app/orbit-2026/auth-public/NotFoundPage";

test("public 404 offers only safe public destinations", () => {
  const html = renderToStaticMarkup(<NotFoundPage language="ja" signedIn={false} insideApp={false} />);
  assert.match(html, /このページは見つかりません/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/help"/);
  assert.match(html, /href="\/app\/account\/login"/);
  assert.doesNotMatch(html, /href="\/app\/home"|data-orbit-2026-shell/);
});

test("signed-in app 404 leaves shell chrome to its layout and goes to app home", () => {
  const html = renderToStaticMarkup(<NotFoundPage language="en" signedIn insideApp />);
  assert.match(html, /Page not found/);
  assert.match(html, /href="\/app\/home"/);
  assert.match(html, /href="\/help"/);
  assert.doesNotMatch(html, /href="\/app\/account\/login"|<header/);
});
