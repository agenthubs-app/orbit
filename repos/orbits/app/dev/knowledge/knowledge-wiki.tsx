"use client";

import { useMemo, useState } from "react";
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../../shared/knowledge/knowledge-manifest";

const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const catalogEntryPath = ["knowledge", "docs", "catalog.zh.md"].join("/");
const allFilter = "all";

const statusTone = {
  current: "success",
  historical: "neutral",
  "needs-review": "warning",
  superseded: "warning",
  "generated-evidence": "evidence",
} as const;

const freshnessTone = {
  "verified-current": "success",
  "likely-current": "evidence",
  "needs-code-check": "warning",
  "known-stale": "warning",
} as const;

type FreshnessState = keyof typeof freshnessTone;
type KnowledgeManifest = typeof ORBIT_KNOWLEDGE_MANIFEST;
type DocumentEntry = KnowledgeManifest["documents"][number];
type TopicEntry = KnowledgeManifest["topicPages"][number];
type HistoryEntry = KnowledgeManifest["recentHistory"][number];
type LearningEntry = KnowledgeManifest["learnings"][number];
type KnowledgeNode =
  | (TopicEntry & { kind: "topic"; labelZh: "知识主题" })
  | (HistoryEntry & { kind: "history"; labelZh: "开发历史" })
  | (LearningEntry & { kind: "learning"; labelZh: "经验库" });

function zhCount(label: string, value: number) {
  return `${value} ${label}`;
}

function uniqueValues<TValue extends string>(
  documents: readonly DocumentEntry[],
  read: (document: DocumentEntry) => TValue,
) {
  return [...new Set(documents.map(read))].sort((a, b) => a.localeCompare(b));
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

function buildKnowledgeNodes(): KnowledgeNode[] {
  return [
    ...ORBIT_KNOWLEDGE_MANIFEST.topicPages.map((entry) => ({
      ...entry,
      kind: "topic" as const,
      labelZh: "知识主题" as const,
    })),
    ...ORBIT_KNOWLEDGE_MANIFEST.recentHistory.map((entry) => ({
      ...entry,
      kind: "history" as const,
      labelZh: "开发历史" as const,
    })),
    ...ORBIT_KNOWLEDGE_MANIFEST.learnings.map((entry) => ({
      ...entry,
      kind: "learning" as const,
      labelZh: "经验库" as const,
    })),
  ];
}

function MetricCards() {
  const documents: ReadonlyArray<{ freshness: FreshnessState }> =
    ORBIT_KNOWLEDGE_MANIFEST.documents;
  const needsCodeCheck = documents.filter(
    (document) => document.freshness === "needs-code-check",
  ).length;
  const knownStale = documents.filter(
    (document) => document.freshness === "known-stale",
  ).length;
  const verified = documents.filter(
    (document) => document.freshness === "verified-current",
  ).length;
  const metrics = [
    {
      label: "文档目录",
      value: documents.length,
      detail: "已纳入 catalog 的权威入口",
      tone: "evidence",
    },
    {
      label: "需要代码核对",
      value: needsCodeCheck,
      detail: "保守标记，后续逐批审计",
      tone: "warning",
    },
    {
      label: "已验证当前",
      value: verified,
      detail: "有测试或明确代码边界支撑",
      tone: "success",
    },
    {
      label: "已知过期",
      value: knownStale,
      detail: "保留历史背景，不作为当前权威",
      tone: "warning",
    },
  ] as const;

  return (
    <section className="workbench-grid" aria-label="知识库状态统计">
      {metrics.map((metric) => (
        <WorkbenchSurface key={metric.label} eyebrow={metric.label} title={String(metric.value)}>
          <p className="type-body">{metric.detail}</p>
          <Chip tone={metric.tone}>{zhCount("项", metric.value)}</Chip>
        </WorkbenchSurface>
      ))}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="knowledge-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={allFilter}>全部</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DocumentRow({
  document,
  active,
  onSelect,
}: {
  document: DocumentEntry;
  active: boolean;
  onSelect: (documentId: string) => void;
}) {
  return (
    <article className="knowledge-document-row" id={document.id}>
      <button
        aria-pressed={active}
        className="knowledge-document-button"
        onClick={() => onSelect(document.id)}
        type="button"
      >
        <span className="knowledge-document-title">{document.titleZh}</span>
        <span className="knowledge-document-summary">{document.summaryZh}</span>
        <span className="chip-row" aria-label={`${document.titleZh} 状态`}>
          <Chip tone={statusTone[document.status]}>{document.status}</Chip>
          <Chip tone={freshnessTone[document.freshness]}>
            {document.freshness}
          </Chip>
          <Chip tone="neutral">{document.category}</Chip>
        </span>
        <code style={pathWrapStyle}>{document.sourcePath}</code>
      </button>
    </article>
  );
}

function DocumentDetail({ document }: { document: DocumentEntry }) {
  return (
    <aside className="knowledge-detail" aria-label="条目详情">
      <p className="workbench-kicker">条目详情</p>
      <h2>{document.titleZh}</h2>
      <p className="type-body">{document.summaryZh}</p>
      <div className="chip-row" aria-label={`${document.titleZh} 详细状态`}>
        <Chip tone={statusTone[document.status]}>{document.status}</Chip>
        <Chip tone={freshnessTone[document.freshness]}>
          {document.freshness}
        </Chip>
        <Chip tone="evidence">{document.ownerArea}</Chip>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>来源路径</dt>
          <dd>
            <code style={pathWrapStyle}>{document.sourcePath}</code>
          </dd>
        </div>
        <div>
          <dt>审计依据</dt>
          <dd>{document.reviewEvidenceZh}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{document.category}</dd>
        </div>
      </dl>
    </aside>
  );
}

function KnowledgeNodeList({ nodes }: { nodes: readonly KnowledgeNode[] }) {
  return (
    <WorkbenchSurface eyebrow="知识库页面" title="主题、历史和经验同屏查看">
      <div className="knowledge-node-grid" aria-label="知识主题、开发历史和经验库">
        {nodes.map((node) => (
          <article className="relationship-record" key={`${node.kind}-${node.id}`}>
            <header>
              <Chip tone={node.kind === "topic" ? "success" : "evidence"}>
                {node.labelZh}
              </Chip>
              <h3>{"date" in node ? `${node.date} · ${node.titleZh}` : node.titleZh}</h3>
            </header>
            <p className="type-body">{node.summaryZh}</p>
            <code style={pathWrapStyle}>
              {"path" in node ? node.path : node.sourcePath}
            </code>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function KnowledgeExplorer() {
  const documents = ORBIT_KNOWLEDGE_MANIFEST.documents;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(allFilter);
  const [status, setStatus] = useState(allFilter);
  const [freshness, setFreshness] = useState(allFilter);
  const [selectedId, setSelectedId] = useState(documents[0]?.id ?? "");

  const categories = useMemo(
    () => uniqueValues(documents, (document) => document.category),
    [documents],
  );
  const statuses = useMemo(
    () => uniqueValues(documents, (document) => document.status),
    [documents],
  );
  const freshnessValues = useMemo(
    () => uniqueValues(documents, (document) => document.freshness),
    [documents],
  );
  const filteredDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          matchesQuery(document, query.trim()) &&
          (category === allFilter || document.category === category) &&
          (status === allFilter || document.status === status) &&
          (freshness === allFilter || document.freshness === freshness),
      ),
    [category, documents, freshness, query, status],
  );
  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedId) ??
    documents.find((document) => document.id === selectedId) ??
    filteredDocuments[0] ??
    documents[0];
  const nodes = useMemo(() => buildKnowledgeNodes(), []);

  return (
    <>
      <WorkbenchSurface elevated eyebrow="文档浏览器" title="全部 146 个文档">
        <p className="type-body">
          <code>{catalogEntryPath}</code> 是统一文档查询入口。这里可以查看全部文档、
          知识主题、开发历史和经验库，每条都保留来源路径、状态、新鲜度和审计依据。
        </p>

        <div className="knowledge-controls" role="search" aria-label="搜索文档和知识">
          <label className="knowledge-search">
            <span>搜索文档和知识</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入标题、路径、分类、审计依据"
              type="search"
              value={query}
            />
          </label>
          <FilterSelect
            label="按类型筛选"
            onChange={setCategory}
            options={categories}
            value={category}
          />
          <FilterSelect
            label="按状态筛选"
            onChange={setStatus}
            options={statuses}
            value={status}
          />
          <FilterSelect
            label="按新鲜度筛选"
            onChange={setFreshness}
            options={freshnessValues}
            value={freshness}
          />
        </div>

        <div className="knowledge-explorer" data-knowledge-explorer="true">
          <nav className="knowledge-sidebar" aria-label="知识库导航">
            <a href="#knowledge-documents">文档库 {documents.length}</a>
            <a href="#knowledge-nodes">知识主题 {ORBIT_KNOWLEDGE_MANIFEST.topicPages.length}</a>
            <a href="#knowledge-history">开发历史 {ORBIT_KNOWLEDGE_MANIFEST.recentHistory.length}</a>
            <a href="#knowledge-learnings">经验库 {ORBIT_KNOWLEDGE_MANIFEST.learnings.length}</a>
            {categories.map((item) => (
              <button
                aria-pressed={category === item}
                key={item}
                onClick={() => setCategory(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>

          <section className="knowledge-document-list" id="knowledge-documents">
            <header>
              <p className="workbench-kicker">文档库</p>
              <h2>{filteredDocuments.length} / {documents.length}</h2>
            </header>
            {filteredDocuments.map((document) => (
              <DocumentRow
                active={selectedDocument?.id === document.id}
                document={document}
                key={document.id}
                onSelect={setSelectedId}
              />
            ))}
          </section>

          {selectedDocument ? <DocumentDetail document={selectedDocument} /> : null}
        </div>
      </WorkbenchSurface>

      <div id="knowledge-nodes">
        <KnowledgeNodeList nodes={nodes} />
      </div>
    </>
  );
}

function HistoryAndLearnings() {
  return (
    <section className="workbench-grid" aria-label="开发历史和排障经验">
      <WorkbenchSurface eyebrow="开发历史" title="修改为什么发生">
        <dl className="relationship-meta">
          {ORBIT_KNOWLEDGE_MANIFEST.recentHistory.map((entry) => (
            <div key={entry.id}>
              <dt>{entry.date} · {entry.titleZh}</dt>
              <dd>
                {entry.summaryZh} <code style={pathWrapStyle}>{entry.sourcePath}</code>
              </dd>
            </div>
          ))}
        </dl>
      </WorkbenchSurface>

      <WorkbenchSurface eyebrow="排障经验" title="先查经验，再查日志">
        <dl className="relationship-meta">
          {ORBIT_KNOWLEDGE_MANIFEST.learnings.map((entry) => (
            <div key={entry.id}>
              <dt>{entry.titleZh}</dt>
              <dd>
                {entry.summaryZh} <code style={pathWrapStyle}>{entry.sourcePath}</code>
              </dd>
            </div>
          ))}
        </dl>
      </WorkbenchSurface>
    </section>
  );
}

function KnowledgeExplorerStyles() {
  return (
    <style>{`
      .knowledge-controls {
        align-items: end;
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(150px, 0.65fr));
        margin: 18px 0 20px;
      }

      .knowledge-search,
      .knowledge-filter {
        display: grid;
        gap: 7px;
        min-width: 0;
      }

      .knowledge-search span,
      .knowledge-filter span {
        color: var(--text-3);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0;
      }

      .knowledge-search input,
      .knowledge-filter select {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text-1);
        font: inherit;
        min-height: 42px;
        min-width: 0;
        padding: 10px 12px;
        width: 100%;
      }

      .knowledge-explorer {
        align-items: start;
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(160px, 0.55fr) minmax(320px, 1.25fr) minmax(280px, 0.9fr);
      }

      .knowledge-sidebar {
        border: 1px solid var(--border);
        border-radius: 8px;
        display: grid;
        gap: 6px;
        max-height: 720px;
        overflow: auto;
        padding: 10px;
      }

      .knowledge-sidebar a,
      .knowledge-sidebar button {
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: var(--text-2);
        cursor: pointer;
        display: block;
        font: inherit;
        font-size: 0.86rem;
        line-height: 1.35;
        min-height: 36px;
        padding: 8px 10px;
        text-align: left;
        text-decoration: none;
      }

      .knowledge-sidebar button[aria-pressed="true"],
      .knowledge-sidebar a:focus-visible,
      .knowledge-sidebar button:focus-visible,
      .knowledge-document-button:focus-visible {
        background: var(--surface-2);
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .knowledge-document-list {
        border: 1px solid var(--border);
        border-radius: 8px;
        display: grid;
        max-height: 720px;
        overflow: auto;
      }

      .knowledge-document-list > header {
        align-items: center;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        padding: 14px 16px;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .knowledge-document-list h2,
      .knowledge-detail h2 {
        font-size: 1.25rem;
        letter-spacing: 0;
        line-height: 1.2;
        margin: 0;
      }

      .knowledge-document-row {
        border-bottom: 1px solid var(--border);
      }

      .knowledge-document-row:last-child {
        border-bottom: 0;
      }

      .knowledge-document-button {
        background: transparent;
        border: 0;
        color: inherit;
        cursor: pointer;
        display: grid;
        gap: 9px;
        padding: 14px 16px;
        text-align: left;
        width: 100%;
      }

      .knowledge-document-button[aria-pressed="true"] {
        background: var(--surface-2);
      }

      .knowledge-document-title {
        color: var(--text-1);
        font-size: 0.98rem;
        font-weight: 750;
        line-height: 1.35;
      }

      .knowledge-document-summary {
        color: var(--text-2);
        font-size: 0.9rem;
        line-height: 1.45;
      }

      .knowledge-detail {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        display: grid;
        gap: 12px;
        max-height: 720px;
        overflow: auto;
        padding: 16px;
        position: sticky;
        top: 18px;
      }

      .knowledge-node-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      @media (max-width: 1080px) {
        .knowledge-controls,
        .knowledge-explorer,
        .knowledge-node-grid {
          grid-template-columns: 1fr;
        }

        .knowledge-sidebar,
        .knowledge-document-list,
        .knowledge-detail {
          max-height: none;
        }

        .knowledge-detail {
          position: static;
        }
      }
    `}</style>
  );
}

export function OrbitKnowledgeWiki() {
  return (
    <WorkbenchFrame>
      <KnowledgeExplorerStyles />
      <div className="workbench-shell" data-orbit-knowledge-wiki="true">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer knowledge base</p>
          <h1>Orbit 知识库</h1>
          <p className="workbench-intro">
            从一个入口查看文档库、知识主题、开发历史和排障经验。这个页面只读取
            app-local manifest，不直接访问根目录知识文件。
          </p>
        </header>

        <MetricCards />
        <KnowledgeExplorer />
        <div id="knowledge-history">
          <HistoryAndLearnings />
        </div>
        <span id="knowledge-learnings" aria-hidden="true" />
      </div>
    </WorkbenchFrame>
  );
}
