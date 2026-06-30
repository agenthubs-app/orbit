#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = join(projectRoot, "knowledge/docs/catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const headingTerms = [
  ["Implementation", "实现"],
  ["Implemented", "已实现"],
  ["Change", "变更"],
  ["Changes", "变更"],
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
  ["Mode", "模式"],
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
  ["Artifact", "Artifact"],
  ["Artifacts", "Artifacts"],
  ["Producer", "Producer"],
  ["Producers", "Producers"],
  ["Rule", "规则"],
  ["Rules", "规则"],
  ["Integration", "集成"],
  ["Manual", "手动"],
  ["Acceptance", "验收"],
  ["Criteria", "标准"],
  ["Current", "当前"],
  ["How", "如何"],
  ["To", ""],
  ["Read", "阅读"],
  ["This", ""],
  ["Document", "文档"],
  ["Record", "记录"],
  ["Code", "代码"],
  ["Fact", "事实"],
  ["Facts", "事实"],
  ["Request", "请求"],
  ["Execution", "执行"],
  ["Path", "路径"],
  ["Flow", "链路"],
  ["Loop", "循环"],
  ["Step", "步骤"],
  ["Steps", "步骤"],
  ["Measurement", "测量"],
  ["Measurements", "测量"],
  ["Finding", "发现"],
  ["Findings", "发现"],
  ["Why", "为什么"],
  ["It", ""],
  ["Can", "会"],
  ["Still", "仍然"],
  ["Feel", "感觉"],
  ["Like", "像"],
  ["Cannot", "不能"],
  ["Click", "点击"],
  ["Remaining", "剩余"],
  ["Optimization", "优化"],
  ["Candidate", "候选项"],
  ["Candidates", "候选项"],
  ["Future", "后续"],
  ["Next", "下一步"],
  ["Summary", "摘要"],
  ["Page", "页面"],
  ["Trace", "Trace"],
  ["Debug", "Debug"],
  ["Method", "方法"],
  ["Selection", "选择"],
  ["Detection", "检测"],
  ["Render", "渲染"],
  ["Extensibility", "扩展性"],
  ["Safety", "安全"],
  ["Handling", "处理"],
  ["Strategy", "策略"],
  ["And", "和"],
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

  localized = localized.replace(/\s+/g, " ").trim();

  return hasChinese(localized) ? localized : `源标题：${localized || heading}`;
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

function renderReadingGuide(entry, headings) {
  const sourceAuthority =
    entry.status === "historical" || entry.status === "superseded"
      ? "这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。"
      : "这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。";
  const freshness =
    entry.freshness === "verified-current"
      ? "已和代码或测试做过明确核对。"
      : entry.freshness === "known-stale"
        ? "已知存在过期内容，阅读时只保留历史参考价值。"
        : entry.freshness === "needs-code-check"
          ? "还需要继续和代码核对，不能直接作为实现事实引用。"
          : "已登记来源和关联代码，但后续改动仍需要重新核对。";
  const outline =
    headings.length > 0
      ? "下方“结构化阅读入口”按原文标题列出阅读顺序。"
      : "源文档没有清晰标题时，优先读中文摘要、审计依据和保留的代码证据。";

  return [sourceAuthority, freshness, outline].join("\n\n");
}

function renderSourceBody(sourceMarkdown) {
  if (!shouldPreserveFullSource(sourceMarkdown)) {
    return [
      "## 源文档正文",
      "",
      "源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。",
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
    "本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。",
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
    "## 怎么读",
    "",
    renderReadingGuide(entry, headings),
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
