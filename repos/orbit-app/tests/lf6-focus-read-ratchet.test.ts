import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

// LF6: the redesign's worst local-first regression was screens re-reading the server every time they gained focus
// (Home's ~10 GETs per focus). A tab switch re-mounts tab pages, so a read in a focus effect runs on every visit.
// New focus-effect reads must read the device mirror or a page copy with a fresh window instead; the files below are
// the reviewed exceptions, and the list can only shrink.
const ALLOWED: Readonly<Record<string, string>> = {
  "src/screens/guide/StartGuideScreen.tsx": "onboarding only (a new account, a few visits)",
  "src/screens/profile/onboarding/ProfileOnboardingScreen.tsx": "onboarding only",
  "src/screens/home/use-home-layout.ts": "skips the read inside HOME_COPY_FRESH_MS (LF1)",
  "src/screens/home/use-home-widget-snapshot.ts": "throttled to WIDGET_REFRESH_INTERVAL_MS (LF1), WidgetKit builds only",
};

const root = join(import.meta.dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out); else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** Files whose useFocusEffect(useCallback(…)) body starts asynchronous work (a request, a promise chain). */
export function focusEffectReaders(sourceRoot: string): string[] {
  const hits = new Set<string>();
  for (const file of walk(join(sourceRoot, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/useFocusEffect\(\s*(?:React\.)?useCallback\(/g)) {
      const end = text.indexOf("}, [", match.index);
      const body = text.slice(match.index, end > 0 ? end : match.index + 3000);
      if (/\.then\(|\bawait\b|\bvoid [a-zA-Z_.]+\(/.test(body)) hits.add(relative(sourceRoot, file));
    }
  }
  return [...hits].sort();
}

test("LF6: no new screen re-reads the server on every focus", () => {
  const found = focusEffectReaders(root);
  assert.deepEqual(found.filter((file) => !(file in ALLOWED)), [], "read the device mirror or a page copy with freshForMs instead");
});

test("LF6: the allow list only shrinks (a fixed entry is removed)", () => {
  const found = new Set(focusEffectReaders(root));
  assert.deepEqual(Object.keys(ALLOWED).filter((file) => !found.has(file)), []);
});
