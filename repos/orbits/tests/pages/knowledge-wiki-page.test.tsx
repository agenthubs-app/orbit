import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

testRequire.extensions[".css"] = () => undefined;

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);
  assert.equal(existsSync(absolutePath), true, `${pathFromRoot} must exist`);
  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("/dev/knowledge renders the Orbit knowledge wiki", async () => {
  const page = await importProjectModule<{ default: () => React.ReactElement }>(
    "app/dev/knowledge/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(page.default));

  assert.match(html, /Orbit 知识库/);
  assert.match(html, /data-orbit-knowledge-wiki="true"/);
  assert.match(html, /data-wiki-shell="true"/);
  assert.match(html, /class="wiki-global-nav"/);
  assert.match(html, /class="wiki-article"/);
  assert.match(html, /class="wiki-page-toc"/);
  assert.match(html, /class="wiki-infobox"/);
  assert.match(html, /文档索引/);
  assert.match(html, /页面目录/);
  assert.match(html, /最近更改/);
  assert.match(html, /搜索 Orbit Wiki/);
  assert.match(html, /正文内容/);
  assert.match(html, /class="wiki-document-body/);
  assert.match(html, /146 个文档/);
  assert.match(html, /审计依据|关联代码路径/);
  assert.match(
    html,
    /repos\/orbits\/features\/search\/relationship-natural-search-mock\/LIVE_IMPLEMENTATION\.md/,
  );
  assert.match(html, /Shared Runtime 交接：ui/);
  assert.match(html, /知识主题/);
  assert.match(html, /开发历史/);
  assert.match(html, /排障经验/);
  assert.match(html, /需要代码核对/);
  assert.match(html, /docs\/designs\/orbit_technical_design\.md/);
  assert.match(html, /knowledge\/docs\/catalog\.zh\.md/);
  assert.doesNotMatch(html, /workbench-surface|workbench-grid|relationship-record/);
});

test("knowledge wiki page consumes the app-local manifest only", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/knowledge/knowledge-wiki.tsx"),
    "utf8",
  );

  assert.match(pageSource, /shared\/knowledge\/knowledge-manifest/);
  assert.match(pageSource, /\/api\/dev\/knowledge\/documents\//);
  assert.doesNotMatch(
    pageSource,
    /node:fs|readFileSync|process\.cwd|knowledge\/docs|knowledge\/index/,
  );
});
