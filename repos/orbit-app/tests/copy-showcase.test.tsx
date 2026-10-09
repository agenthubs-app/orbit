import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { OrbitLocaleContext } from "../src/i18n/OrbitLocaleContext";
import { standardCopy } from "../src/i18n/standard-copy";
import { CopyShowcaseScreen } from "../src/screens/showcase/CopyShowcaseScreen";
import { renderedText } from "./helpers/render";

// R03: the standard-copy showcase lists every phrase in the screen language
// (for the 320pt / 2× text check of the copy loop).
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
test("the showcase shows every standard phrase in the screen language", () => {
  for (const language of ["ja", "zh", "en"] as const) {
    const value = { language } as React.ContextType<typeof OrbitLocaleContext>;
    const text = decode(renderedText(React.createElement(OrbitLocaleContext.Provider, { value }, React.createElement(CopyShowcaseScreen))));
    for (const entries of Object.values(standardCopy[language])) {
      for (const phrase of Object.values(entries)) assert.ok(text.includes(phrase.replace(/\s+/g, " ").trim()), `${language}: ${phrase}`);
    }
  }
});
