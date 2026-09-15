# Sprint 0024 — 人脉需求与匹配排序执行总结

## 目标实现情况

- 人脉主页现在用一条紧凑入口展示“我的人脉需求”。未填写时精确显示“您还没填写您的人脉需求。”；保存后显示需求摘要，并从“按需求排序”进入独立页面。普通联系人列表没有加入分数。
- Web/API 根据当前认证 actor 的需求和可访问联系人计算确定性匹配结果；App 展示需求匹配分、真实字段依据和资料不足分组。编辑、取消、清空、冲突、伪回执、换号和晚到响应均保留了明确状态。
- 人脉分析页不再编辑关系目标；机会刷新保持独立动作，“人脉分析报告”位于分析内容末尾，并继续要求用户实际发送 IORBIT 草稿后才生成。
- 当前主线 iOS Simulator 已走通保存需求、打开需求匹配、空联系人提示、资料不足联系人、展开字段依据和进入联系人详情。零联系人接口返回 `ready` 时最初出现大段空白，修复后明确显示 `There are no contacts to match yet.`。
- 数字评分联系人尚未在当前原生隔离数据中实际出现，返回链路和原生动态字号也没有本轮同版本操作证据。因此 SC-0024-05 保持 `blocked`，不能用浏览器组件或服务测试冒充完整原生验收。

## 运行记录

- 结果：`blocked`（功能已提交；SC-0024-01～04 通过，SC-0024-05 缺当前原生数字评分、返回和动态字号证据）。
- run：run-01；Generator owner C 线任务 `01a0a041-c352-7022-98de-1783b8b1adb8`；2026-09-15 07:42 JST 开始，功能修复与当前原生复验于 10:39 JST 收口。
- Planner revision／启动 SHA256：revision 1；`2caf94fa29c71a474a8d95ccf72944e317ce5550a0493ea4524a2eb8cf5c9cea`。
- 主线产品基线：`c5c091fba`；设计／登记 HEAD `32f5d16af`；App 补丁在含 0015 三语基线的 `d7180e134` 上隔离完成。
- 被验收的最后功能 HEAD：`146f5fa09`；报告前文档 HEAD `cef9d8145`。
- 环境：本地 Node 25；iOS 26.4 Simulator `F05ED7C9-1D75-4749-8F53-F9ECDEBC378E`；App 连接 `http://localhost:3000` 的当前主工作区 Web dev server；使用隔离测试账号，没有访问生产数据库、部署或调用付费模型。

## 改了什么与 commit 对应

| 功能／原因 | 实际范围 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 认证 actor 范围内的需求解析、确定性评分、稳定排序、依据、版本和只读 HTTP 契约 | `repos/orbits` contact-needs contract/schema/service/route/tests | `bf35efb85` | 02、03、05 |
| 主页需求入口、共用编辑器、独立匹配页、三语、路由、分析页层级和同步契约 | `repos/orbit-app` 需求页面、hooks、view-model、contacts 页面与测试 | `725e60b39` | 01～05 |
| `ready` 且联系人集合为空时显示三语空态，并区分 0 分与资料不足 | App 匹配内容、i18n 和交互测试 | `146f5fa09` | 01、02、05 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0024-01 | pass | 需求组件真实交互、联系人页面浏览器回归与当前 Simulator | 精确中文未填写提示、保存摘要、独立排序入口、取消／清空／失败保稿均通过；主页联系人列表没有分数，字号沿用现有 tokens。 |
| SC-0024-02 | pass | Web 服务／路由 11/11；App view-model 与交互回归 | 两种需求改变排序，空需求、稀疏资料、同分、重复 ID、完整依据和 `score=null` 均通过。Simulator 实际看到 Kenji Sato 进入资料不足，并展开 Japan、Manufacturing & supply chain、Procurement 三条已有字段依据；当前原生数据没有数字评分联系人，未把该分支写成原生已验收。 |
| SC-0024-03 | pass | Web route/service 与 App 保存／生命周期测试 | API 忽略客户端 actor，只读取认证 actor；目标和数据版本随结果返回。network-only、换号／换服务器、409、伪回执和晚到响应保护通过；真实空集合 GET 返回 `state: ready` 且没有写业务数据。 |
| SC-0024-04 | pass | App 人脉页面浏览器交互 20/20、分析相关受影响集合 | 三个分析分段保留可操作结构；目标编辑已移出；报告位于内容末尾；机会刷新与进入可编辑 IORBIT 草稿是两个独立动作，发送前不生成报告。 |
| SC-0024-05 | blocked | 当前 Simulator、同账号 Web↔App 回读、三语组件与窄屏／双倍字号回归 | App 保存 `Find a manufacturing procurement partner in Japan` 后 Web 原样回读；Web 改为追加 Osaka 后 App 匹配页原样回读。当前原生还验证了英文空态、资料不足依据和详情入口；尚缺数字评分联系人、详情返回以及当前原生动态字号的同版本操作证据。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| Web contact-needs 服务／路由测试 | `bf35efb85` | 11 pass、0 fail | 02、03 |
| Web `npm run typecheck` | `bf35efb85` | exit 0 | 02、03 |
| App contact-needs 交互文件 | `146f5fa09` | 15 pass、0 fail | 01、02、03、05 |
| App 0024 最终受影响集合 | `146f5fa09` | 71 pass、0 fail | 01～05 |
| App `npm run typecheck` | `146f5fa09` | exit 0 | 01～05 |
| App 全量 | `725e60b39` 前一版 | 2771 项中 2770 pass、1 fail | 唯一失败是已移除 `actionLabel` 的旧测试期望；修订后包含该用例的受影响集合 70/70 通过。空态修复后按 L 档运行 71/71，没有把旧全量改写为最终全量通过。 |
| 路由回归 | `725e60b39` | 23 pass、0 fail | 01、05 |
| 人脉页面浏览器交互 | `725e60b39` | 20 pass、0 fail | 01、04、05；截图 `/tmp/orbit-0024-contact-needs-home.png`、`/tmp/orbit-0024-contact-needs-matches.png` |
| iOS 零联系人首次复验 | 主线含 `725e60b39` | fail：接口为 `ready`、页面无结果提示 | 原截图 `/tmp/orbit-matches-empty.png`；脱敏响应 `/tmp/orbit-matches-response.json` |
| iOS 零联系人修复复验 | 主线 `146f5fa09` | pass | 英文需求 `Find a design partner in Tokyo`、contacts=0；明确空态截图 `/tmp/orbit-0024-native-empty-fixed.png` |
| iOS 非空联系人 | 主线 `146f5fa09` | partial pass | Kenji Sato 的资料不足分组、三条字段依据及详情入口通过；数字评分、返回和动态字号未运行 |
| GitNexus | 提交前 | LOW／新增组件未被索引 | 主索引绑定另一工作区；每个既有符号编辑前检查影响，临时干净工作区另以精确 staged 文件和直接消费者测试审查 |

本 Sprint 含共享契约与身份边界，代码收口时已执行两端 typecheck 和必要集成集合。Web 全量存在与 0024 无关的数据库／运行环境和旧 AI origin 类型基线失败；本轮保留原失败，不把 11/11 定向结果写成 Web 全量通过。空态修复是局部 App 呈现变化，因此按规则只重跑完整交互文件、受影响集合和 App typecheck。

## 交接

- 已提交 Web 服务、App 消费和零联系人修复；主工作区没有本 Sprint 未提交产品文件。原 C 工作树的大量既有修改未被覆盖，隔离工作区只剩未跟踪的 `node_modules` 链接。
- Web/API 版本 `bf35efb85`；App 主实现 `725e60b39`，零联系人修复 `146f5fa09`。旧 App 不调用新端点；普通关系价值分和联系人生命周期没有改变。
- 新增真实模型调用 0，未改变既有 `$5` 硬上限及已记录 `$0.012780`；前序未核算项仍保持未知。
- 当前唯一 Sprint 阻塞是 SC-0024-05 的原生证据：在同一隔离环境准备至少一个能得到数字分数的联系人，完成排序、展开评分依据、打开详情、返回，再以当前构建检查中／日／英及动态字号。其余 SC 不需要重开 Generator。
- 回退应限定到 `146f5fa09`、`725e60b39` 和 `bf35efb85`，不能覆盖其他线路提交或用户未跟踪素材。
