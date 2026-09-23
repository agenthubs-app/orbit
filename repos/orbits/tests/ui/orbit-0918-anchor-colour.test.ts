/**
 * 跨域 `<a>` 字色门禁（收尾 2026-09-24，遗留清单「`<a>` 字色护栏的扫描面」）。
 *
 * 六个 `*-0918` 域的作用域样式表顶部都有同一对基线规则：
 *
 *   [data-orbit-real-page="<scope>"] a       { color: #3B3F7A; text-decoration: none; }
 *   [data-orbit-real-page="<scope>"] a:hover { color: #0E1225; }
 *
 * 只要某个设计里是普通文字的块被 linkify 成 `<a>`，这对规则就会压掉它的字色，并
 * 凭空多出一个设计没有的 hover——而这种回归在空账本 / 空列表的像素跑里截不出来
 * （行根本没渲染）。iOrbit 域在任务 6a 为此加过一条结构断言，但只扫
 * `agent/iorbit-0918/`；本文件把它提升为六域共用门禁。
 *
 * 判据：凡是落在 `<a>` 上的本域前缀类，必须在本域样式表里同时拥有
 * (1) 一条自带 `color:` 的基础规则，(2) 一条自带 `color:` 的 `:hover` 规则
 * （可以来自共享的中和块，所以用 matchAll 扫全部 `:hover` 规则）。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

interface Domain {
  /** 台账 / 报错里用的域名。 */
  name: string;
  /** 相对 app/(app)/app 的目录，整目录的 .tsx 都扫。 */
  dir: string;
  /** 本域的类前缀。 */
  prefix: string;
  /** 样式表所在文件（相对项目根）。 */
  stylesFile: string;
  /** 样式表的导出名，用于把模板字面量从源码里切出来。 */
  stylesExport: string;
  /** 作用域属性值，用来确认基线 a / a:hover 规则确实存在。 */
  scope: string;
}

const DOMAINS: Domain[] = [
  {
    name: "network",
    dir: "contacts/network-0918",
    prefix: "nw-",
    stylesFile: "app/(app)/app/contacts/network-0918/network-shell.tsx",
    stylesExport: "NETWORK_STYLES",
    scope: "network",
  },
  {
    name: "profile",
    dir: "profile/profile-0918",
    prefix: "pc-",
    stylesFile: "app/(app)/app/profile/profile-0918/profile-shell.tsx",
    stylesExport: "PROFILE_STYLES",
    scope: "profile-0918",
  },
  {
    name: "events",
    dir: "events/events-0918",
    prefix: "ev-",
    stylesFile: "app/(app)/app/events/events-0918/events-shell.tsx",
    stylesExport: "EVENTS_STYLES",
    scope: "events-0918",
  },
  {
    name: "ops",
    dir: "events/ops-0918",
    prefix: "op-",
    stylesFile: "app/(app)/app/events/ops-0918/ops-shell.tsx",
    stylesExport: "OPS_STYLES",
    scope: "ops-0918",
  },
  {
    name: "auth",
    dir: "account/auth-0918",
    prefix: "au-",
    stylesFile: "app/(app)/app/account/auth-0918/auth-modal.tsx",
    stylesExport: "AUTH_STYLES",
    scope: "auth-0918",
  },
  {
    name: "iorbit",
    dir: "agent/iorbit-0918",
    prefix: "ir-",
    stylesFile: "app/(app)/app/agent/iorbit-0918/iorbit-styles.ts",
    stylesExport: "IORBIT_STYLES",
    scope: "iorbit-0918",
  },
];

/** 把 `export const X = \`…\`;` 的模板字面量切出来，再抹掉注释并拍平成一行。 */
function readScopedCss(domain: Domain): string {
  const source = readFileSync(join(projectRoot, domain.stylesFile), "utf8");
  const opener = `export const ${domain.stylesExport} = \``;
  const start = source.indexOf(opener);
  assert.ok(start >= 0, `${domain.stylesFile} 里找不到 ${opener}`);
  const body = source.slice(start + opener.length);
  const end = body.indexOf("\n`;");
  assert.ok(end >= 0, `${domain.stylesFile} 的 ${domain.stylesExport} 模板字面量没有闭合`);
  return body.slice(0, end).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");
}

/** 收集整个域目录里落在 `<a>` 上的本域前缀类。 */
function collectLinkClasses(domain: Domain): Set<string> {
  const dir = join(projectRoot, "app/(app)/app", domain.dir);
  const linkClasses = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx")).sort()) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const tag of source.matchAll(/<a\b[^>]*>/g)) {
      const className = tag[0].match(/className="([^"]+)"/)?.[1];
      if (!className) continue;
      for (const part of className.split(/\s+/)) {
        if (part.startsWith(domain.prefix)) linkClasses.add(part);
      }
    }
  }
  return linkClasses;
}

interface Rule {
  selector: string;
  classes: string[];
  isHover: boolean;
  /** 类级特指度：属性选择器 + 类 + 伪类。元素选择器另计，见 beatsScopeHover。 */
  weight: number;
  elements: number;
  declaresColour: boolean;
}

/** 把作用域样式表切成规则表，只保留声明了 `color:` 的那些。 */
function parseColourRules(css: string): Rule[] {
  const rules: Rule[] = [];
  for (const chunk of css.split("}")) {
    const open = chunk.indexOf("{");
    if (open < 0) continue;
    const declarations = chunk.slice(open + 1);
    if (!/(^|;)\s*color\s*:/.test(declarations)) continue;
    for (const selector of chunk.slice(0, open).split(",")) {
      const trimmed = selector.trim();
      if (!trimmed) continue;
      const classes = [...trimmed.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
      const attributes = (trimmed.match(/\[[^\]]*\]/g) ?? []).length;
      const pseudoClasses = (trimmed.match(/(?<!:):[a-z-]+(?:\([^)]*\))?/g) ?? []).length;
      const elements = (trimmed.match(/(^|\s)[a-z]+(?=[\s.:[]|$)/g) ?? []).length;
      rules.push({
        selector: trimmed,
        classes,
        isHover: /:hover/.test(trimmed),
        weight: attributes + classes.length + pseudoClasses,
        elements,
        declaresColour: true,
      });
    }
  }
  return rules;
}

/**
 * 作用域基线 `[data-orbit-real-page="X"] a:hover` 的特指度是 (类级 2, 元素 1)。
 * 一条规则只有严格盖过它，才能在 hover 时保住自己的字色。
 */
function beatsScopeHover(rule: Rule): boolean {
  if (rule.weight > 2) return true;
  return rule.weight === 2 && rule.elements > 1;
}

/** 规则的类集合是否被这个 `<a>` 自己的 class 列表完全覆盖（祖先选择器因此不算数）。 */
function appliesTo(rule: Rule, anchorClasses: Set<string>): boolean {
  return rule.classes.length > 0 && rule.classes.every((name) => anchorClasses.has(name));
}

interface Anchor {
  file: string;
  classes: string[];
  /** 行内 `style={{ color: … }}`：内联声明压过任何样式表规则，本域基线也压不动它。 */
  hasInlineColour: boolean;
}

/** 收集整个域目录里带本域前缀类的 `<a>`。 */
function collectAnchors(domain: Domain): Anchor[] {
  const dir = join(projectRoot, "app/(app)/app", domain.dir);
  const anchors: Anchor[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx")).sort()) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const tag of source.matchAll(/<a\b[^>]*>/g)) {
      const className = tag[0].match(/className="([^"]+)"/)?.[1];
      if (!className) continue;
      const classes = className.split(/\s+/).filter(Boolean);
      if (!classes.some((name) => name.startsWith(domain.prefix))) continue;
      anchors.push({
        file,
        classes,
        hasInlineColour: /style=\{\{[^}]*\bcolor:/.test(tag[0]),
      });
    }
  }
  return anchors;
}

test("every *-0918 scope still carries the a / a:hover baseline this gate exists for", () => {
  for (const domain of DOMAINS) {
    const css = readScopedCss(domain);
    assert.match(
      css,
      new RegExp(`\\[data-orbit-real-page="${domain.scope}"\\] a \\{[^}]*color\\s*:`),
      `${domain.name}: 作用域缺少 a { color } 基线`,
    );
    assert.match(
      css,
      new RegExp(`\\[data-orbit-real-page="${domain.scope}"\\] a:hover \\{[^}]*color\\s*:`),
      `${domain.name}: 作用域缺少 a:hover { color } 基线`,
    );
  }
});

test("every *-0918 <a> keeps its own colour against the scope's a:hover", () => {
  const uncovered: string[] = [];
  let scanned = 0;
  for (const domain of DOMAINS) {
    const rules = parseColourRules(readScopedCss(domain));
    const anchors = collectAnchors(domain);
    assert.ok(
      anchors.length > 0,
      `${domain.name}: 一个带 ${domain.prefix}* 的 <a> 都没扫到，扫描面大概率断了`,
    );
    scanned += anchors.length;
    for (const anchor of anchors) {
      // 行内 color 由 JS 直接算出来（分档配色表），样式表压不动，也就不受基线影响。
      if (anchor.hasInlineColour) continue;
      const owned = new Set(anchor.classes);
      const covered = rules.some(
        (rule) => appliesTo(rule, owned) && (rule.isHover || beatsScopeHover(rule)),
      );
      if (!covered) {
        uncovered.push(
          `${domain.name}/${anchor.file} <a class="${anchor.classes.join(" ")}">`,
        );
      }
    }
  }

  // 扫描面自检：六域加起来的链接数量不该悄悄塌掉，且这条门禁最初为之存在的
  // plan「本周重点」行（任务 5 修订轮 1 的 linkify）必须仍在扫描面里。
  assert.ok(scanned >= 60, `expected the six domains' anchors, found ${scanned}`);
  const iorbit = DOMAINS.find((domain) => domain.name === "iorbit")!;
  assert.ok(
    collectAnchors(iorbit).some((anchor) => anchor.classes.includes("ir-task-row")),
    "the plan row is the class this gate exists for",
  );
  assert.deepEqual(
    uncovered,
    [],
    `these <a> elements let their scope's a / a:hover win over the design's colour:\n  ${uncovered.join("\n  ")}`,
  );
});
