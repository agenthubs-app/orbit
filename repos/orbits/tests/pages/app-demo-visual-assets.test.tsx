import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OrbitStarfieldHome } from "../../app/(app)/app/orbit-starfield-home";

async function renderRootLanding(): Promise<string> {
  return renderToStaticMarkup(<OrbitStarfieldHome authenticated={false} />);
}

test("root landing renders the local desktop and mobile starfield without remote images", async () => {
  const html = await renderRootLanding();

  assert.match(html, /data-orbit-real-page="starfield-home"/);
  assert.match(html, /class="sk-home-desktop"/);
  assert.match(html, /class="sk-home-mobile"/);
  assert.match(html, /<canvas/);
  assert.doesNotMatch(html, /src="https?:\/\//);
});
