import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as primitives from "../../shared/ui/primitives";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function relativeLuminance(hexColor) {
  const [red, green, blue] = hexColor
    .replace("#", "")
    .match(/.{2}/g)
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;

      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(firstColor, secondColor) {
  const [lighter, darker] = [
    relativeLuminance(firstColor),
    relativeLuminance(secondColor),
  ].sort((first, second) => second - first);

  return (lighter + 0.05) / (darker + 0.05);
}

function collectSurfaceDepths(html) {
  const matches = html.matchAll(/<\/?section\b[^>]*workbench-surface[^>]*>/g);
  const depths = [];
  let depth = 0;

  for (const match of matches) {
    if (match[0].startsWith("</")) {
      depth -= 1;
    } else {
      depth += 1;
      depths.push(depth);
    }
  }

  return depths;
}

test("theme exports Sprint 70 semantic visual tokens", async () => {
  const { color, radius, shadows, spacing, theme, typography } = await import(
    "../../shared/ui/theme"
  );

  assert.equal(theme.color, color);
  assert.equal(theme.typography, typography);
  assert.equal(theme.spacing, spacing);
  assert.equal(theme.radius, radius);
  assert.equal(theme.shadows, shadows);

  const requiredColorTokens = [
    "canvas",
    "surface",
    "surfaceRaised",
    "text",
    "mutedText",
    "border",
    "primaryAction",
    "primaryActionHover",
    "primaryActionText",
    "evidence",
    "confirmation",
    "privacy",
    "warning",
    "success",
  ];

  for (const tokenName of requiredColorTokens) {
    assert.match(
      color[tokenName],
      /^#[0-9a-f]{6}$/i,
      `${tokenName} should be a named hex token`,
    );
  }

  assert.equal(typography.letterSpacing, "0");
  assert.equal(radius.card, "8px");
  assert.equal(radius.panel, "8px");
  assert.equal(spacing.controlMinHeight, "40px");
  assert.ok(
    contrastRatio(color.text, color.canvas) >= 7,
    "body text must have strong contrast on the canvas",
  );
  assert.ok(
    contrastRatio(color.mutedText, color.surface) >= 4.5,
    "muted text must remain readable on panels",
  );
  assert.ok(
    contrastRatio(color.primaryAction, color.primaryActionText) >= 4.5,
    "primary action text must meet WCAG AA contrast",
  );
  assert.ok(
    contrastRatio(color.warning, color.surface) >= 3,
    "warning token must remain visible on panels",
  );
  assert.ok(
    contrastRatio(color.success, color.surface) >= 3,
    "success token must remain visible on panels",
  );
});

test("global CSS mirrors tokens and forbids loose generated styling", () => {
  const css = readProjectFile("app/globals.css");

  for (const variableName of [
    "--orbit-canvas",
    "--orbit-surface",
    "--orbit-surface-raised",
    "--orbit-text",
    "--orbit-muted-text",
    "--orbit-border",
    "--orbit-primary-action",
    "--orbit-primary-action-hover",
    "--orbit-primary-action-text",
    "--orbit-evidence",
    "--orbit-confirmation",
    "--orbit-privacy",
    "--orbit-warning",
    "--orbit-success",
  ]) {
    assert.match(css, new RegExp(`${variableName}:\\s*#[0-9a-f]{6}`, "i"));
  }

  assert.match(css, /letter-spacing:\s*0\b/);
  assert.doesNotMatch(css, /\b[0-9.]+vw\b/i);
  assert.doesNotMatch(css, /clamp\(/i);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|bokeh|decorative-orb|gradient-orb/i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\s*,\s*#[0-9a-f]{3,6}/i);
});

test("global CSS defines compact product primitives and layout guardrails", () => {
  const css = readProjectFile("app/globals.css");

  for (const className of [
    "workbench-frame",
    "workbench-surface",
    "orbit-chip",
    "control-field",
    "primary-action",
    "secondary-action",
    "token-swatch",
    "inline-metric",
    "status-display",
    "dense-grid",
  ]) {
    assert.match(css, new RegExp(`\\.${className}\\b`));
  }

  assert.match(css, /details\b/);
  assert.match(css, /summary\b/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*var\(--orbit-control-min-height\)/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/);
  assert.match(css, /\.primary-action:disabled,\s*\.secondary-action:disabled/);
  assert.match(css, /border-style:\s*dashed/);
  assert.doesNotMatch(css, /border-radius:\s*(?:9|[1-9][0-9])px/);
});

test("product primitives expose reusable frame, surface, chips, controls, swatches, and metrics", () => {
  for (const exportName of [
    "ProductFrame",
    "ProductSurface",
    "Chip",
    "Field",
    "PrimaryAction",
    "SecondaryAction",
    "TokenSwatch",
    "InlineMetric",
    "StatusDisplay",
  ]) {
    assert.equal(typeof primitives[exportName], "function", `${exportName} export`);
  }

  const html = renderToStaticMarkup(
    React.createElement(
      primitives.ProductFrame,
      null,
      React.createElement(
        primitives.ProductSurface,
        { elevated: true, eyebrow: "Relationship context", title: "Source-backed intro" },
        React.createElement(primitives.InlineMetric, {
          label: "Evidence",
          value: "2 sources",
          tone: "evidence",
        }),
        React.createElement(primitives.StatusDisplay, {
          label: "Confirmation guard",
          tone: "warning",
          value: "Paused before send",
        }),
        React.createElement(
          "div",
          { className: "chip-row" },
          React.createElement(primitives.Chip, { tone: "unknown" }, "Unknown tone"),
          React.createElement(primitives.Chip, { tone: "success" }, "Ready"),
          React.createElement(primitives.Chip, { tone: "warning" }, "Review"),
        ),
        React.createElement(
          primitives.Field,
          { label: "Relationship source", helper: "Source required" },
          React.createElement("input", { defaultValue: "Orbit Summit" }),
        ),
        React.createElement(primitives.PrimaryAction, null, "Confirm next step"),
        React.createElement(primitives.SecondaryAction, null, "Keep as draft"),
        React.createElement(primitives.TokenSwatch, {
          name: "Primary action",
          tone: "primary",
          value: "#155e75",
        }),
      ),
    ),
  );

  assert.match(html, /workbench-frame/);
  assert.match(html, /workbench-surface/);
  assert.match(html, /inline-metric/);
  assert.match(html, /status-display/);
  assert.match(html, /orbit-chip-neutral/);
  assert.match(html, /orbit-chip-success/);
  assert.match(html, /orbit-chip-warning/);
  assert.doesNotMatch(html, /orbit-chip-unknown/);
  assert.doesNotMatch(html, /\sstyle="/);
  assert.deepEqual(collectSurfaceDepths(html), [1]);
});

test("style foundation route is a representative product specimen", () => {
  const source = readProjectFile("app/dev/foundation/style/page.tsx");

  for (const expectedContent of [
    "Relationship context",
    "Source evidence",
    "Confirmation guard",
    "Privacy boundary",
    "Token palette",
    "Control states",
    "Action states",
    "Ari Kato",
    "Orbit Summit Roundtable",
    "Confirm next step",
    "Paused before send",
    "External send gated",
    "Locked until confirmed",
    "Send externally locked",
    "No external message leaves the workspace",
    "375px",
  ]) {
    assert.match(source, new RegExp(expectedContent));
  }

  assert.match(source, /ProductFrame/);
  assert.match(source, /ProductSurface/);
  assert.match(source, /InlineMetric/);
  assert.match(source, /StatusDisplay/);
  assert.match(source, /TokenSwatch/);
  assert.match(source, /details/);
  assert.doesNotMatch(source, /style=/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|readFileSync|node:fs|node:path/);
  assert.doesNotMatch(source, /Gray and white workbench|purple primary action|Dev foundation/);
});
