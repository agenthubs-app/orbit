import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import React from "react";

import { COMPONENT_SECTIONS, findComponentSection, SECTION_TOP } from "../src/screens/showcase/component-sections";
import { ComponentSectionScreen } from "../src/screens/showcase/ComponentSectionScreen";
import { renderedText, renderToHtml } from "./helpers/render";

// R31a 逐件对照：展示页按 01-system 规格格重排，一个规格格一个小节路由 /showcase/components/<id>；
// 门禁清单 repos/orbits/scripts/visual/views/app-R31a-components.json 与小节一一对应（迁移自 R04 的整页展示页）。
const repoRoot = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(repoRoot, "../orbits/scripts/visual/views/app-R31a-components.json"), "utf8")) as {
  views: { id: string; design: string; section: string; cell: number; path: string; region: string; placement: string }[];
  _excluded: Record<string, string>;
};

test("every section is one 01-system spec cell, named <sec2 id>-<cell>", () => {
  const ids = COMPONENT_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length, "section ids are unique");
  for (const section of COMPONENT_SECTIONS) {
    assert.match(section.id, /^[cn]-[a-z]+-\d+$/u);
    assert.ok(section.width > 0 && section.width <= 390, `${section.id}: a phone-width cell`);
    assert.equal(findComponentSection(section.id), section);
  }
  assert.equal(findComponentSection("nope-0"), null);
});

test("the gate manifest lists every section once (or says why not), at the section's route and rect", () => {
  const excluded = Object.keys(manifest._excluded).flatMap((key) => key.split(",").map((id) => id.trim()));
  for (const section of COMPONENT_SECTIONS) {
    const views = manifest.views.filter((view) => view.path.startsWith(`/showcase/components/${section.id}?`));
    if (excluded.includes(section.id)) { assert.equal(views.length, 0, `${section.id} is both excluded and gated`); continue; }
    assert.equal(views.length, 1, `${section.id} needs one manifest entry`);
    const [view] = views;
    assert.equal(view!.design, "01-system.html");
    assert.equal(`${view!.section}-${view!.cell}`, section.id);
    assert.equal(view!.path, `/showcase/components/${section.id}?theme={theme}`);
    assert.equal(view!.placement, section.placement);
    const [xs, ys, ws, hs] = view!.region.split(",");
    const [w, h] = [Number(ws), Number(hs)];
    // overlay: x = c (centred), y = c / b (centred / bottom), resolved per device by the gate.
    const x = xs === "c" ? Math.round((390 - w) / 2) : Number(xs);
    const y = ys === "c" ? Math.round((844 - h) / 2) : ys === "b" ? 844 - h : Number(ys);
    assert.ok([x, y, w, h].every((n) => Number.isInteger(n)), `${section.id}: integer rect`);
    // overlays: c (centred) or the measured 16e point when the design cell does not centre them (RD-33).
    if (section.placement === "inline") {
      assert.deepEqual([x, y], [0, SECTION_TOP], `${section.id}: inline sections draw at (0, SECTION_TOP)`);
      assert.ok(Math.abs(w - section.width) <= 1, `${section.id}: rect width ${w} = cell width ${section.width}`);
    }
    assert.ok(x >= 0 && x + w <= 390 && y + h <= 844, `${section.id}: rect inside the 390×844 screen`);
  }
  for (const view of manifest.views) assert.ok(findComponentSection(`${view.section}-${view.cell}`), `${view.id}: no showcase section`);
});

test("each section page renders its cell; an unknown id says so", () => {
  for (const section of COMPONENT_SECTIONS.filter((s) => s.placement === "inline")) {
    assert.ok(renderToHtml(<ComponentSectionScreen id={section.id} theme="light" />).includes(`component-section-${section.id}`), `${section.id} renders`);
  }
  assert.ok(renderedText(<ComponentSectionScreen id="c-ai-0" />).includes("プランに追加しますか？"));
  assert.ok(renderedText(<ComponentSectionScreen id="c-chip-0" theme="dark" />).includes("期限超過"));
  assert.ok(renderedText(<ComponentSectionScreen id="nope-0" />).includes("unknown section: nope-0"));
});

test("the showcase page lists the spec cells first, in 01-system order, then the demos without a cell", () => {
  // The page itself also mounts business sheets whose native imports do not load under node --test, so its
  // structure is checked in the source; the sections it maps are the ones rendered above.
  const order = ["c-toast", "c-confirm", "c-layer", "c-ai", "c-why", "c-perm", "c-load", "c-err", "c-sample", "c-chip", "c-pay", "c-push", "c-kbd", "c-text", "c-ctl", "n-nav", "n-home", "n-task", "n-io", "n-add"];
  const rank = (id: string) => order.indexOf(id.replace(/-\d+$/u, "")) * 100 + Number(id.match(/\d+$/u)![0]);
  const ranks = COMPONENT_SECTIONS.map((section) => rank(section.id));
  assert.ok(ranks.every((r) => r >= 0), "every section belongs to a 01-system part-2 section");
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y), "sections follow 01-system order");
  const source = readFileSync(join(repoRoot, "src/screens/showcase/ComponentShowcaseScreen.tsx"), "utf8");
  const cells = source.indexOf("COMPONENT_SECTIONS.map(");
  const rest = source.indexOf(">no spec cell · interactive demos · business sheets<");
  assert.ok(cells > 0 && rest > cells && source.indexOf('<Section name="button">') > rest, "spec cells first, then the demos without a cell");
  for (const demo of ["button", "feedback", "add contact sheet", "invite share sheet", "controls", "states"]) assert.ok(source.includes(`<Section name="${demo}">`), `${demo} kept`);
});
