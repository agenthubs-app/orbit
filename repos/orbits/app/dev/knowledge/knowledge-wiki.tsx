import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../../shared/knowledge/knowledge-manifest";

const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const catalogEntryPath = ["knowledge", "docs", "catalog.zh.md"].join("/");

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

function zhCount(label: string, value: number) {
  return `${value} ${label}`;
}

function MetricCards() {
  const documents = ORBIT_KNOWLEDGE_MANIFEST.documents;
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
      detail: "已纳入首版 catalog 的权威入口",
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

function DocumentCatalog() {
  const priorityDocuments = ORBIT_KNOWLEDGE_MANIFEST.documents.slice(0, 12);

  return (
    <WorkbenchSurface elevated eyebrow="文档库入口" title="先看状态，再进原文">
      <p className="type-body">
        <code>{catalogEntryPath}</code> 是统一文档查询入口。这里展示首批高价值文档，
        每条都保留来源路径、状态和新鲜度。
      </p>
      <div className="workbench-grid" aria-label="知识库文档目录">
        {priorityDocuments.map((document) => (
          <article className="relationship-record" key={document.id}>
            <h3>{document.titleZh}</h3>
            <p className="type-body">{document.summaryZh}</p>
            <div className="chip-row" aria-label={`${document.titleZh} 状态`}>
              <Chip tone={statusTone[document.status]}>{document.status}</Chip>
              <Chip tone={freshnessTone[document.freshness]}>
                {document.freshness}
              </Chip>
            </div>
            <code style={pathWrapStyle}>{document.sourcePath}</code>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function TopicPages() {
  return (
    <WorkbenchSurface eyebrow="核心知识主题" title="按问题进入，而不是按目录翻找">
      <div className="workbench-grid" aria-label="知识主题入口">
        {ORBIT_KNOWLEDGE_MANIFEST.topicPages.map((topic) => (
          <article className="relationship-record" key={topic.id}>
            <h3>{topic.titleZh}</h3>
            <p className="type-body">{topic.summaryZh}</p>
            <code style={pathWrapStyle}>{topic.path}</code>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
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

export function OrbitKnowledgeWiki() {
  return (
    <WorkbenchFrame>
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
        <DocumentCatalog />
        <TopicPages />
        <HistoryAndLearnings />
      </div>
    </WorkbenchFrame>
  );
}
