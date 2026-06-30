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
  const page = await importProjectModule<{
    default: (props?: {
      searchParams?: Promise<{ document?: string }>;
    }) => Promise<React.ReactElement>;
  }>("app/dev/knowledge/page.tsx");
  const html = renderToStaticMarkup(
    await page.default({ searchParams: Promise.resolve({}) }),
  );

  assert.match(html, /Orbit 知识库/);
  assert.match(html, /data-orbit-knowledge-wiki="true"/);
  assert.match(html, /data-wiki-shell="true"/);
  assert.match(html, /class="wiki-global-nav"/);
  assert.match(html, /class="[^"]*\bwiki-article\b[^"]*"/);
  assert.match(html, /class="wiki-page-toc"/);
  assert.match(html, /class="wiki-infobox"/);
  assert.match(html, /文档索引/);
  assert.match(html, /页面目录/);
  assert.match(html, /最近更改/);
  assert.match(html, /搜索 Orbit Wiki/);
  assert.match(html, /147 个文档/);
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
  assert.match(html, /href="\/dev\/knowledge\?document=technical-design"/);
  assert.match(html, /href="\/dev\/knowledge\?page=index"/);
  assert.match(html, /href="\/dev\/knowledge\?topic=architecture"/);
  assert.match(html, /href="\/dev\/knowledge\?page=index&amp;category=technical-design"/);
  assert.match(html, /href="\/dev\/knowledge\?history=knowledge-chinese-document-mirrors"/);
  assert.match(html, /href="\/dev\/knowledge\?learning=troubleshooting"/);
  assert.match(html, /knowledge\/docs\/catalog\.zh\.md/);
  assert.doesNotMatch(html, /class="wiki-document-body/);
  assert.doesNotMatch(html, /workbench-surface|workbench-grid|relationship-record/);
});

test("knowledge wiki renders selected documents as standalone article pages", async () => {
  const wiki = await importProjectModule<{
    OrbitKnowledgeWiki: (props: {
      initialPage: { kind: "document"; id: string };
    }) => React.ReactElement;
  }>("app/dev/knowledge/knowledge-wiki.tsx");
  const html = renderToStaticMarkup(
    React.createElement(wiki.OrbitKnowledgeWiki, {
      initialPage: { kind: "document", id: "technical-design" },
    }),
  );

  assert.match(html, /data-wiki-page-kind="document"/);
  assert.match(html, /class="[^"]*\bwiki-document-article\b[^"]*"/);
  assert.match(html, /Orbit 技术设计/);
  assert.match(html, /正文内容/);
  assert.doesNotMatch(html, /id="topic-portals"/);
  assert.doesNotMatch(html, /id="document-index"/);
  assert.doesNotMatch(html, /id="recent-changes"/);
  assert.doesNotMatch(html, /id="learning-index"/);
  assert.doesNotMatch(html, /class="wiki-index-table"/);
  assert.doesNotMatch(html, /class="wiki-portal-grid"/);
});

test("knowledge wiki document URLs render markdown on the first page load", async () => {
  const page = await importProjectModule<{
    default: (props?: {
      searchParams?: Promise<{ document?: string }>;
    }) => Promise<React.ReactElement>;
  }>("app/dev/knowledge/page.tsx");
  const html = renderToStaticMarkup(
    await page.default({
      searchParams: Promise.resolve({ document: "technical-design" }),
    }),
  );

  assert.match(html, /data-wiki-page-kind="document"/);
  assert.match(html, /class="[^"]*\bwiki-document-article\b[^"]*"/);
  assert.match(html, /Orbit 技术设计/);
  assert.match(html, /已从 <code>knowledge\/docs\/zh\/technical-design\.zh\.md<\/code> 读取中文 Markdown 阅读版/);
  assert.match(html, /中文阅读版/);
  assert.match(html, /<h2>中文摘要<\/h2>/);
  assert.match(html, /<pre><code class="language-json">/);
  assert.match(html, /href="\/dev\/knowledge#recent-changes"/);
  assert.match(html, /href="\/dev\/knowledge#learning-index"/);
  assert.doesNotMatch(html, /href="#recent-changes"/);
  assert.doesNotMatch(html, /href="#learning-index"/);
  assert.doesNotMatch(html, /id="topic-portals"/);
  assert.doesNotMatch(html, /id="document-index"/);
  assert.doesNotMatch(html, /id="recent-changes"/);
  assert.doesNotMatch(html, /id="learning-index"/);
});

test("knowledge wiki document URLs render full Chinese source bodies when available", async () => {
  const page = await importProjectModule<{
    default: (props?: {
      searchParams?: Promise<{ document?: string }>;
    }) => Promise<React.ReactElement>;
  }>("app/dev/knowledge/page.tsx");
  const html = renderToStaticMarkup(
    await page.default({
      searchParams: Promise.resolve({ document: "feature-bootstrap-design" }),
    }),
  );

  assert.match(html, /data-wiki-page-kind="document"/);
  assert.match(html, /bootstrap Feature 设计/);
  assert.match(html, /Bootstrap 负责启动产品工作台时的一次性聚合/);
  assert.match(html, /Bootstrap 团队只负责组合，不负责修其他模块的业务结果/);
});

test("knowledge wiki supports URL-addressable navigation pages", async () => {
  const page = await importProjectModule<{
    default: (props?: {
      searchParams?: Promise<{
        category?: string;
        history?: string;
        learning?: string;
        page?: string;
        topic?: string;
      }>;
    }) => Promise<React.ReactElement>;
  }>("app/dev/knowledge/page.tsx");
  const topicHtml = renderToStaticMarkup(
    await page.default({
      searchParams: Promise.resolve({ topic: "architecture" }),
    }),
  );
  const indexHtml = renderToStaticMarkup(
    await page.default({
      searchParams: Promise.resolve({
        category: "technical-design",
        page: "index",
      }),
    }),
  );
  const historyHtml = renderToStaticMarkup(
    await page.default({
      searchParams: Promise.resolve({
        history: "knowledge-chinese-document-mirrors",
      }),
    }),
  );
  const learningHtml = renderToStaticMarkup(
    await page.default({
      searchParams: Promise.resolve({ learning: "troubleshooting" }),
    }),
  );

  assert.match(topicHtml, /data-wiki-page-kind="topic"/);
  assert.match(topicHtml, /<h1>架构总览<\/h1>/);
  assert.match(topicHtml, /knowledge\/wiki\/architecture\.zh\.md/);

  assert.match(indexHtml, /data-wiki-page-kind="index"/);
  assert.match(indexHtml, /文档索引/);
  assert.match(indexHtml, /value="technical-design"/);

  assert.match(historyHtml, /data-wiki-page-kind="history"/);
  assert.match(historyHtml, /<h1>Wiki 文档中文镜像层<\/h1>/);
  assert.match(historyHtml, /knowledge\/history\/development-log\.zh\.md/);

  assert.match(learningHtml, /data-wiki-page-kind="learning"/);
  assert.match(learningHtml, /<h1>排障知识<\/h1>/);
  assert.match(learningHtml, /knowledge\/learnings\/troubleshooting\.zh\.md/);
});

test("knowledge wiki uses a real markdown renderer with GFM support", () => {
  const packageJson = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/knowledge/knowledge-wiki.tsx"),
    "utf8",
  );

  assert.equal(typeof packageJson.dependencies?.["react-markdown"], "string");
  assert.equal(typeof packageJson.dependencies?.["remark-gfm"], "string");
  assert.match(pageSource, /from ["']react-markdown["']/);
  assert.match(pageSource, /from ["']remark-gfm["']/);
  assert.doesNotMatch(
    pageSource,
    /function (startsMarkdownBlock|parseTableCells|isTableSeparator|MarkdownDocument)\b/,
  );
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
