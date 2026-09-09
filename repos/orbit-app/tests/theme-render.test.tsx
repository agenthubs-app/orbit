import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Appearance } from "react-native";

import { AppErrorScreen } from "../src/components/AppErrorBoundary";
import { AnalysisPieOrbitChart } from "../src/components/AnalysisPieOrbitChart";
import { DataCard } from "../src/components/DataCard";
import { EmptyState } from "../src/components/EmptyState";
import { LoadingState } from "../src/components/LoadingState";
import { colors, darkColors } from "../src/design/tokens";
import { renderToHtml } from "./helpers/render";

// Exercise the real RN components and their emitted CSS. Only the OS appearance
// read is replaced; the theme hook, style factory and components stay real.
const webStyleSheet = require("react-native-web").StyleSheet as {
  getSheet(): { textContent: string };
};

function styledNodes(html: string) {
  const css = webStyleSheet.getSheet().textContent;
  return [...html.matchAll(/<([a-z][\w-]*)(\s[^>]*?)?>/gu)].map((match) => {
    const attributes = match[2] ?? "";
    const classes = attributes.match(/class="([^"]*)"/u)?.[1].split(" ") ?? [];
    const declarations = classes.map((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return css.match(new RegExp(`\\.${escaped}\\{([^}]*)\\}`, "u"))?.[1] ?? "";
    });
    declarations.push(attributes.match(/style="([^"]*)"/u)?.[1] ?? "");
    const style = Object.fromEntries(declarations.flatMap((value) =>
      value.split(";").filter(Boolean).map((entry) => {
        const colon = entry.indexOf(":");
        return [entry.slice(0, colon), entry.slice(colon + 1)];
      })
    ));
    return { attributes, style };
  });
}

function luminance(color: string): number {
  assert.ok(color, "the rendered node must define a color");
  const components = color.startsWith("#")
    ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
    : (color.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number);
  assert.equal(components.length, 3, `unsupported rendered color: ${color}`);
  const [red, green, blue] = components.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function semanticHtml(html: string) {
  return html.replace(/ (?:class|style)="[^"]*"/gu, "");
}

test("cards follow the system appearance without changing their content or action", (t) => {
  let scheme: "light" | "dark" = "light";
  t.mock.method(Appearance, "getColorScheme", () => scheme);
  const card = <DataCard detail="40 条提醒" onPress={() => undefined} title="关系收件箱" />;
  const light = renderToHtml(card);
  const lightSurface = styledNodes(light).find((node) =>
    node.style["background-color"] && !node.style["background-color"].endsWith(",0.00)")
  );
  assert.ok(lightSurface);
  assert.ok(luminance(lightSurface.style["background-color"]) > 0.8);

  scheme = "dark";
  const dark = renderToHtml(card);
  const darkNodes = styledNodes(dark);
  const darkSurface = darkNodes.find((node) =>
    node.style["background-color"] && !node.style["background-color"].endsWith(",0.00)")
  );
  assert.ok(darkSurface);
  assert.ok(luminance(darkSurface.style["background-color"]) < 0.08,
    "dark appearance must not leave the existing card white");
  for (const node of darkNodes.filter((node) => node.style.color)) {
    assert.ok(contrast(node.style.color, darkSurface.style["background-color"]) >= 4.5,
      "card title and detail must remain readable on the dark surface");
  }
  assert.equal(semanticHtml(dark), semanticHtml(light));
  assert.equal((dark.match(/role="button"/gu) ?? []).length, 1);

  scheme = "light";
  assert.equal(renderToHtml(card), light, "rendering dark must not mutate the light styles");
});

test("the error recovery action is readable in both appearances", (t) => {
  let scheme: "light" | "dark" = "light";
  t.mock.method(Appearance, "getColorScheme", () => scheme);
  const screen = <AppErrorScreen error={new Error("连接中断")} onRetry={() => undefined} />;
  const light = renderToHtml(screen);
  for (const appearance of ["light", "dark"] as const) {
    scheme = appearance;
    const html = renderToHtml(screen);
    const nodes = styledNodes(html);
    const buttonIndex = nodes.findIndex((node) => node.attributes.includes('aria-label="重试"'));
    assert.ok(buttonIndex >= 0);
    const button = nodes[buttonIndex];
    const label = nodes.slice(buttonIndex + 1).find((node) => node.style.color);
    assert.ok(label);
    assert.ok(contrast(label.style.color, button.style["background-color"]) >= 4.5);
    assert.equal(semanticHtml(html), semanticHtml(light));
    const page = nodes.find((node) => node.style["background-color"]);
    assert.ok(page);
    assert.equal(luminance(page.style["background-color"]) < 0.08, appearance === "dark");
  }
});

test("an unavailable system appearance has a usable light fallback", (t) => {
  const readAppearance = t.mock.method(Appearance, "getColorScheme", () => null);
  const card = <DataCard detail="准备下一步" title="Orbit" />;
  const fallback = renderToHtml(card);
  readAppearance.mock.mockImplementation(() => "light");
  assert.equal(renderToHtml(card), fallback);
});

test("light recovery actions use readable Ocean blue without changing the dark action", (t) => {
  let scheme: "light" | "dark" = "light";
  t.mock.method(Appearance, "getColorScheme", () => scheme);
  const screen = <AppErrorScreen error={new Error("连接中断")} onRetry={() => undefined} />;
  for (const [appearance, expected] of [
    ["light", [0, 109, 184]],
    ["dark", [162, 175, 211]]
  ] as const) {
    scheme = appearance;
    const nodes = styledNodes(renderToHtml(screen));
    const button = nodes.find((node) => node.attributes.includes('aria-label="重试"'));
    assert.ok(button);
    const background = button.style["background-color"];
    assert.deepEqual((background.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number), [...expected]);
    if (appearance === "light") {
      assert.ok(contrast("#FFFFFF", background) >= 4.5);
      assert.ok(contrast(background, "#EDF8FF") >= 4.5);
      assert.ok(contrast(background, "#EAECEF") >= 4.5);
    }
  }
});

test("empty and loading states retain their content and semantics in either appearance", (t) => {
  let scheme: "light" | "dark" = "light";
  t.mock.method(Appearance, "getColorScheme", () => scheme);
  for (const state of [
    <EmptyState message="现在没有必须处理的事项" title="下一步" />,
    <LoadingState />
  ]) {
    scheme = "light";
    const light = renderToHtml(state);
    scheme = "dark";
    const dark = renderToHtml(state);
    assert.equal(semanticHtml(dark), semanticHtml(light));
    assert.notEqual(dark, light, "state colors must respond to appearance");
  }
});

test("the relationship chart preserves selected group, counts and controls in both appearances", (t) => {
  let scheme: "light" | "dark" = "light";
  t.mock.method(Appearance, "getColorScheme", () => scheme);
  const renderChart = () => {
    const palette = scheme === "dark" ? darkColors : colors;
    return renderToHtml(<AnalysisPieOrbitChart
      items={[
        { color: palette.accent, countLabel: "29 人", id: "strong", label: "强关系", percentage: 37 },
        { color: palette.live, countLabel: "30 人", id: "warm", label: "保持联系", percentage: 39 },
        { color: palette.sky, countLabel: "19 人", id: "weak", label: "待重新联系", percentage: 24 }
      ]}
      onSelect={() => undefined}
      selectedId="warm"
    />);
  };
  const light = renderChart();
  scheme = "dark";
  const dark = renderChart();
  const content = (html: string) => semanticHtml(html).replace(/ (?:fill|stroke)="[^"]*"/gu, "");
  assert.equal(content(dark), content(light));
  assert.match(dark, /30 人/u);
  assert.match(dark, /39%/u);
  // RN-web does not forward RN's accessibilityState object; native selection
  // semantics are checked on-device. The rendered selected center stays real.
  assert.match(dark, /aria-label="保持联系，30 人，39%"/u);
  assert.equal((dark.match(/role="button"/gu) ?? []).length, 3);
});
