import assert from "node:assert/strict";

/**
 * Unwraps a service result that is typed as possibly-async but is produced
 * synchronously.
 *
 * The mock services mirror their live counterparts' signatures, so they are
 * typed `MaybePromise<T>` (`T | Promise<T>`) even though every mock returns
 * `T` directly — several of these contract tests exist precisely to lock that
 * synchronous behaviour in. Reading `.data` / `.success` straight off the
 * union does not typecheck, because the `Promise<T>` branch has no such
 * fields, which is where the bulk of the test suite's type errors came from.
 *
 * This asserts the synchronous branch (so a mock that quietly becomes async
 * fails loudly rather than silently comparing a Promise against a value) and
 * narrows the union for the assertions that follow.
 */
export function syncResult<TValue>(value: TValue | Promise<TValue>): TValue {
  assert.ok(
    !(value instanceof Promise),
    "expected a synchronous mock result, received a Promise",
  );
  return value as TValue;
}
