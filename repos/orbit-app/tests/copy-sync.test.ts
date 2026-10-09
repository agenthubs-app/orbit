import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import React from "react";

import { OrbitLocaleContext } from "../src/i18n/OrbitLocaleContext";
import { fillCopy, standardCopy, useStandardCopy } from "../src/i18n/standard-copy";
import { renderedText } from "./helpers/render";

// R03 (RD-08, SC-R03-02): the standard wording is copied from orbits/shared/copy by
// `npm run sync:contract`; the copy is never edited by hand. Components read it
// through useStandardCopy(), so changing one line in the source changes both clients.
const appRoot = new URL("..", import.meta.url).pathname;

test("the copy is byte-identical to orbits/shared/copy", () => {
  const copyDir = join(appRoot, "src", "api", "copy");
  assert.deepEqual(readdirSync(copyDir).sort(), ["en.ts", "ja.ts", "zh.ts"]);
  for (const file of ["ja.ts", "zh.ts", "en.ts"]) {
    assert.equal(readFileSync(join(copyDir, file), "utf8"), readFileSync(join(appRoot, "..", "orbits", "shared", "copy", file), "utf8"), `src/api/copy/${file} was edited by hand or is stale`);
  }
});

test("useStandardCopy follows the screen language", () => {
  function Probe() {
    const copy = useStandardCopy();
    return React.createElement("span", null, `${copy.nav.network}|${copy.action.undo}`);
  }
  for (const language of ["ja", "zh", "en"] as const) {
    const value = { language } as React.ContextType<typeof OrbitLocaleContext>;
    const text = renderedText(React.createElement(OrbitLocaleContext.Provider, { value }, React.createElement(Probe)));
    assert.equal(text, `${standardCopy[language].nav.network}|${standardCopy[language].action.undo}`);
  }
  assert.equal(standardCopy.ja.nav.network, "人脈");
  assert.equal(fillCopy(standardCopy.ja.offline.pending, { count: 2 }), "同期待ち 2");
});
