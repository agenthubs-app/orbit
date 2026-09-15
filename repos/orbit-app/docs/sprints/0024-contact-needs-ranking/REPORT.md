# Sprint 0024 — 人脉需求与匹配排序执行总结

## 目标实现情况

- 人脉主页现在用一条紧凑入口展示“我的人脉需求”。未填写时精确显示“您还没填写您的人脉需求。”；保存后显示需求摘要，并从“按需求排序”进入独立页面。普通联系人列表没有加入分数。
- Web/API 根据当前认证 actor 的需求和可访问联系人计算确定性匹配结果；App 展示需求匹配分、真实字段依据和资料不足分组。编辑、取消、清空、冲突、伪回执、换号和晚到响应均保留了明确状态。
- 人脉分析页不再编辑关系目标；机会刷新保持独立动作，“人脉分析报告”位于分析内容末尾，并继续要求用户实际发送 IORBIT 草稿后才生成。
- 当前主线 iOS Simulator 已走通保存需求、打开需求匹配、空联系人提示、资料不足联系人、真实 100 分联系人、展开字段依据、进入联系人详情和返回后保留展开状态。零联系人接口返回 `ready` 时最初出现大段空白，修复后明确显示 `There are no contacts to match yet.`。
- 同一真实隔离账号在当前构建逐一冷启动验证中／日／英；原生 `accessibility-extra-large` 暴露并修复了头像溢出和分数挤压，三语返回标签也从硬编码中文改为页面显式本地化。SC-0024-05 已具备同版本原生操作证据。

## 运行记录

- 结果：`completed`（SC-0024-01～05 全部通过）。
- run：run-01；Generator owner C 线任务 `01a0a041-c352-7022-98de-1783b8b1adb8`；2026-09-15 07:42 JST 开始，最终原生复验于 12:13 JST 收口。
- Planner revision／启动 SHA256：revision 1；`2caf94fa29c71a474a8d95ccf72944e317ce5550a0493ea4524a2eb8cf5c9cea`。
- 主线产品基线：`c5c091fba`；设计／登记 HEAD `32f5d16af`；App 补丁在含 0015 三语基线的 `d7180e134` 上隔离完成。
- 被验收的最后功能 HEAD：`d4cc8a441`；报告前文档 HEAD `536abc52b`。
- 环境：本地 Node 25；iOS 26.4 Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17`；App 连接 `http://localhost:3000` 的当前主工作区 Web dev server；使用隔离测试账号，没有访问生产数据库、部署或调用付费模型。

## 改了什么与 commit 对应

| 功能／原因 | 实际范围 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 认证 actor 范围内的需求解析、确定性评分、稳定排序、依据、版本和只读 HTTP 契约 | `repos/orbits` contact-needs contract/schema/service/route/tests | `bf35efb85` | 02、03、05 |
| 主页需求入口、共用编辑器、独立匹配页、三语、路由、分析页层级和同步契约 | `repos/orbit-app` 需求页面、hooks、view-model、contacts 页面与测试 | `725e60b39` | 01～05 |
| `ready` 且联系人集合为空时显示三语空态，并区分 0 分与资料不足 | App 匹配内容、i18n 和交互测试 | `146f5fa09` | 01、02、05 |
| 大字号纵向排布、固定头像字形及需求匹配页三语返回标签 | AppScreen 可选返回标签、匹配页面／内容及真实布局测试 | `d4cc8a441` | 05 |

本 Sprint 新增的纯展示文件为 `src/screens/contacts/ContactNeedsHomeEntry.tsx` 与 `src/screens/contacts/ContactNeedsMatchesContent.tsx`；前者由 `725e60b39` 引入，后者由同一提交引入并在 `146f5fa09`、`d4cc8a441` 继续补齐空态和大字号行为。

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0024-01 | pass | 需求组件真实交互、联系人页面浏览器回归与当前 Simulator | 精确中文未填写提示、保存摘要、独立排序入口、取消／清空／失败保稿均通过；主页联系人列表没有分数，字号沿用现有 tokens。 |
| SC-0024-02 | pass | Web 服务／路由 11/11；App view-model、交互回归与当前 Simulator | 两种需求改变排序，空需求、稀疏资料、同分、重复 ID、完整依据和 `score=null` 均通过。Simulator 既验证 Kenji Sato 的资料不足分组，也验证 Mika Tanaka 0024 的 100 分及 organization／role 两条真实依据。 |
| SC-0024-03 | pass | Web route/service 与 App 保存／生命周期测试 | API 忽略客户端 actor，只读取认证 actor；目标和数据版本随结果返回。network-only、换号／换服务器、409、伪回执和晚到响应保护通过；真实空集合 GET 返回 `state: ready` 且没有写业务数据。 |
| SC-0024-04 | pass | App 人脉页面浏览器交互 20/20、分析相关受影响集合 | 三个分析分段保留可操作结构；目标编辑已移出；报告位于内容末尾；机会刷新与进入可编辑 IORBIT 草稿是两个独立动作，发送前不生成报告。 |
| SC-0024-05 | pass | 当前 Simulator、同账号 Web↔App 回读、三语冷启动与原生 Dynamic Type | App 保存后 Web 原样回读、Web 修改后 App 原样回读。最终构建完成 100 分→依据→详情→返回并保留展开状态；中／日／英标题、正文、返回标签分别通过。`accessibility-extra-large` 下头像不再溢出，正文与分数改为纵向且依据仍可访问。证据位于 `build/harness-state/evidence/sprint-0024/run-01/native/`。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| Web contact-needs 服务／路由测试 | `bf35efb85` | 11 pass、0 fail | 02、03 |
| Web `npm run typecheck` | `bf35efb85` | exit 0 | 02、03 |
| App contact-needs 交互文件 | `d4cc8a441` | 16 pass、0 fail | 01、02、03、05 |
| App 0024 + AppScreen 扩大受影响集合 | `d4cc8a441` | 94 pass、0 fail | 01～05 |
| App `npm run typecheck` | `d4cc8a441` | exit 0 | 01～05 |
| App 全量 | `725e60b39` 前一版 | 2771 项中 2770 pass、1 fail | 唯一失败是已移除 `actionLabel` 的旧测试期望；修订后包含该用例的受影响集合 70/70 通过。空态修复后按 L 档运行 71/71，没有把旧全量改写为最终全量通过。 |
| 路由回归 | `725e60b39` | 23 pass、0 fail | 01、05 |
| 人脉页面浏览器交互 | `725e60b39` | 20 pass、0 fail | 01、04、05；截图 `/tmp/orbit-0024-contact-needs-home.png`、`/tmp/orbit-0024-contact-needs-matches.png` |
| iOS 零联系人首次复验 | 主线含 `725e60b39` | fail：接口为 `ready`、页面无结果提示 | 原截图 `/tmp/orbit-matches-empty.png`；脱敏响应 `/tmp/orbit-matches-response.json` |
| iOS 零联系人修复复验 | 主线 `146f5fa09` | pass | 英文需求 `Find a design partner in Tokyo`、contacts=0；明确空态截图 `/tmp/orbit-0024-native-empty-fixed.png` |
| iOS 非空联系人 | 主线 `d4cc8a441` | pass | Mika Tanaka 0024 显示 100 分；展开 organization／role 两条依据，进入真实详情并返回，展开状态保留 |
| iOS 三语与 Dynamic Type | 主线 `d4cc8a441` | pass | 中／日／英分别冷启动；`accessibility-extra-large` 布局和依据展开通过，最终恢复英文与标准字号 |
| 运行中 Web／API | 主线 `d4cc8a441` | HTTP 200／HTTP 200 | Web PID 1984、Metro PID 94944；认证匹配 API 返回 ready、100 分真实联系人。无 Web 源码变化，未重启 Web |
| GitNexus | 提交前 | AppScreen CRITICAL；最终 detect-changes LOW，但 TSX 索引不完整 | AppScreen 有 58 个上游消费者，因此仅新增默认不生效的可选标签并跑扩大回归；匹配 TSX 符号未入索引，另以导入关系、精确 diff、94 项直接回归和原生操作补足 |

本 Sprint 含共享契约与身份边界，代码收口时已执行两端 typecheck 和必要集成集合。Web 全量存在与 0024 无关的数据库／运行环境和旧 AI origin 类型基线失败；本轮保留原失败，不把 11/11 定向结果写成 Web 全量通过。空态修复是局部 App 呈现变化，因此按规则只重跑完整交互文件、受影响集合和 App typecheck。

## 交接

- 已提交 Web 服务、App 消费、零联系人修复和原生可访问性／返回标签修复；主工作区没有本 Sprint 未提交产品文件。其他未跟踪设计素材和 `.gitnexus` 未被覆盖。
- Web/API 版本 `bf35efb85`；App 主实现 `725e60b39`，零联系人修复 `146f5fa09`，最终原生修复 `d4cc8a441`。旧 App 不调用新端点；普通关系价值分和联系人生命周期没有改变。
- 新增真实模型调用 0，未改变既有 `$5` 硬上限及已记录 `$0.012780`；前序未核算项仍保持未知。
- SC-0024-01～05 均已关闭；不再需要 c-0024 证据监控。
- 回退应限定到 `d4cc8a441`、`146f5fa09`、`725e60b39` 和 `bf35efb85`，不能覆盖其他线路提交或用户未跟踪素材。
