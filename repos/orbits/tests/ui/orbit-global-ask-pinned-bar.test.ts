import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(process.cwd(), "app", "(app)", "app");
const askStyles = readFileSync(path.join(root, "orbit-global-ask", "orbit-global-ask-styles.ts"), "utf8");
const v1 = readFileSync(path.join(root, "contacts", "new", "batch", "[id]", "business-card-batch-view.tsx"), "utf8");
const v2 = readFileSync(path.join(root, "contacts", "new", "batch2", "[id]", "business-card-ingest-v2-view.tsx"), "utf8");

// Measured on the deployed Preview at 375x812: the floating iOrbit ball is fixed at
// z-index 110 and overlapped the pinned review bar's confirm button by 48x42px —
// elementFromPoint at the button's right edge returned the ball's <circle>, so taps
// there missed the primary action. The ball now lifts by whatever height the page
// declares for its pinned bottom bar.
test("the global ask ball clears any page-declared pinned bottom bar", () => {
  assert.match(askStyles, /bottom: calc\(24px \+ var\(--orbit-pinned-bar-h, 0px\)\);/);
  // The <=640px rule comes later at equal specificity and overrides the base one,
  // so it has to carry the offset too — measured on Preview, editing only the base
  // rule left the ball exactly where it was and still covering the confirm button.
  assert.match(askStyles, /@media \(max-width: 640px\) \{\s*\/\*[\s\S]*?\*\/\s*\.oga-root \.oga-ball \{ right: 14px; bottom: calc\(14px \+ env\(safe-area-inset-bottom\) \+ var\(--orbit-pinned-bar-h, 0px\)\); \}/);
  // Every rule that positions the ball must account for the bar; none may set a
  // bare bottom that would shadow the offset again.
  const bottoms = askStyles.match(/\.oga-ball \{[^}]*bottom:[^;]+;/g) ?? [];
  assert.ok(bottoms.length >= 2);
  for (const rule of bottoms) assert.match(rule, /var\(--orbit-pinned-bar-h, 0px\)/);
});

test("both review views declare the pinned bar height on body so the ball can read it", () => {
  for (const source of [v1, v2]) {
    assert.match(source, /body:has\(\.bc[bi]-actions-review\) \{ --orbit-pinned-bar-h: calc\(54px \+ max\(12px, env\(safe-area-inset-bottom, 0px\)\)\); \}/);
  }
  // A shell-scoped custom property would not reach the globally rendered ball.
  assert.ok(!/--bcb-pinned-bar-h/.test(v1));
  assert.ok(!/--bci-pinned-bar-h/.test(v2));
});
