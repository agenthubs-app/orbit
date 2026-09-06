# Orbit Data Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个用虚构联系人解释 Orbit 当前数据格式的中文私有 Sites 站点。

**Architecture:** 独立单页项目，静态内置讲解与演示数据；React 管理阅读视图切换。
不连接 Orbit 后端，不复制业务源码。流程图展示存储到业务服务后分向 Web 与 iOS 的路径。

**Tech Stack:** 官方 Sites scaffold、React、TypeScript、已安装的 shadcn tabs、Lucide、CSS。

**Spec:** `docs/superpowers/specs/2026-09-06-data-journey-sites-design.md` v1，用户已确认。

## Global Constraints

- 中文、默认私有、虚构数据；无真实联系人、账号、密钥或连接地址。
- 不加入登录系统、编辑器、搜索后台、持久化、上传、外部数据源或生产写入能力。
- 不改 Orbit 产品界面；仅站点负责代理拥有 Sites 生命周期。
- 桌面并排比较，手机顺序堆叠；无装饰图片、渐变或卡片堆叠。
- 首个可识别版本先提供本地预览；本轮不执行浏览器截图或 DOM 检查。

## Task 1: 数据旅程主界面与首个预览

**Files:** 新站点 `/Users/xzhao/Projects/orbit-data-guide` 的 `app/page.tsx`、
`app/globals.css`、`app/layout.tsx`、`app/guide-data.ts`、`tests/guide.test.mjs`、
`.openai/hosting.json`。沿用 scaffold 的配置与包管理器。

**Interfaces:** `GuidePage()` 渲染页面；`journeyStages` 提供三个固定视图的标题、
JSON 节选和字段注释；联系人演示 ID 为 `contact_demo_01`，显示名为「林晓（虚构）」。

- [x] 建立空目录并运行官方 initializer（shadcn），注册一次私有 Site，立即保存 project_id。
- [x] 用现有 Vite SSR 加载能力编写主页面渲染测试，先对 scaffold 验证失败：
  ```js
  assert.match(html, /Orbit 数据格式/);
  assert.match(html, /林晓（虚构）/);
  assert.match(html, /数据库记录/);
  ```
- [x] 核对源码中的字段和状态，写入三层数据示例；使用数据驱动的 shadcn Tabs：
  ```tsx
  <Tabs defaultValue="storage">
    <TabsList>{journeyStages.map(stage => <TabsTrigger key={stage.id} value={stage.id}>{stage.title}</TabsTrigger>)}</TabsList>
    {journeyStages.map(stage => <TabsContent key={stage.id} value={stage.id}><pre>{JSON.stringify(stage.sample, null, 2)}</pre></TabsContent>)}
  </Tabs>
  ```
- [x] 实现标题、真实分支流程、主示例及明确的虚构/节选标识。设置白、深灰、蓝、绿主题；正文 16px，不按视口缩放字号。
- [x] 运行渲染测试并修复；保留 dev session，对实际 Local URL 发一次 GET，成功后用可用的用户预览工具打开，之后才扩充内容。

## Task 2: 完整解释、验证与私有发布

**Files:** 继续修改 `app/page.tsx`、`app/globals.css`、`app/guide-data.ts`、
`tests/guide.test.mjs`；按静态输出需要修改已有构建配置。

**Interfaces:** `responseExamples` 固定三个状态；`fieldGroups` 分身份、来源、字典、状态；
所有展示数据静态内置，不调用生产 API。

- [x] 添加行为断言，先证明当前主界面未覆盖响应和边界：
  ```js
  assert.match(html, /部分数据不可用/);
  assert.match(html, /unavailableSections/);
  assert.match(html, /event_ops_events/);
  assert.match(html, /不是同一个 status/);
  ```
- [x] 实现成功、部分可用、失败响应切换；清楚区分普通 envelope 与版本化聚合 Schema。
  字段表使用稳定 ID，分别解释 actor、workspace、record 和 event。补齐独立活动表及运行时校验覆盖边界。
- [x] 扩展测试校验三个层级 ID 对应、每个响应状态有完整讲解、所有切换面板独立渲染正确内容。
  对缺失演示状态、误用 status 或 ID 的情况使用手工预期断言，不从实现生成预期值。
- [x] 完成响应式布局、长代码换行、键盘焦点和减少动态效果；运行定向测试与生产构建。
- [x] 检查仅有演示数据，提交独立 Site 的已验证源码；使用临时凭据按命令推送，打包并保存版本，私有发布。
- [x] 确认发布成功，更新同一预览到最终 URL，停止本地 dev session，交付私有链接。

## 验收对应

Task 1 覆盖三层数据、两条客户端路径、虚构示例与早期预览；Task 2 覆盖三种响应、
词典、领域边界、测试、构建和私有发布。运行中发现的工具差异可按既有能力调整，
不改变隐私、内容范围或已确认的交互设计。

## Delivery Record

- 私有站点：https://orbit-data-journey.agenthubs-app.chatgpt.site
- 定向测试 9/9 通过，TypeScript 检查通过，静态生产构建成功（2 routes，0 skipped）。
- 只读审查指出的窄屏 JSON 高度分配与辅助文字对比度问题已修复，并添加先失败后通过的回归检查。
- 浏览器只用于打开预览和更新最终地址；未执行浏览器交互、截图或 DOM 验证。
- 本地开发曾出现虚拟入口动态导入错误，重启后 GET 恢复 200；不将此视为浏览器交互验证通过。
- 官方 scaffold 的依赖审计仍有 11 项告警，记录在独立站点 README；发布内容仅为静态产物，没有服务端函数或图像处理端点。
