# Sprint 0031 — App 与 Web 关键路径性能设计

## 背景

用户反馈 App 与 Web 整体使用偏慢。当前代码已经存在局部优化，但缺少覆盖两端、可重复运行且能阻止回退的统一基线：

- App 的 `useApiResource` 被大量页面共享，并串联身份恢复、SQLite 快照、网络读取与 React 状态更新；任意改动都会影响多个页面。
- App API client 已有 GET in-flight coalescing，但 account-scoped resource 为了正确取消旧账号请求会携带 `AbortSignal`，当前路径不会复用该 coalescing；必须先量化重复请求，不能直接移除取消保护。
- Web 的 AI conversation route 已有 `Server-Timing`，旧性能审计也曾处理约 10 MB SSR HTML；其他核心页面和 API 没有同等级的统一测量。
- AI 总时延常由外部 provider 决定。本 Sprint 只对可控的 UI 反馈、本地编排、序列化和数据读取设硬门槛，provider 时延单独报告。

## 方案选择

采用“基线驱动的一次跨端 Sprint”：先建立真实性能 harness，再按确定性决策表从候选优化中选出全局前三个瓶颈，且至少包含一个 App 和一个 Web 瓶颈。每个被选项都必须有 RED 性能断言、功能回归和同环境前后数据。

不采用以下做法：

- 不先批量添加 `memo`、缓存或 lazy import；没有 profiler 证据的改动容易隐藏陈旧数据或增加复杂度。
- 不把 App 和 Web 拆成两个 Sprint；用户明确要求单一跨端 Sprint，且 Web/API 必须在 App 验收时实际运行。
- 不用 Debug/Metro 数字作为最终性能结论；开发模式仅用于调试，最终证据来自 Release App 与 production Web。

## 测量环境与统计规则

### 固定环境

- 主线基线：`chat-agent@c1ba721d13bea4d1100b36064647014f3466adb4` 或 B 线启动时更新后明确记录的更高主线 SHA。
- Web：`repos/orbits` 执行 production build，以 `next start` 在回环地址运行；App 与浏览器使用同一服务和同一受控账号。
- App：iPhone 17 Pro、iOS 26.4 Simulator、Release configuration；最终不能只测 RNW。
- 数据：固定受控账号及同一笔记、收件箱、日程、资料和联系人集合；不得使用生产私人数据或在性能循环中产生外部消息/provider 写入。

### 样本规则

- 每个场景预热 3 次，正式运行 10 次。
- 原始样本全部保存；p50 使用排序后第 5/6 项平均值，p95 使用第 10 项。失败样本不能删除，失败率必须单列。
- baseline 与 optimized 必须在同一硬件、Simulator、数据、runtime mode 和网络条件下完成；任一条件变化则整组作废并重测。
- 含外部 provider 的 AI 场景分别记录 `feedback_ms`、`local_ms`、`provider_ms`、`total_ms`；只以 `feedback_ms` 和 `local_ms` 判断本 Sprint 可控性能。

## 核心场景

### App

1. 冷启动到可交互登录态首页。
2. 热启动/登录恢复到首页内容。
3. 首页 → 笔记列表 → 笔记详情 → 返回。
4. 首页 → 收件箱 → 打开条目 → 返回。
5. 首页 → 日程 → 打开会议详情 → 返回。
6. 首页 → 我的 → 编辑资料 → 返回。

每项记录启动/导航时间、JS 长任务、React commit 次数、相同 GET 次数、SQLite 快照读取/解析时间和失败率。

### Web

1. `/app/home`
2. `/app/contacts`
3. `/app/followups` 与关系收件箱入口
4. `/app/schedule`
5. `/app/profile`
6. `/app/agent` 首屏及一次不调用外部 provider 的本地安全边界消息

每项记录 TTFB、FCP、LCP、INP、CLS、导航耗时、HTML/RSC/JS transfer 与 decoded bytes、请求数量、API `Server-Timing` 和失败率。

## 性能预算

### 必须改善

- 根据 baseline 排名选出的三个瓶颈，其主指标 p50 必须各自改善至少 30%。
- 三个瓶颈至少包含一个 App 项和一个 Web 项；不能用三个同类微优化完成 Sprint。
- AI 点击/发送到可见 busy 反馈的 p95 必须不高于 150 ms。

### 不得退化

- 未选中的核心场景，主指标 p95 相对 baseline 不得退化超过 10%。
- Web Core Web Vitals 门槛：LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1；本地无法产生 field p75 时报告为固定环境 lab p95，不伪称真实用户 p75。
- 页面/API payload、首次 JS、App bundle 任一增长超过 5% 必须由同一瓶颈至少 30% 改善证明必要，否则撤回增长。
- 请求失败、解码失败、actor 越界、旧账号内容闪现、缓存写入失败、导航失效和业务测试回归均为硬失败，不允许用性能收益抵消。

## 候选优化与确定性选择

baseline 完成后按“主指标 p95 从高到低、可控耗时占比从高到低”排序，依次选择前三项；相同量级时优先影响场景更多且改动更小的候选。只允许以下候选范围：

1. **App SQLite 快照 L1**：若同一 key 在一次会话重复 SQLite 读取/JSON parse，或快照阶段 p50 ≥ 20 ms，在 `snapshot-store.ts` 增加 actor/baseUrl/path 完整键的有界内存 L1，并在写入、登出、换号和服务器切换时同步失效。
2. **App scoped GET 协调**：若同一 actor/baseUrl/path 在一次导航产生两个以上并发 GET，在不移除 AbortSignal 的前提下增加 subscriber-aware coalescing；最后一个订阅取消时才中止底层请求。
3. **App 渲染收敛**：若 Home、Notes、Inbox、Schedule 或 Profile 任一导航出现超过 3 个非必要 commit 或单次 JS commit > 16.7 ms，只在 profiler 指向的 screen-private projection/component 做稳定 memoization 或列表窗口化；不改变共享业务 contract。
4. **Web 客户端拆包**：若某核心页面首次 JS transfer > 300 KiB 或未打开的面板进入首屏 chunk，使用 `next/dynamic` 拆分该页面已有非首屏模块，优先处理 `/app/agent` 的历史、dashboard 与 task interaction 模块。
5. **Web payload/SSR 收敛**：若页面 decoded HTML/RSC > 250 KiB，移除重复投影或只向 client component 传递当前视图需要的字段；不得改变 API DTO 或隐私投影。
6. **Web/API 聚焦读取**：若非 provider API 本地 p95 > 500 ms 且 trace 显示重复全图/全表读取，沿现有 storage provider 增加可选 focused read，并保留旧接口 fallback；不在本 Sprint 修改数据库 schema。

如果只有两项达到触发条件，第三项固定选择“Web 客户端拆包”或“App 渲染收敛”中 baseline 改善潜力较高的一项；如果任何候选无法取得 30% 改善，则 Sprint 不能 completed，报告保留失败数据并由 Planner 决定后续范围。

## 可观测性结构

两端原始样本使用同一逻辑模型：

```ts
export interface PerformanceSample {
  commit: string;
  durationMs: number;
  environment: "app-release-simulator" | "web-production-local";
  failed: boolean;
  metric: string;
  run: number;
  scenario: string;
  unit: "bytes" | "count" | "milliseconds" | "ratio";
}
```

汇总器只接受 10 个正式样本；结果包含 baseline/optimized p50、p95、deltaRatio 和失败率。生产用户数据、cookie、token、消息正文、笔记正文和 provider prompt 不写入日志。

## 安全与正确性

- 缓存只优化读取，不成为权威数据源；成功写入、显式 refresh、登出、actor/baseUrl 变化必须失效对应数据。
- 所有请求继续由认证 actor 决定，不能把 actorId 作为可由 UI 覆盖的参数。
- 性能日志只记录匿名场景、路径模板、时间和大小，不记录业务 payload。
- AI 不减少权限检查、工具审计或用户确认；外部 provider 超时只能被标注，不能用假结果或预写内容遮掩。
- Web 更新后必须重新 production build/restart；App 最终必须安装当前 Release build。Simulator 证据不替代实体设备发布验收。

## 完成定义

Sprint 0031 只有在以下条件全部满足时才可 completed：baseline 原始数据可复现；至少一个 App 和一个 Web 瓶颈得到优化；三个选中项均达到 30%；未选核心路径无 >10% p95 回退；功能/权限/缓存隔离测试通过；production Web 与 Release App 真实运行验证通过；本线改动已 commit；固定最终 SHA 已合并回 `chat-agent` 并在精确合并树复验。
