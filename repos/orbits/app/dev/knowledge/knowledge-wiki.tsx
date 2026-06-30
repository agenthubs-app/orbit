"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../../shared/knowledge/knowledge-manifest";

const catalogEntryPath = ["knowledge", "docs", "catalog.zh.md"].join("/");
const allFilter = "all";

type KnowledgeManifest = typeof ORBIT_KNOWLEDGE_MANIFEST;
type DocumentEntry = KnowledgeManifest["documents"][number];
type HistoryEntry = KnowledgeManifest["recentHistory"][number];
type LearningEntry = KnowledgeManifest["learnings"][number];
type TopicEntry = KnowledgeManifest["topicPages"][number];
export type DocumentContentState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      markdown: string;
      sourcePath: string;
      status: "loaded";
      titleZh: string;
    }
  | { message: string; status: "error" };
type DocumentStatus =
  | "current"
  | "historical"
  | "superseded"
  | "needs-review"
  | "generated-evidence";
type DocumentFreshness =
  | "verified-current"
  | "likely-current"
  | "needs-code-check"
  | "known-stale";
export type WikiPage =
  | { kind: "main" }
  | { kind: "index" }
  | { kind: "topic"; id: string }
  | { kind: "document"; id: string }
  | { kind: "history"; id: string }
  | { kind: "learning"; id: string };
type OrbitKnowledgeWikiProps = {
  initialDocumentContent?: {
    content: DocumentContentState;
    documentId: string;
  };
  initialCategory?: string;
  initialPage?: WikiPage;
};

const categoryLabels: Record<string, string> = {
  architecture: "架构",
  "developer-guide": "开发指南",
  "feature-design": "Feature 设计",
  harness: "Harness",
  "implementation-handoff": "实现交接",
  "implementation-plan": "实施计划",
  learning: "经验",
  mockdata: "Mockdata",
  "module-architecture": "模块架构",
  "product-design": "产品设计",
  "sprint-spec": "Sprint 规格",
  "technical-design": "技术设计",
};

const statusLabels: Record<DocumentStatus, string> = {
  current: "当前",
  historical: "历史",
  superseded: "已替代",
  "needs-review": "待复核",
  "generated-evidence": "生成证据",
};

const freshnessLabels: Record<DocumentFreshness, string> = {
  "verified-current": "已验证当前",
  "likely-current": "基本当前",
  "needs-code-check": "需代码核对",
  "known-stale": "已知过期",
};

const topicDocumentCategories: Record<string, readonly string[]> = {
  "agent-system": ["feature-design", "harness", "implementation-plan"],
  architecture: ["architecture", "module-architecture", "technical-design"],
  "data-and-mockdata": ["architecture", "mockdata", "technical-design"],
  harness: ["harness", "implementation-plan", "sprint-spec"],
  modules: ["implementation-handoff", "module-architecture"],
  "project-overview": ["developer-guide", "product-design", "technical-design"],
};

function classNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

function categoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

function documentStatus(document: DocumentEntry): DocumentStatus {
  return document.status as DocumentStatus;
}

function documentFreshness(document: DocumentEntry): DocumentFreshness {
  return document.freshness as DocumentFreshness;
}

function countBy<TItem, TKey extends string>(
  items: readonly TItem[],
  read: (item: TItem) => TKey,
) {
  const counts = new Map<TKey, number>();
  for (const item of items) {
    const key = read(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function matchesQuery(document: DocumentEntry, query: string) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return [
    document.titleZh,
    document.summaryZh,
    document.reviewEvidenceZh,
    document.sourcePath,
    document.category,
    document.status,
    document.freshness,
    document.ownerArea,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function readActiveDocument(
  page: WikiPage,
) {
  if (page.kind === "document") {
    return ORBIT_KNOWLEDGE_MANIFEST.documents.find((item) => item.id === page.id);
  }

  return undefined;
}

function readTopicPage(page: WikiPage) {
  return page.kind === "topic"
    ? ORBIT_KNOWLEDGE_MANIFEST.topicPages.find((item) => item.id === page.id)
    : undefined;
}

function readHistoryPage(page: WikiPage) {
  return page.kind === "history"
    ? ORBIT_KNOWLEDGE_MANIFEST.recentHistory.find((item) => item.id === page.id)
    : undefined;
}

function readLearningPage(page: WikiPage) {
  return page.kind === "learning"
    ? ORBIT_KNOWLEDGE_MANIFEST.learnings.find((item) => item.id === page.id)
    : undefined;
}

function documentsForTopic(
  topic: TopicEntry,
  documents: readonly DocumentEntry[],
) {
  const categories = topicDocumentCategories[topic.id] ?? [];
  if (!categories.length) return documents;

  return documents.filter((document) => categories.includes(document.category));
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "evidence";
}) {
  return <span className={classNames("wiki-badge", `wiki-badge-${tone}`)}>{children}</span>;
}

function isDocumentContentLoaded(
  content: DocumentContentState | undefined,
): content is Extract<DocumentContentState, { status: "loaded" }> {
  return content?.status === "loaded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readApiErrorMessage(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error)) return "无法读取文档正文。";

  return typeof body.error.message === "string" && body.error.message.trim()
    ? body.error.message
    : "无法读取文档正文。";
}

function readDocumentContent(body: unknown): Extract<DocumentContentState, { status: "loaded" }> {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    throw new Error(readApiErrorMessage(body));
  }

  const markdown = body.data.markdown;
  const sourcePath = body.data.sourcePath;
  const titleZh = body.data.titleZh;

  if (
    typeof markdown !== "string" ||
    typeof sourcePath !== "string" ||
    typeof titleZh !== "string"
  ) {
    throw new Error("文档正文响应格式不完整。");
  }

  return {
    markdown,
    sourcePath,
    status: "loaded",
    titleZh,
  };
}

function WikiStyles() {
  return (
    <style>{`
      .wiki-frame {
        --wiki-canvas: #f6f7f8;
        --wiki-paper: #ffffff;
        --wiki-ink: #202122;
        --wiki-muted: #54595d;
        --wiki-border: #a2a9b1;
        --wiki-border-soft: #d8dee4;
        --wiki-blue: #3366cc;
        --wiki-blue-dark: #0645ad;
        --wiki-green: #14866d;
        --wiki-red: #a33a2a;
        background: var(--wiki-canvas);
        color: var(--wiki-ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        min-height: 100vh;
      }

      .wiki-masthead {
        align-items: center;
        background: var(--wiki-paper);
        border-bottom: 1px solid var(--wiki-border);
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(180px, 0.9fr) minmax(260px, 1.5fr) auto;
        min-width: 0;
        padding: 10px 22px;
        position: sticky;
        top: 0;
        z-index: 5;
      }

      .wiki-brand {
        align-items: center;
        display: flex;
        gap: 10px;
        min-width: 0;
      }

      .wiki-mark {
        align-items: center;
        border: 1px solid var(--wiki-border);
        color: var(--wiki-blue-dark);
        display: inline-flex;
        flex: 0 0 auto;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1.25rem;
        height: 38px;
        justify-content: center;
        width: 38px;
      }

      .wiki-brand strong {
        display: block;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1.25rem;
        font-weight: 500;
        line-height: 1.05;
      }

      .wiki-brand span {
        color: var(--wiki-muted);
        display: block;
        font-size: 0.75rem;
        line-height: 1.2;
      }

      .wiki-search {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .wiki-search span {
        color: var(--wiki-muted);
        font-size: 0.76rem;
      }

      .wiki-search input {
        background: #ffffff;
        border: 1px solid var(--wiki-border);
        border-radius: 2px;
        color: var(--wiki-ink);
        font: inherit;
        min-height: 36px;
        padding: 7px 10px;
        width: 100%;
      }

      .wiki-page-tabs {
        align-items: end;
        display: flex;
        gap: 2px;
        justify-content: end;
      }

      .wiki-page-tabs a {
        background: #f8f9fa;
        border: 1px solid var(--wiki-border-soft);
        border-bottom-color: var(--wiki-border);
        border-radius: 2px 2px 0 0;
        color: var(--wiki-blue-dark);
        display: inline-flex;
        font: inherit;
        font-size: 0.82rem;
        justify-content: center;
        min-height: 34px;
        min-width: 0;
        padding: 6px 10px;
        text-decoration: none;
      }

      .wiki-page-tabs a[aria-current="page"] {
        background: var(--wiki-paper);
        border-bottom-color: var(--wiki-paper);
        color: var(--wiki-ink);
      }

      .wiki-layout {
        display: grid;
        gap: 0;
        grid-template-columns: 248px minmax(0, 1fr) 256px;
        margin: 0 auto;
        max-width: 1680px;
        min-width: 0;
      }

      .wiki-global-nav,
      .wiki-page-toc {
        align-self: start;
        color: var(--wiki-muted);
        font-size: 0.86rem;
        max-height: calc(100vh - 60px);
        overflow: auto;
        padding: 20px 18px;
        position: sticky;
        top: 60px;
      }

      .wiki-global-nav {
        border-right: 1px solid var(--wiki-border-soft);
      }

      .wiki-page-toc {
        border-left: 1px solid var(--wiki-border-soft);
      }

      .wiki-nav-block {
        border-bottom: 1px solid var(--wiki-border-soft);
        display: grid;
        gap: 4px;
        padding: 0 0 16px;
      }

      .wiki-nav-block + .wiki-nav-block {
        padding-top: 16px;
      }

      .wiki-nav-heading,
      .wiki-page-toc h2,
      .wiki-infobox h2 {
        color: var(--wiki-ink);
        font-family: Georgia, "Times New Roman", serif;
        font-size: 0.98rem;
        font-weight: 500;
        line-height: 1.25;
        margin: 0 0 8px;
      }

      .wiki-nav-link,
      .wiki-nav-button,
      .wiki-toc-link {
        background: transparent;
        border: 0;
        border-radius: 2px;
        color: var(--wiki-blue-dark);
        cursor: pointer;
        display: block;
        font: inherit;
        line-height: 1.35;
        min-height: 30px;
        min-width: 0;
        padding: 4px 6px;
        text-align: left;
        text-decoration: none;
        width: 100%;
      }

      .wiki-nav-button[aria-pressed="true"],
      .wiki-nav-button[aria-current="page"],
      .wiki-nav-link:focus-visible,
      .wiki-nav-button:focus-visible,
      .wiki-toc-link:focus-visible,
      .wiki-index-table a:focus-visible,
      .wiki-index-table button:focus-visible {
        outline: 2px solid var(--wiki-blue);
        outline-offset: 1px;
      }

      .wiki-nav-button[aria-pressed="true"],
      .wiki-nav-button[aria-current="page"] {
        background: #eaecf0;
        color: var(--wiki-ink);
      }

      .wiki-category-row {
        align-items: center;
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .wiki-category-row small {
        color: var(--wiki-muted);
      }

      .wiki-article {
        background: var(--wiki-paper);
        border-left: 1px solid var(--wiki-border-soft);
        border-right: 1px solid var(--wiki-border-soft);
        min-width: 0;
        padding: 28px 44px 60px;
      }

      .wiki-breadcrumbs {
        color: var(--wiki-muted);
        font-size: 0.82rem;
        margin-bottom: 12px;
      }

      .wiki-article h1 {
        border-bottom: 1px solid var(--wiki-border);
        font-family: Georgia, "Times New Roman", serif;
        font-size: 2.15rem;
        font-weight: 500;
        letter-spacing: 0;
        line-height: 1.2;
        margin: 0 0 12px;
        padding-bottom: 8px;
      }

      .wiki-article h2 {
        border-bottom: 1px solid var(--wiki-border-soft);
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1.42rem;
        font-weight: 500;
        letter-spacing: 0;
        line-height: 1.25;
        margin: 28px 0 12px;
        padding-bottom: 5px;
      }

      .wiki-article h3 {
        font-size: 1rem;
        letter-spacing: 0;
        margin: 18px 0 8px;
      }

      .wiki-lead,
      .wiki-article p {
        color: var(--wiki-ink);
        font-size: 0.98rem;
        line-height: 1.72;
        margin: 0 0 12px;
      }

      .wiki-muted {
        color: var(--wiki-muted);
      }

      .wiki-article code,
      .wiki-page-toc code {
        background: #f1f3f5;
        border: 1px solid #e1e5ea;
        border-radius: 2px;
        color: #27313a;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.86em;
        overflow-wrap: anywhere;
        padding: 1px 4px;
      }

      .wiki-document-body {
        border-top: 1px solid var(--wiki-border-soft);
        margin-top: 18px;
        padding-top: 6px;
      }

      .wiki-document-metadata {
        background: #f8f9fa;
        border: 1px solid var(--wiki-border-soft);
        display: grid;
        gap: 10px;
        margin: 18px 0 20px;
        padding: 12px;
      }

      .wiki-document-metadata h2 {
        border-bottom: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 0.95rem;
        font-weight: 750;
        margin: 0;
        padding: 0;
      }

      .wiki-document-metadata dl {
        display: grid;
        gap: 8px;
        margin: 0;
      }

      .wiki-document-metadata div {
        display: grid;
        gap: 4px;
      }

      .wiki-document-metadata dt {
        color: var(--wiki-muted);
        font-size: 0.76rem;
        font-weight: 750;
      }

      .wiki-document-metadata dd {
        line-height: 1.55;
        margin: 0;
      }

      .wiki-document-status {
        background: #f8f9fa;
        border: 1px solid var(--wiki-border-soft);
        color: var(--wiki-muted);
        line-height: 1.55;
        margin-top: 10px;
        padding: 12px;
      }

      .wiki-document-status-error {
        border-color: rgba(163, 58, 42, 0.32);
        color: var(--wiki-red);
      }

      .wiki-document-markdown {
        margin-top: 8px;
      }

      .wiki-document-markdown h1 {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1.55rem;
        font-weight: 500;
        letter-spacing: 0;
        line-height: 1.25;
        margin: 28px 0 12px;
      }

      .wiki-document-markdown blockquote {
        border-left: 3px solid var(--wiki-border);
        color: var(--wiki-muted);
        margin: 12px 0;
        padding: 4px 0 4px 12px;
      }

      .wiki-document-markdown pre {
        background: #f1f3f5;
        border: 1px solid var(--wiki-border-soft);
        font-size: 0.86rem;
        line-height: 1.55;
        margin: 12px 0;
        overflow-x: auto;
        padding: 12px;
      }

      .wiki-document-markdown pre code {
        background: transparent;
        border: 0;
        padding: 0;
      }

      .wiki-document-markdown ul,
      .wiki-document-markdown ol {
        line-height: 1.68;
        margin: 0 0 12px 22px;
        padding: 0;
      }

      .wiki-document-markdown table {
        border-collapse: collapse;
        font-size: 0.88rem;
        margin: 12px 0;
        width: 100%;
      }

      .wiki-document-table-scroll {
        margin: 12px 0;
        overflow-x: auto;
        width: 100%;
      }

      .wiki-document-markdown th,
      .wiki-document-markdown td {
        border: 1px solid var(--wiki-border-soft);
        padding: 7px 8px;
        text-align: left;
        vertical-align: top;
      }

      .wiki-document-markdown th {
        background: #eaecf0;
      }

      .wiki-portal-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .wiki-portal {
        border: 1px solid var(--wiki-border-soft);
        border-left: 3px solid var(--wiki-blue);
        padding: 10px 12px;
      }

      .wiki-portal a {
        background: transparent;
        border: 0;
        color: var(--wiki-blue-dark);
        display: inline-block;
        font: inherit;
        font-weight: 700;
        min-height: 0;
        min-width: 0;
        padding: 0;
        text-align: left;
        text-decoration: none;
      }

      .wiki-portal a:hover {
        text-decoration: underline;
      }

      .wiki-search-row {
        align-items: end;
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(240px, 1fr) minmax(180px, 0.35fr);
        margin: 14px 0;
      }

      .wiki-field {
        display: grid;
        gap: 4px;
      }

      .wiki-field span {
        color: var(--wiki-muted);
        font-size: 0.8rem;
      }

      .wiki-field select,
      .wiki-field input {
        border: 1px solid var(--wiki-border);
        border-radius: 2px;
        color: var(--wiki-ink);
        font: inherit;
        min-height: 34px;
        padding: 6px 8px;
        width: 100%;
      }

      .wiki-index-table {
        border-collapse: collapse;
        font-size: 0.88rem;
        margin-top: 12px;
        table-layout: fixed;
        width: 100%;
      }

      .wiki-index-table th,
      .wiki-index-table td {
        border: 1px solid var(--wiki-border-soft);
        line-height: 1.45;
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }

      .wiki-index-table th {
        background: #eaecf0;
        color: var(--wiki-ink);
        font-weight: 750;
      }

      .wiki-index-table tr:nth-child(even) td {
        background: #f8f9fa;
      }

      .wiki-index-table a,
      .wiki-index-table button {
        background: transparent;
        border: 0;
        color: var(--wiki-blue-dark);
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        min-height: 0;
        min-width: 0;
        padding: 0;
        text-align: left;
        text-decoration: none;
      }

      .wiki-index-table a:hover {
        text-decoration: underline;
      }

      .wiki-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .wiki-badge {
        border: 1px solid var(--wiki-border-soft);
        border-radius: 999px;
        color: var(--wiki-muted);
        display: inline-flex;
        font-size: 0.75rem;
        line-height: 1.2;
        padding: 3px 8px;
        white-space: nowrap;
      }

      .wiki-badge-success {
        border-color: rgba(20, 134, 109, 0.35);
        color: var(--wiki-green);
      }

      .wiki-badge-warning {
        border-color: rgba(163, 58, 42, 0.32);
        color: var(--wiki-red);
      }

      .wiki-badge-evidence {
        border-color: rgba(51, 102, 204, 0.3);
        color: var(--wiki-blue-dark);
      }

      .wiki-infobox {
        background: var(--wiki-paper);
        border: 1px solid var(--wiki-border);
        display: grid;
        gap: 8px;
        margin-bottom: 18px;
        padding: 12px;
      }

      .wiki-infobox dl,
      .wiki-change-list,
      .wiki-learning-list {
        display: grid;
        gap: 9px;
        margin: 0;
      }

      .wiki-infobox div,
      .wiki-change-list div,
      .wiki-learning-list div {
        display: grid;
        gap: 3px;
      }

      .wiki-infobox dt,
      .wiki-change-list dt,
      .wiki-learning-list dt {
        color: var(--wiki-muted);
        font-size: 0.75rem;
        font-weight: 750;
      }

      .wiki-infobox dd,
      .wiki-change-list dd,
      .wiki-learning-list dd {
        line-height: 1.45;
        margin: 0;
        overflow-wrap: anywhere;
      }

      .wiki-page-toc ol {
        display: grid;
        gap: 2px;
        list-style: none;
        margin: 0 0 18px;
        padding: 0;
      }

      .wiki-empty {
        background: #f8f9fa;
        border: 1px solid var(--wiki-border-soft);
        color: var(--wiki-muted);
        padding: 12px;
      }

      @media (max-width: 1180px) {
        .wiki-layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .wiki-global-nav,
        .wiki-page-toc {
          border: 0;
          max-height: none;
          position: static;
        }

        .wiki-article {
          border: 0;
          padding: 22px;
        }
      }

      @media (max-width: 760px) {
        .wiki-masthead,
        .wiki-search-row,
        .wiki-portal-grid {
          grid-template-columns: 1fr;
        }

        .wiki-article {
          order: 1;
        }

        .wiki-global-nav {
          border-top: 1px solid var(--wiki-border-soft);
          order: 2;
        }

        .wiki-page-toc {
          border-top: 1px solid var(--wiki-border-soft);
          order: 3;
        }

        .wiki-page-tabs {
          justify-content: start;
          overflow-x: auto;
        }
      }
    `}</style>
  );
}

function GlobalNav({
  activePage,
  category,
  categoryCounts,
}: {
  activePage: WikiPage;
  category: string;
  categoryCounts: ReadonlyArray<readonly [string, number]>;
}) {
  return (
    <nav className="wiki-global-nav" aria-label="Orbit Wiki navigation">
      <section className="wiki-nav-block">
        <h2 className="wiki-nav-heading">导航</h2>
        <a
          aria-current={activePage.kind === "main" ? "page" : undefined}
          className="wiki-nav-button"
          href={knowledgeHomeHref}
        >
          主页面
        </a>
        <a
          aria-current={activePage.kind === "index" ? "page" : undefined}
          className="wiki-nav-button"
          href={indexPageHref}
        >
          文档索引
        </a>
        <a className="wiki-nav-link" href={homeSectionHref("recent-changes")}>最近更改</a>
        <a className="wiki-nav-link" href={homeSectionHref("learning-index")}>经验库</a>
      </section>

      <section className="wiki-nav-block">
        <h2 className="wiki-nav-heading">知识主题</h2>
        {ORBIT_KNOWLEDGE_MANIFEST.topicPages.map((topic) => (
          <a
            aria-current={
              activePage.kind === "topic" && activePage.id === topic.id
                ? "page"
                : undefined
            }
            className="wiki-nav-button"
            href={topicHref(topic.id)}
            key={topic.id}
          >
            {topic.titleZh}
          </a>
        ))}
      </section>

      <section className="wiki-nav-block">
        <h2 className="wiki-nav-heading">分类目录</h2>
        <a
          aria-current={activePage.kind === "index" && category === allFilter ? "page" : undefined}
          className="wiki-nav-button wiki-category-row"
          href={categoryHref(allFilter)}
        >
          <span>全部文档</span>
          <small>{ORBIT_KNOWLEDGE_MANIFEST.documents.length}</small>
        </a>
        {categoryCounts.map(([item, count]) => (
          <a
            aria-current={activePage.kind === "index" && category === item ? "page" : undefined}
            className="wiki-nav-button wiki-category-row"
            href={categoryHref(item)}
            key={item}
          >
            <span>{categoryLabel(item)}</span>
            <small>{count}</small>
          </a>
        ))}
      </section>
    </nav>
  );
}

function Masthead({
  activePage,
  query,
  setQuery,
}: {
  activePage: WikiPage;
  query: string;
  setQuery: (query: string) => void;
}) {
  return (
    <header className="wiki-masthead">
      <div className="wiki-brand">
        <span className="wiki-mark" aria-hidden="true">O</span>
        <div>
          <strong>Orbit 知识库</strong>
          <span>项目知识库</span>
        </div>
      </div>
      <label className="wiki-search">
        <span>搜索 Orbit Wiki</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题、路径、分类、审计依据"
          type="search"
          value={query}
        />
      </label>
      <div className="wiki-page-tabs" role="tablist" aria-label="页面视图">
        <a
          aria-current={activePage.kind !== "index" ? "page" : undefined}
          href={knowledgeHomeHref}
        >
          阅读
        </a>
        <a
          aria-current={activePage.kind === "index" ? "page" : undefined}
          href={indexPageHref}
        >
          索引
        </a>
        <a
          aria-current={activePage.kind === "history" ? "page" : undefined}
          href={homeSectionHref("recent-changes")}
        >
          历史
        </a>
      </div>
    </header>
  );
}

function PortalGrid() {
  return (
    <div className="wiki-portal-grid">
      {ORBIT_KNOWLEDGE_MANIFEST.topicPages.map((topic) => (
        <section className="wiki-portal" key={topic.id}>
          <a href={topicHref(topic.id)}>
            {topic.titleZh}
          </a>
          <p>{topic.summaryZh}</p>
          <code>{topic.path}</code>
        </section>
      ))}
    </div>
  );
}

function StatusBadges({ document }: { document: DocumentEntry }) {
  const status = documentStatus(document);
  const freshness = documentFreshness(document);
  const freshnessTone =
    freshness === "verified-current"
      ? "success"
      : freshness === "known-stale" || freshness === "needs-code-check"
        ? "warning"
        : "evidence";

  return (
    <span className="wiki-badge-row">
      <Badge tone={status === "current" ? "success" : "neutral"}>
        {statusLabels[status]}
      </Badge>
      <Badge tone={freshnessTone}>{freshnessLabels[freshness]}</Badge>
      <Badge tone="neutral">{categoryLabel(document.category)}</Badge>
    </span>
  );
}

function safeLinkTarget(href: string) {
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("http://") ||
    href.startsWith("https://")
  ) {
    return href;
  }

  return undefined;
}

const knowledgeHomeHref = "/dev/knowledge";
const indexPageHref = `${knowledgeHomeHref}?page=index`;

function documentHref(documentId: string) {
  return `/dev/knowledge?document=${encodeURIComponent(documentId)}`;
}

function topicHref(topicId: string) {
  return `${knowledgeHomeHref}?topic=${encodeURIComponent(topicId)}`;
}

function historyHref(historyId: string) {
  return `${knowledgeHomeHref}?history=${encodeURIComponent(historyId)}`;
}

function learningHref(learningId: string) {
  return `${knowledgeHomeHref}?learning=${encodeURIComponent(learningId)}`;
}

function categoryHref(category: string) {
  if (category === allFilter) return indexPageHref;

  return `${indexPageHref}&category=${encodeURIComponent(category)}`;
}

function homeSectionHref(sectionId: string) {
  return `${knowledgeHomeHref}#${sectionId}`;
}

function markdownWithoutDocumentTitle(markdown: string) {
  return markdown.replace(/^#\s+.+\n+/, "");
}

function RenderedMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      components={{
        a({ children, href }) {
          const safeHref = href ? safeLinkTarget(href) : undefined;

          return safeHref ? <a href={safeHref}>{children}</a> : <span>{children}</span>;
        },
        table({ children }) {
          return (
            <div className="wiki-document-table-scroll">
              <table>{children}</table>
            </div>
          );
        },
      }}
      remarkPlugins={[remarkGfm]}
    >
      {markdownWithoutDocumentTitle(markdown)}
    </ReactMarkdown>
  );
}

function DocumentIndex({
  documents,
  query,
  category,
  setCategory,
}: {
  documents: readonly DocumentEntry[];
  query: string;
  category: string;
  setCategory: (category: string) => void;
}) {
  const categoryCounts = countBy(ORBIT_KNOWLEDGE_MANIFEST.documents, (document) => document.category);
  return (
    <section id="document-index">
      <h2>文档索引</h2>
      <p>
        当前索引显示 {documents.length} / {ORBIT_KNOWLEDGE_MANIFEST.documents.length} 个文档。
        来源入口为 <code>{catalogEntryPath}</code>。
      </p>
      <div className="wiki-search-row">
        <label className="wiki-field">
          <span>当前搜索</span>
          <input readOnly value={query || "未输入搜索词"} />
        </label>
        <label className="wiki-field">
          <span>按类型筛选</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value={allFilter}>全部类型</option>
            {categoryCounts.map(([item, count]) => (
              <option key={item} value={item}>
                {categoryLabel(item)} ({count})
              </option>
            ))}
          </select>
        </label>
      </div>
      {documents.length ? (
        <table className="wiki-index-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>页面</th>
              <th style={{ width: "20%" }}>命名空间</th>
              <th>简介</th>
              <th style={{ width: "19%" }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>
                  <a href={documentHref(document.id)}>
                    {document.titleZh}
                  </a>
                  <br />
                  <code>{document.sourcePath}</code>
                </td>
                <td>{categoryLabel(document.category)}</td>
                <td>{document.summaryZh}</td>
                <td><StatusBadges document={document} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="wiki-empty">没有匹配当前搜索和筛选条件的文档。</p>
      )}
    </section>
  );
}

function DocumentContentSection({
  content,
}: {
  content: DocumentContentState | undefined;
}) {
  if (isDocumentContentLoaded(content)) {
    return (
      <section className="wiki-document-body" id="document-body">
        <h3>正文内容</h3>
        <p className="wiki-muted">
          已从 <code>{content.sourcePath}</code> 读取中文 Markdown 阅读版。
        </p>
        <div className="wiki-document-markdown">
          <RenderedMarkdown markdown={content.markdown} />
        </div>
      </section>
    );
  }

  if (content?.status === "error") {
    return (
      <section className="wiki-document-body" id="document-body">
        <h3>正文内容</h3>
        <p className="wiki-document-status wiki-document-status-error">{content.message}</p>
      </section>
    );
  }

  return (
    <section className="wiki-document-body" id="document-body">
      <h3>正文内容</h3>
      <p className="wiki-document-status">正在载入 Markdown 原文...</p>
    </section>
  );
}

function RecentChanges() {
  return (
    <section id="recent-changes">
      <h2>最近更改</h2>
      <dl className="wiki-change-list">
        {ORBIT_KNOWLEDGE_MANIFEST.recentHistory.map((entry) => (
          <div key={entry.id}>
            <dt>{entry.date}</dt>
            <dd>
              <a
                className="wiki-nav-button"
                href={historyHref(entry.id)}
              >
                {entry.titleZh}
              </a>
              {entry.summaryZh} <code>{entry.sourcePath}</code>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Learnings() {
  return (
    <section id="learning-index">
      <h2>经验库</h2>
      <dl className="wiki-learning-list">
        {ORBIT_KNOWLEDGE_MANIFEST.learnings.map((entry) => (
          <div key={entry.id}>
            <dt>
              <a
                className="wiki-nav-button"
                href={learningHref(entry.id)}
              >
                {entry.titleZh}
              </a>
            </dt>
            <dd>{entry.summaryZh} <code>{entry.sourcePath}</code></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WikiInfobox({
  activeDocument,
  filteredCount,
}: {
  activeDocument?: DocumentEntry;
  filteredCount: number;
}) {
  return (
    <aside className="wiki-infobox">
      <h2>页面信息</h2>
      <dl>
        <div>
          <dt>文档总数</dt>
          <dd>{ORBIT_KNOWLEDGE_MANIFEST.documents.length} 个文档</dd>
        </div>
        <div>
          <dt>当前索引</dt>
          <dd>{filteredCount} 个匹配条目</dd>
        </div>
        <div>
          <dt>需要代码核对</dt>
          <dd>
            {
              ORBIT_KNOWLEDGE_MANIFEST.documents.filter(
                (document) => documentFreshness(document) === "needs-code-check",
              ).length
            }
          </dd>
        </div>
        {activeDocument ? (
          <>
            <div>
              <dt>选中条目</dt>
              <dd>{activeDocument.titleZh}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd><code>{activeDocument.sourcePath}</code></dd>
            </div>
          </>
        ) : null}
      </dl>
    </aside>
  );
}

function PageToc({
  activeDocument,
  activePage,
  filteredCount,
}: {
  activeDocument?: DocumentEntry;
  activePage: WikiPage;
  filteredCount: number;
}) {
  const tocLinks =
    activePage.kind === "document"
      ? [
          ["#document-metadata", "页面信息"],
          ["#document-body", "正文内容"],
        ]
      : activePage.kind === "topic"
        ? [
            ["#overview", "主题概览"],
            ["#topic-source", "来源页面"],
            ["#document-index", "相关文档"],
          ]
        : activePage.kind === "index"
          ? [["#document-index", "文档索引"]]
          : activePage.kind === "history" || activePage.kind === "learning"
            ? [["#selected-page", "页面信息"]]
            : [
                ["#overview", "概览"],
                ["#topic-portals", "知识主题"],
                ["#document-index", "文档索引"],
                ["#recent-changes", "最近更改"],
                ["#learning-index", "经验库"],
              ];
  const toolLinks =
    activePage.kind === "document"
      ? [
          ["#document-metadata", "查看文档元信息"],
          ["#document-body", "返回正文顶部"],
        ]
      : activePage.kind === "main"
        ? [
            ["#document-index", "查看全部文档"],
            ["#recent-changes", "查看开发历史"],
            ["#learning-index", "查看排障经验"],
          ]
        : [["/dev/knowledge", "返回 Wiki 主页面"]];

  return (
    <aside className="wiki-page-toc" aria-label="页面目录">
      <WikiInfobox activeDocument={activeDocument} filteredCount={filteredCount} />
      <h2>页面目录</h2>
      <ol>
        {tocLinks.map(([href, label]) => (
          <li key={href}><a className="wiki-toc-link" href={href}>{label}</a></li>
        ))}
      </ol>
      <h2>页面工具</h2>
      <ol>
        {toolLinks.map(([href, label]) => (
          <li key={href}><a className="wiki-toc-link" href={href}>{label}</a></li>
        ))}
      </ol>
    </aside>
  );
}

function DocumentPageArticle({
  activeDocumentContent,
  document,
}: {
  activeDocumentContent?: DocumentContentState;
  document: DocumentEntry;
}) {
  return (
    <article className="wiki-article wiki-document-article">
      <div className="wiki-breadcrumbs">Orbit Wiki / 文档 / {document.titleZh}</div>
      <h1>{document.titleZh}</h1>
      <p className="wiki-lead">{document.summaryZh}</p>
      <section className="wiki-document-metadata" id="document-metadata">
        <h2>页面信息</h2>
        <dl>
          <div>
            <dt>来源路径</dt>
            <dd><code>{document.sourcePath}</code></dd>
          </div>
          <div>
            <dt>审计依据</dt>
            <dd>{document.reviewEvidenceZh}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd><StatusBadges document={document} /></dd>
          </div>
        </dl>
      </section>
      <DocumentContentSection content={activeDocumentContent} />
    </article>
  );
}

function TopicPageArticle({
  category,
  filteredDocuments,
  query,
  setCategory,
  topic,
}: {
  category: string;
  filteredDocuments: readonly DocumentEntry[];
  query: string;
  setCategory: (category: string) => void;
  topic: TopicEntry;
}) {
  const relatedDocuments = documentsForTopic(topic, filteredDocuments);

  return (
    <article className="wiki-article wiki-topic-article">
      <div className="wiki-breadcrumbs">Orbit Wiki / 知识主题 / {topic.titleZh}</div>
      <h1>{topic.titleZh}</h1>
      <section id="overview">
        <h2>主题概览</h2>
        <p className="wiki-lead">{topic.summaryZh}</p>
      </section>
      <section id="topic-source">
        <h2>来源页面</h2>
        <p>
          主题页来源为 <code>{topic.path}</code>。主题页用于组织阅读路径，具体事实仍以关联文档和代码为准。
        </p>
      </section>
      <DocumentIndex
        category={category}
        documents={relatedDocuments}
        query={query}
        setCategory={setCategory}
      />
    </article>
  );
}

function IndexArticle({
  category,
  filteredDocuments,
  query,
  setCategory,
}: {
  category: string;
  filteredDocuments: readonly DocumentEntry[];
  query: string;
  setCategory: (category: string) => void;
}) {
  return (
    <article className="wiki-article wiki-index-article">
      <div className="wiki-breadcrumbs">Orbit Wiki / 文档索引</div>
      <h1>文档索引</h1>
      <p className="wiki-lead">
        这里列出当前 catalog 中的全部文档入口。分类筛选和搜索可以缩小阅读范围，文档标题会打开独立正文页。
      </p>
      <DocumentIndex
        category={category}
        documents={filteredDocuments}
        query={query}
        setCategory={setCategory}
      />
    </article>
  );
}

function HistoryPageArticle({ entry }: { entry: HistoryEntry }) {
  return (
    <article className="wiki-article wiki-history-article">
      <div className="wiki-breadcrumbs">Orbit Wiki / 最近更改 / {entry.titleZh}</div>
      <h1>{entry.titleZh}</h1>
      <p className="wiki-lead">{entry.summaryZh}</p>
      <section className="wiki-document-metadata" id="selected-page">
        <h2>页面信息</h2>
        <dl>
          <div>
            <dt>日期</dt>
            <dd>{entry.date}</dd>
          </div>
          <div>
            <dt>来源路径</dt>
            <dd><code>{entry.sourcePath}</code></dd>
          </div>
          <div>
            <dt>返回入口</dt>
            <dd><a href={homeSectionHref("recent-changes")}>最近更改</a></dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

function LearningPageArticle({ entry }: { entry: LearningEntry }) {
  return (
    <article className="wiki-article wiki-learning-article">
      <div className="wiki-breadcrumbs">Orbit Wiki / 经验库 / {entry.titleZh}</div>
      <h1>{entry.titleZh}</h1>
      <p className="wiki-lead">{entry.summaryZh}</p>
      <section className="wiki-document-metadata" id="selected-page">
        <h2>页面信息</h2>
        <dl>
          <div>
            <dt>来源路径</dt>
            <dd><code>{entry.sourcePath}</code></dd>
          </div>
          <div>
            <dt>返回入口</dt>
            <dd><a href={homeSectionHref("learning-index")}>经验库</a></dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

function HomeArticle({
  category,
  filteredDocuments,
  query,
  setCategory,
}: {
  category: string;
  filteredDocuments: readonly DocumentEntry[];
  query: string;
  setCategory: (category: string) => void;
}) {
  return (
    <article className="wiki-article wiki-home-article">
      <div className="wiki-breadcrumbs">Orbit Wiki / 主页面</div>
      <h1>Orbit Wiki: 项目主页</h1>
      <p className="wiki-lead">{ORBIT_KNOWLEDGE_MANIFEST.summaryZh}</p>
      <section id="overview">
        <h2>概览</h2>
        <p>
          Orbit Wiki 把原始文档、知识主题、开发历史和经验库组织成一个可浏览的项目知识站。
          页面采用 wiki 式导航：左侧是全站目录，中间是文章和索引，右侧是页面目录和元信息。
        </p>
        <p>
          文档库当前收录 {ORBIT_KNOWLEDGE_MANIFEST.documents.length} 个文档，
          新鲜度审计中需要代码核对的条目为 {
            ORBIT_KNOWLEDGE_MANIFEST.documents.filter(
              (document) => documentFreshness(document) === "needs-code-check",
            ).length
          }。
        </p>
      </section>

      <section id="topic-portals">
        <h2>知识主题</h2>
        <PortalGrid />
      </section>

      <DocumentIndex
        category={category}
        documents={filteredDocuments}
        query={query}
        setCategory={setCategory}
      />

      <RecentChanges />
      <Learnings />
    </article>
  );
}

function WikiArticle({
  activeDocument,
  activeDocumentContent,
  activePage,
  category,
  filteredDocuments,
  historyPage,
  learningPage,
  query,
  setCategory,
  topicPage,
}: {
  activeDocument?: DocumentEntry;
  activeDocumentContent?: DocumentContentState;
  activePage: WikiPage;
  category: string;
  filteredDocuments: readonly DocumentEntry[];
  historyPage?: HistoryEntry;
  learningPage?: LearningEntry;
  query: string;
  setCategory: (category: string) => void;
  topicPage?: TopicEntry;
}) {
  if (activePage.kind === "document" && activeDocument) {
    return (
      <DocumentPageArticle
        activeDocumentContent={activeDocumentContent}
        document={activeDocument}
      />
    );
  }

  if (activePage.kind === "topic" && topicPage) {
    return (
      <TopicPageArticle
        category={category}
        filteredDocuments={filteredDocuments}
        query={query}
        setCategory={setCategory}
        topic={topicPage}
      />
    );
  }

  if (activePage.kind === "index") {
    return (
      <IndexArticle
        category={category}
        filteredDocuments={filteredDocuments}
        query={query}
        setCategory={setCategory}
      />
    );
  }

  if (activePage.kind === "history" && historyPage) {
    return <HistoryPageArticle entry={historyPage} />;
  }

  if (activePage.kind === "learning" && learningPage) {
    return <LearningPageArticle entry={learningPage} />;
  }

  return (
    <HomeArticle
      category={category}
      filteredDocuments={filteredDocuments}
      query={query}
      setCategory={setCategory}
    />
  );
}

export function OrbitKnowledgeWiki({
  initialDocumentContent,
  initialCategory,
  initialPage = { kind: "main" },
}: OrbitKnowledgeWikiProps = {}) {
  const activePage = initialPage;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory ?? allFilter);
  const [documentContents, setDocumentContents] = useState<
    Record<string, DocumentContentState>
  >(() =>
    initialDocumentContent
      ? { [initialDocumentContent.documentId]: initialDocumentContent.content }
      : {},
  );

  const categoryCounts = useMemo(
    () => countBy(ORBIT_KNOWLEDGE_MANIFEST.documents, (document) => document.category),
    [],
  );
  const filteredDocuments = useMemo(
    () =>
      ORBIT_KNOWLEDGE_MANIFEST.documents.filter(
        (document) =>
          matchesQuery(document, query.trim()) &&
          (category === allFilter || document.category === category),
      ),
    [category, query],
  );
  const activeDocument = readActiveDocument(activePage);
  const topicPage = readTopicPage(activePage);
  const historyPage = readHistoryPage(activePage);
  const learningPage = readLearningPage(activePage);
  const activeDocumentContent = activeDocument
    ? (documentContents[activeDocument.id] ?? { status: "idle" })
    : undefined;

  useEffect(() => {
    if (!activeDocument) return;

    const controller = new AbortController();
    const documentId = activeDocument.id;
    if (documentContents[documentId]?.status === "loaded") return;

    setDocumentContents((current) => ({
      ...current,
      [documentId]: { status: "loading" },
    }));

    void fetch(`/api/dev/knowledge/documents/${encodeURIComponent(documentId)}`, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(readApiErrorMessage(body));
        }

        return readDocumentContent(body);
      })
      .then((content) => {
        setDocumentContents((current) => ({
          ...current,
          [documentId]: content,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setDocumentContents((current) => ({
          ...current,
          [documentId]: {
            message: error instanceof Error ? error.message : "无法读取文档正文。",
            status: "error",
          },
        }));
      });

    return () => controller.abort();
  }, [activeDocument?.id]);

  return (
    <main
      className="wiki-frame"
      data-orbit-knowledge-wiki="true"
      data-wiki-page-kind={activePage.kind}
      data-wiki-shell="true"
    >
      <WikiStyles />
      <Masthead
        activePage={activePage}
        query={query}
        setQuery={setQuery}
      />
      <div className="wiki-layout">
        <GlobalNav
          activePage={activePage}
          category={category}
          categoryCounts={categoryCounts}
        />
        <WikiArticle
          activeDocument={activeDocument}
          activeDocumentContent={activeDocumentContent}
          activePage={activePage}
          category={category}
          filteredDocuments={filteredDocuments}
          historyPage={historyPage}
          learningPage={learningPage}
          query={query}
          setCategory={setCategory}
          topicPage={topicPage}
        />
        <PageToc
          activeDocument={activePage.kind === "document" ? activeDocument : undefined}
          activePage={activePage}
          filteredCount={filteredDocuments.length}
        />
      </div>
    </main>
  );
}
