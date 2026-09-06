/**
 * Compile the complete project, including tests. Runtime tests execute through
 * tsx and do not replace this check. Historical error allowances are now zero.
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
      process.execPath,
      [join(projectRoot, "node_modules/typescript/bin/tsc"), "--noEmit", "--incremental", "false", "-p", "tsconfig.json"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    assert.ok(error && typeof error === "object" && "status" in error && "stdout" in error,
      "TypeScript must start successfully before its diagnostics can be checked");
    assert.equal(error.status, 2, "TypeScript failed for a reason other than type diagnostics");
    assert.equal(typeof error.stdout, "string");
    output = String(error.stdout);
    assert.ok(output.split("\n").some((line) => ERROR_LINE.test(line)),
      `TypeScript failed without file diagnostics:\n${output}`);
  }
  return output.split("\n").filter((line) => ERROR_LINE.test(line));
}

test("the entire project typechecks with zero errors", () => {
  const errors = typecheckErrors();

  const outsideTests = errors.filter((line) => !line.startsWith("tests/"));
  assert.deepEqual(
    outsideTests,
    [],
    `type errors outside tests/ must stay at zero — production code is clean today:\n${outsideTests.join("\n")}`,
  );

  assert.deepEqual(
    errors,
    [],
    `expected zero type errors, found ${errors.length}:\n${errors.join("\n")}`,
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
