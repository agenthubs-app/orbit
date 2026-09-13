# 名片准备进度补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 沿用本会话原地、逐批执行，不提交或推送。

**Goal:** 补齐真实 `/contacts/new/import/[id]`，解除现有路由基线失败，随后继续整个 Ink & Signal 改版。

**Architecture:** 新增原生进度页，读取已有 preparation API。仅在此消费者内部把该接口的 `{data}` / `{error}` 响应适配到现有 HTTP client，不修改通用 client 或 Web。已登录、前台、聚焦、当前身份的读取结果才允许取消或进入批量确认。

**Tech Stack:** Expo Router 57、React Native 0.86、React 19、TypeScript、Node test + 现有 esbuild/Playwright 交互测试方式。

**Spec:** [已选定设计及页面映射](../../designs/2026-09-12-ink-signal/README.md)。用户 2026-09-12 补充：“我们的功能为主。如果有缺口的地方，你就仿照它的设计去补足就可以了。”

## Global Constraints

- 只编辑 `repos/orbit-app`；不访问业务数据库，不修改后端或生成契约副本，不新增依赖。
- 原始 ZIP 的 1c / 2a / 3a 为已批准视觉源；进度页沿用 3a 名片导入的白底、黑字、蓝强调、行式信息及黑色主按钮。
- 后台仍负责文件准备、状态机、权限及取消冲突；App 不自行创建联系人，不把准备完成说成识别/保存完成。
- 缺失公共 DTO 留作 App 交接项，局部 `unknown` 验证不是新增共享契约，也不扩张 source-copy whitelist。
- 先验证失败再实现；先让本批和全量基线通过，再进入共享样式改造。
- 当前仅修复进入既有 job 的页面，不新增持久化上传入口；不声称 Web ↔ App 真实账号联验或原生视觉 QA 已完成。

### Task 1: 受限 HTTP 适配及响应验证

**Files:** Create `src/api/business-card-import.ts`; test `tests/business-card-import.test.ts`.

**Interfaces:** `decodeBusinessCardImport(value: unknown, id: string): BusinessCardImportJob | null`; `createBusinessCardImportClient(options: OrbitApiClientOptions)` 返回 `getJob(id, signal)` / `cancelJob(id, signal)`，结果为 `ApiResult<BusinessCardImportJob>`。

- [x] 写入失败断言：`assert.equal(decodeBusinessCardImport({ job: { ...job, id: otherId } }, id), null)`；正确完整响应读取后为 `state === "processing"`。断言坏计数、未知状态、错误 batchId、错误日期、非 job 响应均不可用于动作。
- [x] 运行 `node --import tsx --test tests/business-card-import.test.ts`，确认缺失导出导致明确断言失败，而非模块装配异常。
- [x] 只新增消费者。GET 路径为 `/api/contact-drafts/business-card/imports/${id}`；POST 路径追加 `/cancel`、body `{}`、`Origin: new URL(baseUrl).origin`。复用 `createOrbitApiClient` 的 Cookie、credentials、401 通知、网络错误和 signal。
- [x] 验证完整 legacy envelope、401/404/409/503、错误 JSON、错误 ID 不发请求、取消确实 POST 空对象、不接受 HTTP 失败伪装成功。

### Task 2: 原生进度及真实私有路由

**Files:** Create `src/screens/contacts/BusinessCardImportScreen.tsx`, `app/contacts/new/import/[id].tsx`, `tests/business-card-import-interactions.test.ts`; modify `src/view-models/mobile-route-access.ts` only for import path-param normalization, with impact analysis and failing login-return test first.

**Interfaces:** `BusinessCardImportScreen()` 从 router id 和当前 auth/server 得到独立 scope；路由 `export default withOrbitPrivateRoute(BusinessCardImportScreen)`。使用 Task 1 的已验证状态，不读快照缓存。

- [x] 交互测试装配真实页面、HTTP client、主题、登录边界；只替换原生/router/provider/fetch/clock。先断言正在准备后显示文件及页面数量、取消确认、完成按钮导航，再观察缺失页面时失败。
- [x] 初始及恢复前台读取；pending/processing/ready 每 3 秒轮询；terminal/401/404 停止；读取失败清除动作权限并提供重试。
- [x] 所有请求绑定 route + server + actor + cookie session scope；失焦、后台、换人、换服、登出、卸载立即撤销；过期 GET 或取消结果不能写回新页面或导航。取消同步锁防双击，先由系统确认，再 POST，不做乐观假成功；409 必须重新读取。
- [x] 完成只显示“查看待确认名片”，使用真实 batchId 导航 `/contacts/new/batch/${encodeURIComponent(batchId)}`。失败/取消提供重新选择；无 ID 不请求。保留当前错误说明，不显示租约/存储路径。
- [x] 本批交互覆盖 active→complete、cancel→cancelled、取消冲突、失败恢复、错误身份、并发/迟到响应、未登录深链与错误 ID。

### Task 3: 基线及交接

**Files:** Update 本计划和设计目录 README（事实与测试范围，不改变原始交付稿）。

- [x] 运行 `node --import tsx --test tests/business-card-import*.test.ts tests/route-parity.test.ts tests/mobile-route-access.test.ts`。
- [x] 运行 `npm run typecheck` 和 `npm test`，报告实际结果；不能只凭新增路由存在宣布功能完成。
- [x] 记录 App 工作树版本、Web/API 无修改、局部 DTO 适配边界、原生/真实账号未验范围；继续整个设计包的公共样式、导航和页面落地。

## 自检

本计划是全包改版的先行补齐批次，不缩小原始目标。页码、计数、终态及请求权限来自当前 API；视觉源没有独立进度页，按用户补充授权延展名片导入样式。没有新增后台任务、笔记、邀请或关系枚举。
