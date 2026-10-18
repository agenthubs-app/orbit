import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

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
