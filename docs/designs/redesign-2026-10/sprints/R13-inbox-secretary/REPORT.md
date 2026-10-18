# R13 受信箱・秘書来源 — REPORT

> **M0 给 D 线 R10 的合同：`306f32224`**（`contract(R13)`，独立按路径提交，现已在 `origin/redesign`）。`GET /api/inbox/secretary/preview` 的 mock 响应为 `{ actorId, items: [{ key, eventId, kind, notification }], hasMore, asOf }`；App 以 `parseSecretaryPreviewForActor(body.data, actorId)` 解析。`kind` 为 `event_deadline | event_prep | event_pick | daily_recommendation`，卡片 `key` 为 `eventId:kind`；首页「すべて見る」进 App `/inbox?tab=notifications&filter=secretary`，Web `/app/inbox?tab=notifications&filter=secretary`。M0 提交时 live 返回 503；后续本线实现了配置本机库时的 live 读取，无配置时仍返回 503。mock 的三条活动卡均为 `sample:true`，无邮件摘要。未 push；主会话需通知 D 线锁定此提交并确认收件。

## 执行与 SC 对照（2026-10-19）

本线只改 `redesign-b`；启动及实现提交后均已 `git pull --rebase origin redesign`，最终基于 `origin/redesign@d8e6dafb7`。未 push、未接 Neon/生产、未部署、未调用付费 AI。沿用本机 `orbit_line_b`，未新增迁移（`network-analysis v6` 未占用）。M0 的合同与 App 副本已独立提交；本线 rebase 后的服务、Web、App 主提交依次为 `fc306dd69`、`e47d153ef`、`2e2f272e1`，后续本域修复/测试/预检提交见末尾清单。

| SC | 当前结果 / 证据 | 未完成项或限制 |
| --- | --- | --- |
| 01 基线/依赖 | 已读 R11b/R31a/b、桥接台账、b5/b11/b8/b12；`preflight-checklist.md` 与 `_evidence-b/R13/run-01/preflight-*`。 | b5/b11 部分板含 D-16 邮件摘要，缺无 mail 补板及多个宽度/主题。 |
| 02 M0 | `306f32224`，独立合同/fixture/mock/API/App 同步；Web 16、App 5 条目标测试及类型检查通过。 | 主会话需将提交号正式交 D 并锁定版本。 |
| 03 来源/生产者 | R27 截止和准备均为 reminder，`dueAt` 使用真实事件时间；来源每次读取重查 actor、发布/报名/计划/评估/反馈事实。本机 SQL `EXPLAIN` 与事务检查日志。 | 本机库没有当前可用活动，无法出真实候选行；生产任务尚未部署。 |
| 04 日次推荐/preview | 无 AI、东京日单语义槽、无候选归档；对传入的候选按分数再 eventId 选 Top-1；preview 扫多页、按活动去重、R26 理由优先。目标单测与本机 DB 回滚验证。 | live 候选目前取既有 `discover().planFit` 前 3 项，现有 discover 先按反馈后分数排序，超过 3 个合格候选时不能证明全域 Top-1 / eventId 破同分；本机无可用候选，D 首页 live 截图待联调。 |
| 05 App 通知 | kit `AppScreen inset=kit` / Segmented / CategoryTabs / ListRow / SwipeRow，秘書分类、日分组、离线镜像；B 模拟器浅/深截图已存 `app-pixel-*`、`app-dark/`。 | 当前 QA 账号无活动通知；A kit 的 RN Web tab 选中语义待修；认可板像素未通过。 |
| 06 Web 通知 | kit 分类、双栏详情、hover 动作、日分组、秘書扫描及 URL 筛选；QA 登录下 1440/1024/390 浅深截图见 `web-responsive/`。 | 现有四张 1440 板均未过门禁；1024/390 无认可板。 |
| 07 消息/旧路径 | App `/chat` 兼容跳转到 `/inbox?tab=messages`，Web compose seed 校验且一次消费；两端列表搜索现有授权页。 | 旧 chat 重组件保留供邻线与旧测试引用；新联系人入口归 R11a。 |
| 08 站内发送/草稿 | 原有真实发送与 outbox 保留，Web 列表/草稿浏览器测试、App 消息目标测试通过。 | 断网回网真机逐步录屏待补；站内发送画板缺。 |
| 09 通知动作 | 只依 DTO `actions` 绘制，read/accept/snooze 用原 revision + idempotencyKey；事件无 snooze；双击锁与重试提示保留。本机 PG 并发 accept 同 key 仅造 1 项任务，来源变更后脱敏；14/14 服务目标测试。 | 409 真机操作链待补。 |
| 10 来源目标 | Web 阻断外部/反斜杠 URL，App 只接受站内目标；来源失效时目标脱敏、动作隐藏，详情打开读回执。 | 本机无可撤销的当前活动实例，失权截图待补。 |
| 11 D/C 正式入口 | 已 rebase；现有首页 🔔 指向 `/inbox`，C マイページ已无 `ShellInboxRow` 使用点。 | D 的正式 R10 交付提交和点击/数值截图尚无；`HomeBell` 在服务端返回 `0` 时仍画红点（当前 `dot={count !== undefined}`）。 |
| 12 文案/隐私 | ja/zh/en 追加分类、状态与短动作文案；`copy:qa --app typedInbox` 35 条 0 问题；Web 消息空态实测漏 ja 后补全本域三语；D-16 mail_summary 客户端列表/详情/preview 不显示。 | 全域 copy QA 原有 218 项，报告单列；401/503 等异常态真机截图待补。 |
| 13 App 像素 | 六张浅色板已在真 B 模拟器比对并逐带记录；通知/消息深色实装截图见 `app-dark/`。消息页标题被长动作文案挤坏，已改为短可见标签并保留完整无障碍名称；`A-R13-04` 重比截图确认标题可读。 | 六张浅色板仍全未过：真实账号无设计中的样例通知、线程、活动；部分结构/文案也不同。深色无板，不进门禁。 |
| 14 Web 像素 | 四张认可的 1440 板经 `--style-diff` 比对，1440/1024/390 浅深实装截图见 `web-responsive/`。截图发现消息空态漏 ja，已补三语并以浏览器测试重跑。 | 四张 1440 板全未过；缺同等授权数据、壳标题位置与板不一。1024/390 无板，不进门禁。 |
| 15 合同/同步/回归 | `sync:contract` 后 App 副本一致；本机 Web/App 同 QA 账号摘要请求均返回 200；两端全量及本域目标测试结果见下。 | 离线发消息→回网与首页/两端/服务端三数逐项对账未做成；本机无已授权线程或活动，不能把零列表截图当作回网验收。全量均有非本域失败。 |
| 16 REPORT/复核 | 本报告、预检、独立 `REVIEW.md`、证据目录与交接表已写；代码、视觉配置和预检按路径提交并 rebase 至最新 `origin/redesign`。 | 主会话收件、缺板/组件/正式入口与生产授权待其处理。 |

### 视觉门禁实测

`_evidence-b/R13/run-01/web-pixel-final/summary.json`：W-R13-01 / 02 / 04 / 04d 的 raw 分别为 0.0332 / 0.0234 / 0.0377 / 0.0558；超阈带 13 / 12 / 19 / 20，**未归因带同数，4/4 FAIL**。板中真实线程和活动样例在本机 QA 账号不存在；标题的 shell 位置、内容面板也与板有实测差异，不能用 `[data]` 整体豁免。各屏 `style-diff.json`、三联图与逐带结果均在同目录；无 Web 1024/390 认可板，`web-responsive/` 的 10 张浅深截图只作实装证据。

`_evidence-b/R13/run-01/app-pixel-final/summary.json`：A-R13-01 / 02 / 04 / 05 / 07 / 08 的初轮 raw 为 0.1866 / 0.0612 / 0.0692 / 0.0885 / 0.0704 / 0.0621；超阈带 22 / 12 / 16 / 22 / 16 / 15，**未归因带同数，6/6 FAIL**。首张初轮误落 iOrbit，单屏复跑后正确收件箱 raw 0.1376、超阈 20 / 未归因 20，仍 FAIL。A-R13-04 初轮暴露移动端标题被长动作文案挤坏；改为短可见标签并保留完整无障碍名后，单屏重比 raw 0.072、超阈 16 / 未归因 16，标题已可读，数据/结构差仍未过。批量脚本写完 summary 后卡在浏览器关闭，已终止该脚本的子进程；单屏复跑均正常退出 5。深色 App 只有实装截图 `app-dark/`，没有对应认可板。

## 待主会话决定与接手（是什么 / 当前临时做法 / 接手必须做到 / 依据）

| 接收方与事项 | 当前临时做法 | 接手必须做到 | 依据 |
| --- | --- | --- | --- |
| D：首页 🔔 / 秘書 | M0 路由与 App 解析已交，live 无资格候选时为空。 | 锁定 `306f32224`；点 🔔 进通知 tab 并验统一未读数；`0` 不画红点；秘書三条/更多与 B 端 `filter=secretary` 同步。 | SC-02/04/11；`HomeDashboardScreen.tsx` 的 `HomeBell` 当前 `dot={count !== undefined}`。 |
| 主会话 / Events：完整推荐候选 | 当前维护任务复用 `discover().planFit` 的前三项，再按 DTO 分数、eventId 选一；没有改 Events 归属的 discover 核心。 | 明确反馈罚分后 rank 与原评分的 Top-1 口径；提供不截断的合格候选源或授权跨域改动，并以 ≥4 个同分/不同时间候选验 eventId 破同分。 | SC-04；`discover-core.ts` 的 `PLAN_FIT_ROWS=3`、rank 先按日期破同分。 |
| C：マイページ入口与设置 | C 已移除旧 `ShellInboxRow` 使用点；B 暂不画 R14 ⚙。 | rebase 后核截图仅一个正式入口；R14 设置页/路由合入再接 ⚙。 | SC-11；`rg ShellInboxRow`。 |
| A：组件与 token | 现有 Segmented/CategoryTabs/ListRow/SwipeRow 实装；未造私有组件。 | 给 b5/b11 内容行高、间距、字距、选中阴影正式 token；`CategoryTabs` RN Web `role=tab` 的选中项需有 `aria-selected`（原生仍用 `accessibilityState`）。 | `preflight-checklist.md`；`relationship-inbox-lifecycle` 选择状态 1 例未过。 |
| D / 主会话：标题与壳位置 | App 继承的 `inbox.title` 为「受信トレイ」，Web 为「受信箱」；Web shell 标题比 b5 板右偏约 180px。B 保留历史词条及壳文件。 | 确定统一用词后连同 R03 词典快照协调更新；D 线给收件箱标题认可的位置/壳插槽，不在 B 局部覆盖。 | App `i18n-domain-split` 固定旧键值；Web `style-diff.json` 的标题 `box.x` 552→732；SC-13/14。 |
| 主会话：共享画板 | 含 mail 板只作结构参考；缺板标「设计稿无，不进门禁」。现有空态板又含 R14 设置快捷方式与样例数据，本机账号无同等真实事实。 | b12 补无 mail 的 A-R13-03/06、W-R13-03/05 浅深和 Web 1024/390、App 站内发送/缺深色；补 R13 无 R14 快捷方式及无样例事实的真空态，稳定 ID 后重新 `--list`。 | PLANNER §8 / §B-13-1 与预检。 |
| A：像素工具 | App 六张批量脚本已写 `summary.json` 与图片，退出时卡在浏览器关闭；B 终止该子进程，单屏 `--workers 1` 正常退出 5。 | 检查批量预取并发启动多个 Chrome 后的关闭路径；后续门禁建议单 worker。 | `app-pixel-final.log` 与 `app-pixel-recheck*.log`；SC-13。 |
| R14：推送/设置 | R13 只做站内来源与入口；事件不显示 snooze 假动作。 | `dailyCap`/静音/7:50 批次、白名单、邀请双方推送、真机推送权限按 R14-01～03 与 R13-04 执行。 | PLANNER §12。 |
| 主会话：生产授权 | 本机 schema/SQL 验证；未部署。 | 对生产迁移/环境/部署/Neon/分发单独授权、联调和回归。 | 用户硬规则与 PLANNER §9/13。 |

代码事实偏差：R27 准备通知从原 `suggestion` 改为 `reminder`，与本期归类一致；R26 评分变化保留原语义键，日次推荐写单独 `secretary-daily:<TokyoDate>`，同活动只在 preview 合并。旧 chat 组件因仍有测试/引用暂保留，路由为兼容跳转。视觉稿中无真实来源的邮件摘要、示例人数/emoji chip、`7:50 にまとめて` 均未进入生产 UI。

## 验证记录

- Web 首次全量 `npm test`：7,710 tests，6,689 pass、17 fail、1,004 skip，退出 1；执行开始后才修正的 shared compute 架构、R27 旧期待、评估隐私白名单 3 项均已单独重跑为绿。rebase 与 D-16 直读修复后的最终全量为 **7,660 tests，6,640 pass、15 fail、1,005 skip，退出 1**（`web-full-final.log`）。15 项分别落在 `network-screen` 8、`add-scan-flow` 2，及旧按钮/链接色 ratchet、旧设计 fixture、名片匹配、surface manifest 各 1；没有 R13 测试失败，仍不宣称全量通过。D-16 直读拦截 RED→GREEN 2/2 见 `web-mail-detail-red/green.log`。
- App 首次全量 `npm test`：3,344 tests，3,082 pass、260 fail、2 skip，退出 1；其中受信箱测试旧 harness 在新 kit 导入时缺安全区/手势依赖及旧文案。修正 harness 和真实文字放大布局后，受信箱渲染 14/14、端末镜像 10/10、Web 镜像 2/2、消息操作 12/12、离线发送 5/5 目标再跑通过。rebase 后全量为 **3,218 tests，3,145 pass、71 fail、2 skip，退出 1**（`app-full-final.log`）。其中两个通知列表断言找到本线遗漏的来源 excerpt 与预定提醒时间；已恢复，目标 3/3（`app-typed-inbox-final-target.log`）。旧组件递减清单收紧后目标 15/15（`app-ratchets-final-target.log`），离线读清单校正后 26/26（`app-offline-inventory-final-target-3.log`）。本次受信箱复核 94 条中 93 通过；1 条是 A kit `CategoryTabs` 的 RN Web 选中项缺 `aria-selected`（`app-review-target.log`）。`app-wide-workspaces` 隔离复跑 45/45 起初在启动浏览器束时触发 `global is not defined`；沿用仓库 `nativeUiStubs` 后 **45/45 全通过**（`app-wide-workspaces-fixed.log`）。设置 10、添加联系人 9 等归相邻线，不宣称全量通过。
- `sync:contract`、本机 PG 来源 SQL/日次单槽事务（ROLLBACK）日志在同证据目录。最终 rebase 后 Web `typecheck`、`typecheck:app`、`lint` 与 App `typecheck` 退出 0；本域 Web 19/19、App 5/5、App 多屏浏览器 45/45、通知动作本机 PG/服务 14/14 目标测试，以及 typedInbox 文案检查 35 项 0 问题（`*-postrebase.log`、`inbox-actions-local-postrebase.log`）。Web 消息日语与 D-16 直读目标另有 4/4（`web-review-target.log`）。视觉证据详见上节。

## 按路径提交与清理

M0 `306f32224` 已在 `origin/redesign`。本线 rebase 后提交依次为：`fc306dd69` 来源/预览，`e47d153ef` Web，`2e2f272e1` App，`aefae0939` Web 文案/邮件直读，`09d8c4e92` App 来源/标题，`47af391cd` 视觉配置，`3a3f43a80` App 浏览器测试束，`1584681b5` 画板预检。各提交均含规定的 Co-Authored-By footer，并逐个检查过 `git show --stat` 的路径。未 push。B 线自己的 Web `:3300`、Metro `:8083`、静态设计服务 `:3351` 均已停止；B 模拟器已关机。原始日志和截图保留于 `_evidence-b/R13/run-01/`。
