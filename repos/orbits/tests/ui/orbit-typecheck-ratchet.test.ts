/**
 * Ratchet gate: the test suite typechecks.
 *
 * `tsconfig.json` has always covered `tests/**` via its `**\/*.ts` include, but
 * `npm run lint` typechecks a hand-curated list of ~150 production files, so
 * nothing ever compiled the tests. When the project tsconfig was first run
 * across the whole tree it reported 541 errors — every single one inside
 * `tests/`; production code was already clean.
 *
 * Two systemic causes accounted for most of them and are now fixed:
 *
 *   - 97 x TS1354: `readonly Array<T>` is not valid TypeScript (it is only
 *     permitted on array and tuple *literal* types). Rewritten to
 *     `ReadonlyArray<T>`, which is what every one of them meant.
 *   - 334 errors from reading `.data` / `.success` / `.error` straight off a
 *     `MaybePromise<T>` service result. The mocks return synchronously but are
 *     typed like their async live counterparts, so the union has no such
 *     fields. `tests/support/sync-result.ts` asserts the synchronous branch
 *     and narrows it — 71 call sites, which is where those 334 came from.
 *
 * The remaining 110 are a heterogeneous long tail across 42 files (route
 * context shapes, `as` casts, readonly assignment, comparisons that TypeScript
 * can prove are always false). This test does not try to clear them in one
 * shot — it locks in what has been fixed and stops new ones from creeping in.
 * CEILING is a ceiling, not a target; lower it as the tail is worked down.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

/** `path/to/file.ts(12,34): error TS1234: message` */
const ERROR_LINE = /^(\S+?)\((\d+),\d+\): error TS\d+:/;

function typecheckErrors(): string[] {
  let output = "";
  try {
    // --incremental false so the result never depends on a .tsbuildinfo left
    // behind by an editor or a previous run, and so concurrent test files
    // cannot race each other over that cache.
    execFileSync(
      "npx",
      ["tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    // tsc exits non-zero when it reports anything; the diagnostics are stdout.
    output = String((error as { stdout?: string }).stdout ?? "");
  }
  return output.split("\n").filter((line) => ERROR_LINE.test(line));
}

test("the project typechecks with no new errors, and production code stays clean", () => {
  const errors = typecheckErrors();

  const outsideTests = errors.filter((line) => !line.startsWith("tests/"));
  assert.deepEqual(
    outsideTests,
    [],
    `type errors outside tests/ must stay at zero — production code is clean today:\n${outsideTests.join("\n")}`,
  );

  // 541 at the point tests were first compiled; 110 after the two systemic
  // fixes described above.
  const CEILING = 110;

  assert.ok(
    errors.length <= CEILING,
    `expected <= ${CEILING} type errors in tests/, found ${errors.length} ` +
      `(${errors.length - CEILING} over ceiling):\n${errors.slice(0, 40).join("\n")}`,
  );
});

/**
 * Parse failures, not everything in the TS1xxx range — TS1354 (`readonly` on a
 * non-array) and TS1501 (regex flag needs a newer target) are reported by the
 * checker and do not stop it. These are the "… expected" family that means the
 * grammar broke.
 */
const PARSE_FAILURE_CODES = [1002, 1003, 1005, 1009, 1011, 1109, 1128, 1131, 1136, 1160, 1161];

test("no test file has a syntax error", () => {
  // Grammar errors make tsc skip semantic checking for the entire program, so
  // a single stray paren can silently zero out the count above and make this
  // gate report success while checking nothing. This was not hypothetical: a
  // bad codemod left one unbalanced paren and the error count read 2.
  const syntaxErrors = typecheckErrors().filter((line) =>
    PARSE_FAILURE_CODES.some((code) => line.includes(`error TS${code}:`)));

  assert.deepEqual(
    syntaxErrors,
    [],
    `syntax errors suppress all semantic diagnostics — fix these first:\n${syntaxErrors.join("\n")}`,
  );
});
