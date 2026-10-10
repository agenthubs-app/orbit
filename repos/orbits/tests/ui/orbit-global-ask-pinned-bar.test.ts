import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(process.cwd(), "app", "(app)", "app");
// W0055：旧 v1／v2 名片审阅视图已删除（现行审阅在 card-batch-0918，不钉底栏），只保留悬浮球样式断言。

// Measured on the deployed Preview at 375x812: the floating iOrbit ball is fixed at
// z-index 110 and overlapped the pinned review bar's confirm button by 48x42px —
// elementFromPoint at the button's right edge returned the ball's <circle>, so taps
// there missed the primary action.
// R07: the floating ask ball (orbit-global-ask-styles.ts) was deleted with OrbitGlobalAsk,
// so its `--orbit-pinned-bar-h` offset assertions are obsolete. The fixed control that now
// sits at the bottom of phone screens is the shell's capsule; the same guarantee — it never
// covers the page's own last controls — is pinned on the shell instead.
test("the shell's bottom capsule never covers the page's last controls", () => {
  assert.equal(existsSync(path.join(root, "orbit-global-ask", "orbit-global-ask-styles.ts")), false);
  const shellStyles = readFileSync(path.join(root, "orbit-2026", "shell", "shell.module.css"), "utf8");
  assert.match(shellStyles, /\.bottom \{[^}]*position: fixed;/);
  assert.match(shellStyles, /@media \(max-width: 767px\) \{[\s\S]*?\.bottomScope \{ display: block; \}[\s\S]*?\.content \{ padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  // Legacy pages' own fixed bottom controls are lifted by the shell's inset (R07 review M3; the rendered check is in orbit-2026-shell).
  assert.match(shellStyles, /\.frame \{ --orbit-shell-bottom-inset: 76px; \}/);
});
