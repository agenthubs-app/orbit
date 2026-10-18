import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const runner = resolve(import.meta.dirname, "run-web-gates.mjs");
const keys = ["sample-1440-light", "sample-1440-dark"];

function fixture(mode, suite = "sample") {
  const root = mkdtempSync(join(tmpdir(), "r31b-gates-"));
  const visual = join(root, "scripts/visual");
  const bin = join(root, "bin");
  const out = join(root, "out");
  mkdirSync(join(visual, "views"), { recursive: true });
  mkdirSync(bin);
  mkdirSync(join(out, "stale"), { recursive: true });
  writeFileSync(join(visual, "compare-redesign.mjs"), "");
  writeFileSync(join(visual, `views/${suite}.json`), JSON.stringify({ views: [{ id: "sample", width: 1440, themes: ["light", "dark"], ...(suite === "web-R17" ? { host: { overview: "live" } } : {}) }] }));
  writeFileSync(join(root, "storage.json"), "{}");
  writeFileSync(join(out, "stale/summary.json"), JSON.stringify([{ view: "stale-1440-light", pass: true }]));
  writeFileSync(join(out, "all-summary.json"), JSON.stringify({ "stale-1440-light": { pass: true } }));
  const fakeNode = join(bin, "node");
  writeFileSync(fakeNode, `#!/bin/sh
[ "$1" = "scripts/visual/compare-redesign.mjs" ] || exit 2
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    --only) only="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ "$FAKE_MODE" = fail ] && exit 7
mkdir -p "$out"
first=$(printf '%s' "$only" | cut -d, -f1)
if [ "$FAKE_MODE" = missing ]; then
  printf '[{"view":"%s","pass":true}]' "$first" > "$out/summary.json"
else
  second=$(printf '%s' "$only" | cut -d, -f2)
  printf '[{"view":"%s","pass":true},{"view":"%s","pass":true}]' "$first" "$second" > "$out/summary.json"
fi
[ "$FAKE_MODE" = fail-fresh ] && exit 7
exit 0
`);
  chmodSync(fakeNode, 0o755);
  const result = spawnSync(process.execPath, [runner, "--storage", join(root, "storage.json"), "--out", out, "--suites", suite, "--keys", keys.join(",")], {
    cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_MODE: mode },
  });
  const summary = JSON.parse(readFileSync(join(out, "all-summary.json"), "utf8"));
  rmSync(root, { recursive: true, force: true });
  return { result, summary };
}

test("a failed compare exits nonzero and never reuses an old summary", () => {
  const { result, summary } = fixture("fail");
  assert.notEqual(result.status, 0);
  assert.deepEqual(summary, {});
});

test("a missing expected key exits nonzero and omits stale entries", () => {
  const { result, summary } = fixture("missing");
  assert.notEqual(result.status, 0);
  assert.deepEqual(Object.keys(summary), [keys[0]]);
});

test("a nonzero compare keeps only its fresh diagnostic rows", () => {
  const { result, summary } = fixture("fail-fresh");
  assert.notEqual(result.status, 0);
  assert.deepEqual(Object.keys(summary).sort(), keys.slice().sort());
});

test("a complete fresh compare succeeds without stale entries", () => {
  const { result, summary } = fixture("complete");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(summary).sort(), keys.slice().sort());
});

test("a failed fixture switch exits nonzero without reusing prior results", () => {
  const { result, summary } = fixture("complete", "web-R17");
  assert.notEqual(result.status, 0);
  assert.deepEqual(summary, {});
});
