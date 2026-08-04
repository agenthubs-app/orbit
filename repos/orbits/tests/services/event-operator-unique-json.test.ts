import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonWithUniqueObjectKeys, UniqueJsonParseError } from "../../features/events/registration/operator-json";

test("operator JSON parser matches native JSON values without prototype mutation", () => {
  const source = '{"array":[null,true,false,-12.34e+2,"\\u65e5\\u672c"],"nested":{"__proto__":{"polluted":true},"constructor":"data"}}';
  const parsed = parseJsonWithUniqueObjectKeys(source) as Record<string, unknown>;
  assert.deepEqual(parsed, JSON.parse(source));
  const nested = parsed.nested as Record<string, unknown>;
  assert.equal(Object.hasOwn(nested, "__proto__"), true);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("operator JSON parser rejects decoded duplicate keys at any depth", () => {
  for (const source of [
    '{"events":{},"events":{}}',
    '{"events":{"one":{"key":1,"key":2}}}',
    '{"events":{"one":1,"\\u006fne":2}}',
    '[{"one":1,"one":2}]',
  ]) {
    assert.throws(() => parseJsonWithUniqueObjectKeys(source), UniqueJsonParseError);
  }
});

test("operator JSON parser is total for malformed and non-string input", () => {
  for (const value of [
    undefined, null, 1, Symbol("secret"), "", "{", "[1,]", '{"a":1,}',
    '{"a":01}', '{"a":true false}', '"unterminated', '"control\u0001"',
  ]) {
    assert.throws(
      () => parseJsonWithUniqueObjectKeys(value),
      (error: unknown) => error instanceof UniqueJsonParseError && !error.message.includes("secret"),
    );
  }
});
