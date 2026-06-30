#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(
  readFileSync(join(projectRoot, "knowledge/docs/catalog.json"), "utf8"),
);

function summaryFrom(path, fallback) {
  const text = readFileSync(join(projectRoot, path), "utf8");
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("#"));
  return paragraphs[0] ?? fallback;
}

const manifest = {
  schemaVersion: catalog.schemaVersion,
  generatedOn: catalog.generatedOn,
  titleZh: "Orbit 知识库",
  summaryZh: summaryFrom(
    "knowledge/index.zh.md",
    "Orbit 项目的结构化中文知识入口。",
  ),
  documents: catalog.documents.slice(0, 60).map((entry) => ({
    id: entry.id,
    titleZh: entry.titleZh,
    summaryZh: entry.summaryZh,
    sourcePath: entry.sourcePath,
    category: entry.category,
    status: entry.status,
    freshness: entry.freshness,
    ownerArea: entry.ownerArea,
  })),
  topicPages: [
    {
      id: "project-overview",
      titleZh: "项目总览",
      path: "knowledge/wiki/project-overview.zh.md",
      summaryZh: summaryFrom(
        "knowledge/wiki/project-overview.zh.md",
        "Orbit 项目的产品目标和来源文档。",
      ),
    },
    {
      id: "architecture",
      titleZh: "架构总览",
      path: "knowledge/wiki/architecture.zh.md",
      summaryZh: summaryFrom(
        "knowledge/wiki/architecture.zh.md",
        "Orbit 的模块化架构和服务边界。",
      ),
    },
    {
      id: "agent-system",
      titleZh: "Agent 系统",
      path: "knowledge/wiki/agent-system.zh.md",
      summaryZh: summaryFrom(
        "knowledge/wiki/agent-system.zh.md",
        "Orbit AI 和 Agent action 的安全边界。",
      ),
    },
    {
      id: "data-and-mockdata",
      titleZh: "数据与 Mockdata",
      path: "knowledge/wiki/data-and-mockdata.zh.md",
      summaryZh: summaryFrom(
        "knowledge/wiki/data-and-mockdata.zh.md",
        "本地远端数据边界和 mockdata 生成链路。",
      ),
    },
    {
      id: "harness",
      titleZh: "Harness",
      path: "knowledge/wiki/harness.zh.md",
      summaryZh: summaryFrom(
        "knowledge/wiki/harness.zh.md",
        "长跑 harness、sprint contract 和 evidence 规则。",
      ),
    },
    {
      id: "modules",
      titleZh: "模块地图",
      path: "knowledge/wiki/modules.zh.md",
      summaryZh: summaryFrom(
        "knowledge/wiki/modules.zh.md",
        "Orbit 业务模块分组和阅读顺序。",
      ),
    },
  ],
  recentHistory: [
    {
      id: "knowledge-wiki-design",
      date: "2026-06-30",
      titleZh: "设计 Orbit 文档库与知识库",
      summaryZh:
        "建立文档 catalog、知识库、开发历史、learnings 索引和 /dev/knowledge 页面目标。",
      sourcePath: "knowledge/history/development-log.zh.md",
    },
  ],
  learnings: [
    {
      id: "troubleshooting",
      titleZh: "排障知识",
      summaryZh: "Orbit AI trace loading、provider timeout 和 responsive submit 控件经验。",
      sourcePath: "knowledge/learnings/troubleshooting.zh.md",
    },
    {
      id: "errors",
      titleZh: "错误记录",
      summaryZh: "依赖缺失、tsx eval、迁移脚本和 git diff 正则等错误记录。",
      sourcePath: "knowledge/learnings/errors.zh.md",
    },
    {
      id: "patterns",
      titleZh: "复用模式",
      summaryZh: "framework/mock/live 解耦、提交范围检查和注释提交卫生。",
      sourcePath: "knowledge/learnings/patterns.zh.md",
    },
  ],
};

const outPath = join(
  projectRoot,
  "repos/orbits/shared/knowledge/knowledge-manifest.ts",
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  [
    "export const ORBIT_KNOWLEDGE_MANIFEST = ",
    JSON.stringify(manifest, null, 2),
    " as const;\n",
  ].join(""),
);

console.log(`Wrote ${outPath}`);
