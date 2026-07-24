import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "ai", "AiScreen.tsx"),
  "utf8"
);

test("Orbit AI home uses a compact Chinese chat entry", () => {
  assert.doesNotMatch(
    screenSource,
    /Ask first|直接问今天|让 AI 带你过去|已准备好/u
  );
  assert.match(screenSource, />有什么需要处理？</u);
  assert.match(screenSource, />常用入口</u);
  assert.match(screenSource, />提问或直接打开</u);
});

test("Orbit AI home exposes the primary app destinations", () => {
  for (const href of [
    'href: "/events" as Href',
    'href: "/contacts" as Href',
    'href: "/schedule" as Href',
    'href: "/profile" as Href',
    'href: "/dashboard" as Href',
    'href: "/agent" as Href'
  ]) {
    assert.match(
      screenSource,
      new RegExp(href.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
    );
  }
});
