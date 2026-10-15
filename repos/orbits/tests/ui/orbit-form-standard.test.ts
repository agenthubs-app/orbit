/**
 * Gate test for T7 (audit P1-6): form field unification onto the FormField
 * primitive (orbit-reference-primitives.tsx).
 *
 * R27（2026-10-15）：旧活动详情 / 报名 / 现场屏删除后，(a)(c)(d) 三条的主语
 * （events/[id]/orbit-post-event-followup-capture.tsx 这个唯一的 FormField
 * 外部采用者，以及豁免的 events/[id]/register/event-registration-workspace.tsx）
 * 都已不存在，三条随文件移除。FormField 目前在 app/(app)/app 下没有生产采用者。
 *
 * (b) Sitewide `role="alert"` markers must not go down: T7 keeps every
 *     existing announcement (FormField renders its own dynamically) while
 *     standardizing error semantics — it should never remove one.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const APP_DIR = join(projectRoot, "app/(app)/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// ---- (b) role="alert" must not regress sitewide ----

// Strip `//` line comments and `/* */` block comments before counting, so a
// source comment that merely *mentions* `role="alert"` (documenting why a
// marker exists, e.g. the exemption note on the registration workspace)
// cannot inflate the count. This is a plain-text heuristic, not a real
// JS/TS tokenizer — it doesn't account for `//`/`/*` appearing inside a
// string literal, which doesn't occur in this codebase's usage today.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// Baseline captured after T7's migration (register/account-auth/admin onto
// FormField + the event-registration-workspace aria-invalid alignment).
// FormField itself sets role="alert" dynamically (`role={error ? "alert" :
// undefined}`), so this literal-string count intentionally only tracks the
// hand-rolled markers that existed before T7 — it must never go down.
// 7 is the true code-level count (comments stripped) across
// account/mobile-google, account-auth, agent/actions/all-actions-controls,
// events/[id]/register/event-registration-workspace (2 real banners),
// profile, and today/orbit-today-decision-form. The raw (unstripped) count
// was 8: event-registration-workspace also has a `//` comment that
// documents the alignment by *naming* `role="alert"`, which isn't a marker
// and must not count. (2026-09-22: account-auth's marker now lives in
// account/auth-0918/auth-form.tsx `AuthErrorCard`; the count is unchanged.)
const ROLE_ALERT_BASELINE = 7;

test('role="alert" count in app/(app)/app does not decrease', () => {
  const count = walk(APP_DIR)
    .map((full) => stripComments(readFileSync(full, "utf8")))
    .reduce((total, text) => total + (text.match(/role="alert"/g) ?? []).length, 0);

  assert.ok(
    count >= ROLE_ALERT_BASELINE,
    `expected role="alert" count >= ${ROLE_ALERT_BASELINE}, found ${count}`,
  );
});
