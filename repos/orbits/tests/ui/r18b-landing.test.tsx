import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LandingPage } from "../../app/(app)/app/orbit-2026/auth-public/LandingPage";

test("public landing offers real auth and help routes with the two-goal limit", () => {
  const html = renderToStaticMarkup(<LandingPage googleEnabled={false} />);
  assert.match(html, /href="\/app\/account\/login"/u);
  assert.match(html, /href="\/app\/account\/signup"/u);
  assert.match(html, /href="\/help"/u);
  assert.match(html, /最多2个目标/u);
  assert.doesNotMatch(html, /Google.*继续/u);
  assert.doesNotMatch(html, /自动发送/u);
});
