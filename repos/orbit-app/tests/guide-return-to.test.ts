import assert from "node:assert/strict";
import test from "node:test";

import { appGuideReturnTo, appendAppGuideReturnTo } from "../src/view-models/guide-return-to";

test("App card routes accept only /start as a guide return target", () => {
  assert.equal(appGuideReturnTo("/start"), "/start");
  for (const value of ["//evil.test", "https://evil.test", "/app/start", "/home", "/start?step=2", ["/start"], undefined]) assert.equal(appGuideReturnTo(value), null);
  assert.equal(appendAppGuideReturnTo("/contacts/new/scan/b1", "/start"), "/contacts/new/scan/b1?returnTo=%2Fstart");
  assert.equal(appendAppGuideReturnTo("/contacts/new/import/b1?excluded=2", "/start"), "/contacts/new/import/b1?excluded=2&returnTo=%2Fstart");
  assert.equal(appendAppGuideReturnTo("/contacts/new/scan", "//evil.test"), "/contacts/new/scan");
});
