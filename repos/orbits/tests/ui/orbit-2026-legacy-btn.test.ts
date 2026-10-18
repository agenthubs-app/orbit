import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

// R31b（SC-R31b-03）：旧页面会加载未加作用域的全局 `.btn`（public/orbit-reference/orbit-reference.generated.css：
// 高 44、内边距 0 20、15 / 550、圆角 10、1px 边框）。新组件的 <button> 带 `btn`（按钮防倒退计数要它），弹层 / 抽屉压在
// 旧页面上时会被带歪。统一做法（沿用 G13）：带 `btn` 的元素，它的第一个模块类必须有一条 `.<类>:global(.btn)` 双类规则，
// 把 kit 的尺寸重写回来（height 或 width / height、padding、border、border-radius 都要写到）。
// 像素侧的同一结论见 views/web-R31b-components.json 里每格的 `?env=legacy`（id 末尾 L）条目。
const UI = "app/(app)/app/orbit-2026/ui";
const RESTATED = ["padding", "border", "border-radius"];

function btnClasses(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/className=\{`btn \$\{styles\.([A-Za-z]+)\}/g)) names.add(match[1]!);
  // Button / IconButton build the class list first: `btn ${classes}` with styles.button / styles.icon at its head.
  if (/className=\{`btn \$\{classes\}`\}/.test(source)) for (const match of source.matchAll(/const classes = \[styles\.([A-Za-z]+)/g)) names.add(match[1]!);
  return [...names];
}

function restatement(css: string, name: string): string | null {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [...clean.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((block) => block[1]!.split(",").some((selector) => selector.trim() === `.${name}:global(.btn)`));
  if (!blocks.length) return `.${name}:global(.btn) is missing`;
  const props = new Set(blocks.flatMap((block) => [...block[2]!.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]!)));
  const missing = [...RESTATED, "height"].filter((prop) => !props.has(prop) && !(prop === "height" && props.has("min-height")));
  return missing.length ? `.${name}:global(.btn) does not restate ${missing.join(", ")}` : null;
}

test("every new component that renders a .btn restates the kit size over the legacy global .btn", () => {
  const problems: string[] = [];
  for (const file of readdirSync(UI).filter((name) => name.endsWith(".tsx"))) {
    const source = readFileSync(join(UI, file), "utf8");
    const names = btnClasses(source);
    if (!names.length) continue;
    const css = readFileSync(join(UI, file.replace(/\.tsx$/, ".module.css")), "utf8");
    for (const name of names) {
      const problem = restatement(css, name);
      if (problem) problems.push(`${file}: ${problem}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("the check sees a missing or partial restatement", () => {
  assert.match(restatement(".a { height: 1px; }", "a") ?? "", /missing/);
  assert.match(restatement(".a:global(.btn) { height: 1px; padding: 0; }", "a") ?? "", /border, border-radius/);
  assert.equal(restatement(".a:global(.btn), .b:global(.btn) { height: 1px; padding: 0; border: 0; border-radius: var(--r-pill); }", "b"), null);
  assert.deepEqual(btnClasses("<button className={`btn ${styles.x} ${on ? styles.y : \"\"}`} />"), ["x"]);
});

test("a new Button keeps its normal, pressed and disabled computed styles in both page environments", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Button, Orbit2026Scope, Segmented } from "./app/(app)/app/orbit-2026/ui";
    createRoot(document.getElementById("root")).render(<Orbit2026Scope language="ja">
      <Button label="Normal" variant="primary" />
      <Button label="Pressed" variant="primary" />
      <Button label="Disabled" variant="primary" disabled />
      <Segmented label="Buckets" segments={[{key:"a",label:"Alpha"},{key:"b",label:"Beta"}]} value="a" onChange={() => undefined} variant="seg" />
    </Orbit2026Scope>);
  `);
  const browser = await launch();
  const samples: Record<string, unknown> = {};
  try {
    for (const env of ["new", "legacy"] as const) {
      const page = await open(browser, code);
      try {
        if (env === "legacy") await page.addStyleTag({ path: `${process.cwd()}/public/orbit-reference/orbit-reference.generated.css` });
        const read = (label: string) => page.getByRole("button", { name: label }).evaluate((el) => {
          const s = getComputedStyle(el);
          return { height: s.height, padding: s.paddingLeft, fontSize: s.fontSize, fontWeight: s.fontWeight, radius: s.borderRadius, border: s.borderTopWidth, background: s.backgroundColor, color: s.color, cursor: s.cursor, opacity: s.opacity, transform: s.transform };
        });
        const normal = await read("Normal");
        await page.getByRole("button", { name: "Pressed" }).hover();
        await page.mouse.down();
        await page.waitForTimeout(250);
        const pressed = await read("Pressed");
        await page.mouse.up();
        const disabled = await read("Disabled");
        const tab = page.getByRole("tab", { name: "Beta" });
        await tab.hover();
        await page.mouse.down();
        const tabTransform = await tab.evaluate((el) => getComputedStyle(el).transform);
        await page.mouse.up();
        samples[env] = { normal, pressed, disabled, tabTransform };
        assert.equal(normal.height, "40px", env);
        assert.equal(normal.padding, "16px", env);
        assert.equal(normal.radius, "999px", env);
        assert.equal(normal.border, "0px", env);
        assert.match(pressed.transform, /^matrix\(0\.96, 0, 0, 0\.96, 0, 0\)$/, env);
        assert.equal(disabled.opacity, "0.5", env);
        assert.equal(disabled.background, normal.background, env);
        assert.equal(disabled.color, normal.color, env);
        assert.equal(tabTransform, "none", `${env}: legacy .btn:active must not translate Segmented`);
        assert.deepEqual(errorsOf(page), []);
      } finally { await page.close(); }
    }
    assert.deepEqual(samples.legacy, samples.new);
  } finally { await browser.close(); }
});
