import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StateView } from "../../shared/ui/state-view";
import { Chip, WorkbenchSurface } from "../../shared/ui/primitives";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("state view renders typed recovery links and actions as named controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(StateView as React.ComponentType<Record<string, unknown>>, {
      description: "Relationship work is waiting for source context.",
      eyebrow: "Checking sources",
      evidence: ["source:event:demo"],
      recoveryActions: [
        {
          id: "add-source",
          href: "/app/contacts/new",
          label: "Add a relationship source",
          recoveryCopy: "Add a relationship source to start from reviewed context.",
        },
        {
          id: "check-again",
          label: "Check workspace again",
          recoveryCopy: "Check workspace again after source review finishes.",
        },
      ],
      title: "Relationship review is waiting",
    }),
  );

  assert.match(html, /aria-label="Recovery actions"/);
  assert.match(html, /<summary>来源详情 \/ Source details<\/summary>/);
  assert.doesNotMatch(html, /<summary>Inspect source details<\/summary>/);
  assert.match(
    html,
    /<a[^>]*aria-label="Add a relationship source"[^>]*href="\/app\/contacts\/new"[^>]*>Add a relationship source<\/a>/,
  );
  assert.match(
    html,
    /<button[^>]*aria-label="Check workspace again"[^>]*type="button"[^>]*>Check workspace again<\/button>/,
  );
  assert.match(html, /Add a relationship source to start from reviewed context\./);
  assert.match(html, /Check workspace again after source review finishes\./);
  assert.doesNotMatch(html, /What to do next:/);
});

test("state view filters unnamed recovery controls instead of rendering empty links", () => {
  const html = renderToStaticMarkup(
    React.createElement(StateView as React.ComponentType<Record<string, unknown>>, {
      description: "Relationship work is waiting for source context.",
      eyebrow: "Checking sources",
      recoveryActions: [
        {
          id: "blank-link",
          href: "/app/contacts/new",
          label: " ",
          recoveryCopy: "This blank label must not render.",
        },
        {
          id: "visible-link",
          href: "/app",
          label: "Return to relationship cockpit",
          recoveryCopy: "Return to relationship cockpit when source review is done.",
        },
      ],
      title: "Relationship review is waiting",
    }),
  );

  assert.doesNotMatch(html, />\s*<\/a>/);
  assert.doesNotMatch(html, /This blank label must not render/);
  assert.match(html, /aria-label="Return to relationship cockpit"/);
});

test("state view binds recovery copy to each visible recovery control", () => {
  const html = renderToStaticMarkup(
    React.createElement(StateView as React.ComponentType<Record<string, unknown>>, {
      description: "Relationship work is waiting for source context.",
      eyebrow: "Checking sources",
      recoveryActions: [
        {
          id: "add source",
          href: "/app/contacts/new",
          label: "Add a relationship source",
          recoveryCopy: "Add a relationship source to start from reviewed context.",
        },
        {
          id: "check-again",
          label: "Check workspace again",
          recoveryCopy: "Check workspace again after source review finishes.",
        },
      ],
      title: "Relationship review is waiting",
    }),
  );

  assert.match(
    html,
    /aria-label="Add a relationship source"[^>]*aria-describedby="state-recovery-copy-add-source-0"[^>]*>Add a relationship source<\/a>/,
  );
  assert.match(
    html,
    /id="state-recovery-copy-add-source-0">Add a relationship source to start from reviewed context\.<\/p>/,
  );
  assert.match(
    html,
    /aria-label="Check workspace again"[^>]*aria-describedby="state-recovery-copy-check-again-1"[^>]*>Check workspace again<\/button>/,
  );
  assert.match(
    html,
    /id="state-recovery-copy-check-again-1">Check workspace again after source review finishes\.<\/p>/,
  );
});

test("state view recovery controls have wrapping styles for long visible labels", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "shared/ui/state-view.tsx"),
    "utf8",
  );

  assert.match(source, /state-recovery-actions/);
  assert.match(source, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*180px\),\s*1fr\)\)/);
  assert.match(source, /overflow-wrap:\s*anywhere/);
  assert.match(source, /white-space:\s*normal/);
  assert.match(source, /min-width:\s*0/);
});

test("state view and primitives ship their own styling instead of relying on globals.css", () => {
  // Product routes (app/(app)/app/**) never load app/globals.css — every rule
  // in that file is scoped under `.orbit-dev-root`. StateView renders as the
  // route-state boundary on ~20 of those routes, so it (and the primitives it
  // wraps: WorkbenchSurface, Chip) must carry their own <style> text for every
  // class they render, instead of depending on globals.css or --orbit-* vars.
  const stateViewSource = fs.readFileSync(
    path.join(projectRoot, "shared/ui/state-view.tsx"),
    "utf8",
  );
  const primitivesSource = fs.readFileSync(
    path.join(projectRoot, "shared/ui/primitives.tsx"),
    "utf8",
  );

  for (const selector of [
    ".action-guard",
    ".guard-list",
    ".chip-row",
    ".privacy-note",
    ".type-body",
  ]) {
    assert.match(
      stateViewSource,
      new RegExp(`\\${selector}\\s*\\{`),
      `state-view.tsx must ship its own "${selector}" rule`,
    );
  }

  for (const selector of [".workbench-surface", ".surface-heading", ".orbit-chip"]) {
    assert.match(
      primitivesSource,
      new RegExp(`\\${selector}\\s*\\{`),
      `primitives.tsx must ship its own "${selector}" rule`,
    );
  }

  // Neither file should depend on the dev-workbench --orbit-* token scope or
  // import the dev-only stylesheet — that scope is absent on product routes.
  assert.doesNotMatch(stateViewSource, /var\(--orbit-/);
  assert.doesNotMatch(primitivesSource, /var\(--orbit-/);
  assert.doesNotMatch(stateViewSource, /(?:import|from)\s+["'][^"']*globals\.css["']/);
  assert.doesNotMatch(primitivesSource, /(?:import|from)\s+["'][^"']*globals\.css["']/);
});

test("WorkbenchSurface and Chip render their own <style> tag so product routes stay styled", () => {
  const surfaceHtml = renderToStaticMarkup(
    React.createElement(
      WorkbenchSurface as React.ComponentType<Record<string, unknown>>,
      { eyebrow: "Eyebrow", title: "Title" },
      React.createElement("p", null, "Body"),
    ),
  );
  assert.match(surfaceHtml, /<style>[\s\S]*\.workbench-surface[\s\S]*<\/style>/);

  const chipHtml = renderToStaticMarkup(
    React.createElement(
      Chip as React.ComponentType<Record<string, unknown>>,
      { tone: "evidence" },
      "source:demo",
    ),
  );
  assert.match(chipHtml, /<style>[\s\S]*\.orbit-chip[\s\S]*<\/style>/);
});
