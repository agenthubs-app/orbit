# Sprint0054 run-01 — Generator 本地交接报告

个人日程阅读态修正已提交，本地直接测试通过。Sprint 尚未完成：同版本原生 Hermes、合并后的生产运行时、Phone 交接和 push 验收仍由 ROOT 执行，B 未验证。本次是新的0054 run；没有重开0053，也没有改写0053原有失败。

## 固定源码与改动范围

- 功能提交：`1ab65fbb42e909307963ff342da714a5d13e92e3`。
- 分支：`codex/sprint-0054-personal-schedule-display-correctness`。
- 工作树：`/Users/xzhao/Projects/orbit/.worktrees/sprint-0054-personal-schedule-display-correctness`。
- 固定基线：`1bc3b13c8ee1e8f036e9b343179aa5b96cfcc0f8`；实际核对了初始分支、HEAD 和 clean 状态。
- ROOT 绝对路径 Planner SHA256：`f593452f543d13dc61f5c68dc906126c6197099b709b55da74a7b2bd10c58434`。规划在 MAIN 阅读，没有从 Phone 复制，也没有复制到本树。
- 功能 tree：`2a2ed2c96ecb15ea3cc2f976190b354460258178`；准确清单为六文件，144 additions/5 deletions。路径可查 `git show --name-status 1ab65fbb4`。

App Detail 使用现有 `home.durationMinutes` 翻译，传入原来的数值，保留缺结束时间分支。App 阅读 VM 和 Web PersonalDetail 在保存时区中用 `endsAt-1ms` 求最后占用日期。单日全天只显示一个日期，多日保留实际占用范围。非全天事件仍显示真实结束日期和时间。

原始 UTC 字符串、秒精度、endTime、时长计算、ID、更新版本、关联 ID、编辑器/CAS/回执/独立回读和私有归属检查未变。没有修改共享时间模块、编辑器、字典、API、schema/contract、notes/contacts、运行时配置或依赖。核对两端 lock 哈希一致后，才复用已有依赖软链接。

## SC、文件与证据对应

| SC | 功能文件与实际本地证据 | 剩余验收 |
| --- | --- | --- |
| SC54-01 | App `PersonalScheduleDetailScreen.tsx` 和完整 `personal-schedule-interactions.test.tsx`：实际渲染 zh/ja/en 的30/60/120分钟标签，覆盖正常格式化和仅单位分支故障；三语缺结束提示、30.5分钟小数案例 | SC04 的 ROOT 原生三语证据 |
| SC54-02 | `personal-schedule-detail.ts`、新建完整 `personal-schedule-detail-view-model.test.ts`、Web `personal-schedule-workspace.tsx` 和完整 `personal-schedule-workspace.test.tsx`：手写 Tokyo 单/二日、NY23/25小时、保存时区与设备回退、非全天跨日和缺结束夹具；实际 Web 列表行→GET→只读文本；真实 App 路由单/二日接线 | SC04 的同版本真实跨端证据 |
| SC54-03 | 完整 App duration/interactions 和 Web workspace 检查；保留原始 UTC/秒/ID/版本，只读仅 GET、无写入；两端类型检查 exit0 | ROOT 的真实记录和合并树验收 |
| SC54-04 | B 未验证。浏览器替身和 Node 不能作为原生 Hermes 证据 | ROOT 核对 actor/APIbase/DB/设备/native+JS 版本，实际三语30/60/120分钟和单/多日截图，精确独立 GET，安全清理本次自建记录 |
| SC54-05 | 固定功能提交、独立报告交付、准确 staged 审计和 clean 功能工作树 | ROOT 精确合入 chat-agent 并验证合并树，确认新生产 Web build/PID/health 被实际消费，Phone 同域交接、获准 push 和远端 SHA 核对 |

## 实际 RED 与 GREEN

原始 RED 命令和输出保存在本任务工具历史中，没有伪造磁盘日志。被忽略的 checkpoint 写于首次 RED 之后，并非之前；各产品修改均在对应实际 RED 之后。

- 新 App VM 文件在原产品上：六测试，2通过/4失败，exit1。Tokyo 单/多日和 NY 春/秋的实际结束日期均比手写占用末日期晚一天。
- 显示修改前的真实 App Detail 消费者，筛选 `platform unit fault|fractional minutes`：十测试，0通过/10失败，exit1。实际30/60/120分钟标签显示1800/3600/7200秒；30.5分钟显示1830秒。仅替换平台分钟单位构造分支，其余格式化委托原实现。这是受限故障注入，未运行真实 Hermes，也未声称正常 Chromium 复现平台故障。
- 阅读修改前的实际 Web 只读渲染，筛选 `projects saved dates`：六测试，2通过/4失败，exit1。失败是预期的占用日期差异；非全天和缺结束对照通过。
- 首次完整直接 GREEN 为 App40/40、Web13/13，exit0。最终测试版补两个实际 App 全天路由案例，并将截图路径从0053改为0054。下面的完整命令针对该最终版本重跑；没有运行或宣称全仓 I 通过。

下面每条命令均使用固定 Node22，配合 `env -i`、`PATH=/usr/bin:/bin`、已有 TMPDIR 和 zero-outbound preload。没有访问真实环境/provider；guard denied0。日志位于本工作树 `build/harness-state/evidence/sprint-0054/run-01/`，已实际阅读。

| 最终命令，在对应客户端 cwd 执行 | 日志 | 实际结果 |
| --- | --- | --- |
| App: `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/personal-schedule-detail-view-model.test.ts tests/personal-schedule-duration.test.ts tests/personal-schedule-interactions.test.tsx` | `app-direct-green.log` |42/42, fail0, skip0, exit0 |
| Web: `node --test --import tsx tests/pages/personal-schedule-workspace.test.tsx` | `web-direct-green.log` |13/13, fail0, skip0, exit0 |
| App: `node ./node_modules/typescript/bin/tsc --noEmit` | `app-types.log` | 实际 exit0，仅运行一次 |
| Web: `node ./node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` | `web-types.log` | 实际 exit0，仅运行一次 |
| 精确 staged/unstaged diff 和功能 tree 检查 | 本任务工具历史 | exit0；六路径白名单，staged tree 未变 |

实际查看了390×844的 `app-detail.png`：09:30→10:30、`60 分钟`、Asia/Tokyo。它与 `app-editor.png` 都是隔离模拟浏览器截图，不能作为 Simulator/运行时验收。没有放宽阈值或改写原始失败记录。

## 影响分析与提交前审计

绑定索引仓库：`/Users/xzhao/Projects/orbit`；实际编辑树为上面的0054绝对路径。ROOT 官方刷新27156完成了精确基线索引；后续仅文档 HEAD 刷新82906实际 exit0，ROOT 已释放 writer。中间四份规划文档没有修改目标源码或调用关系；ROOT 按 RULES4 明确放行复用已有实际 upstream impact，未静默忽略 stale 警告。

- `personalScheduleDetail`：LOW，2个受影响符号，一个直接 `Detail` 调用者，0个索引流程。
- App `Detail`：LOW，一个直接 `PersonalScheduleDetailScreen` 调用者，0个索引流程。
- Web `PersonalDetail`：LOW，2个受影响符号，一个直接 `PersonalScheduleWorkspace` 调用者和测试，0个索引流程。

实际 B linked-tree `gitnexus_detect_changes(scope:staged)` 返回 `Repository not found`；此 MCP schema 未暴露 worktree 参数。没有拿 ROOT 的 zero staged 结果替代本树审计。

ROOT 随后实际核查了不可变 B cached tree，使用 ROOT 仓库和 compare 范围 `1bc3b13c8ee1e8f036e9b343179aa5b96cfcc0f8..2a2ed2c96ecb15ea3cc2f976190b354460258178` 运行官方 `detect_changes`：6文件，9个映射符号，0个索引流程，LOW。新 VM 测试未映射，仍为 UNKNOWN，不能当作零风险。ROOT 阅读三个实际产品 diff，确认仅分钟本地化和占用日期投影，明确放行此精确六路径功能提交。已提交功能 tree 与获批 tree 完全一致。

## 交接、剩余工作与回退

功能提交后没有 unstaged/staged 产品改动；现在仅新增独立报告。最终报告提交和 clean 状态在任务交接中提供，避免报告 SHA 自引用。B 测试/类型检查均无活进程，浏览器清理已结束。报告获批提交后，B 释放六个源码/测试锁。

SC54-04/05 仍待 ROOT 执行。B 无权做这些具体外部操作；本地证据的适用范围不变。集成输入应为冻结的功能/报告 SHA，不能取移动分支 HEAD。全局 README/Bridge 台账、端版本、另一端影响和验证范围由 ROOT 更新，B 没有改共享台账。Phone 只需精确消费已验证阅读增量，沿现有隔离重建/登录/发布步骤交接；contracts/schemas 未变，无需重复 contract sync。

需要回退时，由 ROOT 授权 revert 精确功能提交；本次未执行 reset、历史重写、广泛删除或回退。B 未集成/push、重启共享服务、写数据库/账号/设备、清缓存、安装包、调用付费 provider 或启动额外代理。付费 provider 增量 spend0；原累计$5硬上限没有重置或提高。0053之前的验收缺项和失败仍保留在0053，本报告未将其标记通过。
