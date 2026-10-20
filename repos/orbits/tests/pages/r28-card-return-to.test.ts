import assert from "node:assert/strict";
import test from "node:test";

import { appendWebGuideReturnTo, webGuideReturnTo } from "../../features/guide/return-to";

test("card scan and import only carry the Web guide return target", () => {
  assert.equal(webGuideReturnTo("/app/start"), "/app/start");
  for (const value of ["//evil.test", "https://evil.test", "/app/start/other", "/app/home", "/start", "/app/start?step=3", undefined]) assert.equal(webGuideReturnTo(value), null);
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/scan/b1", "/app/start"), "/app/contacts/new/scan/b1?returnTo=%2Fapp%2Fstart");
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/import/b1?step=review", "/app/start"), "/app/contacts/new/import/b1?step=review&returnTo=%2Fapp%2Fstart");
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/scan", "//evil.test"), "/app/contacts/new/scan");
});
