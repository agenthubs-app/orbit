#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = join(projectRoot, "knowledge/docs/catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const headingTerms = [
  ["Implementation", "实现"],
  ["Architecture", "架构"],
  ["Overview", "概览"],
  ["Context", "上下文"],
  ["Goal", "目标"],
  ["Goals", "目标"],
  ["Plan", "计划"],
  ["Task", "任务"],
  ["Tasks", "任务"],
  ["Test", "测试"],
  ["Tests", "测试"],
  ["Verification", "验证"],
  ["Verifier", "验证器"],
  ["Generator", "生成器"],
  ["Planner", "规划器"],
  ["Evaluator", "评估器"],
  ["Design", "设计"],
  ["Data", "数据"],
  ["Schema", "结构"],
  ["API", "API"],
  ["Route", "路由"],
  ["Routes", "路由"],
  ["Service", "服务"],
  ["Services", "服务"],
  ["Provider", "Provider"],
  ["Providers", "Providers"],
  ["Mock", "Mock"],
  ["Live", "Live"],
  ["Hybrid", "Hybrid"],
  ["Runtime", "运行时"],
  ["State", "状态"],
  ["Error", "错误"],
  ["Errors", "错误"],
  ["Known", "已知"],
  ["Issue", "问题"],
  ["Issues", "问题"],
  ["Learning", "经验"],
  ["Learnings", "经验"],
  ["README", "说明"],
  ["Prompt", "提示词"],
  ["Capability", "能力"],
  ["Capabilities", "能力"],
  ["Module", "模块"],
  ["Modules", "模块"],
  ["Relationship", "关系"],
  ["Relationships", "关系"],
  ["Contact", "联系人"],
  ["Contacts", "联系人"],
  ["Event", "活动"],
  ["Events", "活动"],
  ["Agent", "Agent"],
  ["Chat", "Chat"],
  ["Search", "搜索"],
  ["Dashboard", "Dashboard"],
  ["Profile", "Profile"],
  ["Recommendation", "推荐"],
  ["Recommendations", "推荐"],
  ["Notification", "通知"],
  ["Notifications", "通知"],
  ["Permission", "权限"],
  ["Permissions", "权限"],
  ["Followup", "跟进"],
  ["Followups", "跟进"],
  ["Audit", "审计"],
  ["Bootstrap", "Bootstrap"],
  ["Acquisition", "获取"],
  ["Boundary", "边界"],
  ["Boundaries", "边界"],
  ["Contract", "契约"],
  ["Contracts", "契约"],
  ["Integration", "集成"],
  ["Manual", "手动"],
  ["Acceptance", "验收"],
  ["Current", "当前"],
  ["Future", "后续"],
  ["Next", "下一步"],
  ["Summary", "摘要"],
  ["Notes", "记录"],
  ["Product", "产品"],
  ["Sprint", "Sprint"],
  ["Harness", "Harness"],
  ["Local", "本地"],
  ["Remote", "远端"],
  ["Database", "数据库"],
  ["Knowledge", "知识"],
  ["Wiki", "Wiki"],
];

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function countChineseCharacters(value) {
  return [...value].filter((character) => /[\u3400-\u9fff]/.test(character)).length;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function stripCodeFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function readHeadings(markdown) {
  return stripCodeFences(markdown)
    .split("\n")
    .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => match[2].replace(/#+$/, "").trim())
    .filter(Boolean);
}

function localizeHeading(heading, index) {
  if (hasChinese(heading)) return heading;

  let localized = heading
    .replace(/[`*_#[\]()]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [from, to] of headingTerms) {
    localized = localized.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
  }

  return hasChinese(localized) ? localized : `源文档第 ${index + 1} 个标题`;
}

function readCodeFences(markdown) {
  return markdown.match(/```[\s\S]*?```/g) ?? [];
}

function stripLeadingTitle(markdown) {
  return markdown.replace(/^#\s+.+\n+/, "").trim();
}

function shouldPreserveFullSource(markdown) {
  return countChineseCharacters(stripCodeFences(markdown)) >= 20;
}

function renderHeadingOutline(headings) {
  if (!headings.length) {
    return "- 源文档没有显式 Markdown 标题；阅读时以中文摘要和审计依据为入口。\n";
  }

  return headings
    .slice(0, 80)
    .map((heading, index) => `- 第 ${index + 1} 节：${localizeHeading(heading, index)}`)
    .join("\n");
}

function renderCodeEvidence(codeFences) {
  if (!codeFences.length) {
    return "源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。\n";
  }

  return codeFences
    .map((block, index) => [`### 代码证据 ${index + 1}`, "", block].join("\n"))
    .join("\n\n");
}

function renderSourceBody(sourceMarkdown) {
  if (!shouldPreserveFullSource(sourceMarkdown)) {
    return [
      "## 源文档正文",
      "",
      "该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。",
    ].join("\n");
  }

  const body = stripLeadingTitle(sourceMarkdown);
  if (!body) {
    return [
      "## 源文档正文",
      "",
      "源文档除标题外没有可追加的正文内容。",
    ].join("\n");
  }

  return ["## 源文档正文", "", body].join("\n");
}

function renderMirror(entry, sourceMarkdown) {
  const headings = readHeadings(sourceMarkdown);
  const codeFences = readCodeFences(sourceMarkdown);

  return [
    `# ${entry.titleZh}`,
    "",
    "本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。",
    "",
    "## 页面元信息",
    "",
    "| 字段 | 内容 |",
    "| --- | --- |",
    `| 原始来源 | \`${escapeTable(entry.sourcePath)}\` |`,
    `| 中文镜像 | \`${escapeTable(entry.localizedSourcePath)}\` |`,
    `| 分类 | \`${escapeTable(entry.category)}\` |`,
    `| 状态 | \`${escapeTable(entry.status)}\` |`,
    `| 新鲜度 | \`${escapeTable(entry.freshness)}\` |`,
    `| 负责人域 | \`${escapeTable(entry.ownerArea)}\` |`,
    "",
    "## 中文摘要",
    "",
    entry.summaryZh,
    "",
    "## 审计依据",
    "",
    entry.reviewEvidenceZh,
    "",
    "## 结构化阅读入口",
    "",
    renderHeadingOutline(headings),
    "",
    "## 保留的代码与命令证据",
    "",
    renderCodeEvidence(codeFences),
    "",
    renderSourceBody(sourceMarkdown),
    "",
  ].join("\n");
}

let written = 0;

for (const entry of catalog.documents) {
  if (!entry.localizedSourcePath) {
    throw new Error(`${entry.id} is missing localizedSourcePath`);
  }

  const sourcePath = join(projectRoot, entry.sourcePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`${entry.sourcePath} does not exist`);
  }

  const localizedPath = join(projectRoot, entry.localizedSourcePath);
  mkdirSync(dirname(localizedPath), { recursive: true });
  writeFileSync(
    localizedPath,
    renderMirror(entry, readFileSync(sourcePath, "utf8")),
  );
  written += 1;
}

console.log(`Wrote ${written} Chinese document mirrors.`);
