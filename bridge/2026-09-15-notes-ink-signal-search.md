# BR-011 — 笔记 4a 与搜索式关联

- 创建/更新日期：2026-09-15
- 总状态：verified
- 优先级：P1
- 发起角色：Bridge
- 下一责任方及是否已接单：已完成，无待接单项
- web_status：source_ready
- app_status：consumer_ready
- verification_status：同一生产构建 live Web/API、隔离 PostgreSQL、同账号 Web 浏览器和原生 iOS Simulator 已完成双向读写、搜索、编辑、版本冲突、幂等与 actor 隔离
- 依赖/阻塞：无；远程部署和实体设备属于发布验收
- 设计/实现/发布授权来源（如适用）：用户 2026-09-15 提供 `4a-*` 设计并明确要求 Sprint 0025 完成后实施；连续执行与本地双端验证授权

## 变化与证据

- 用户可见的旧行为 → 新行为：笔记由简单正文卡片变为 4a 列表、阅读、编辑和联系人笔记视图；关联联系人只显示加号／`@` 搜索，输入词后显示有限候选，不平铺联系人全集。
- Web 页面/服务/HTTP 路径及方法：`features/notes/**`、`features/contacts/**`；`GET/POST /api/notes`、`GET/PATCH /api/notes/:id`、`GET /api/contacts/search`。
- App 页面/消费点：`/notes`、`/notes/new`、`/notes/:id`、`/notes/:id/edit`；联系人详情“笔记”页签；首页“记笔记”。
- Web/App SHA：设计／Planner `e594f076e`；功能 `01a1592d9801702b37d874c7d7477b16f2e75472`。
- 响应字段/Schema/枚举变化：Note v2 新增 title、manualContactIds、mentions、eventIds 和 canonical contactIds；列表新增 total／nextCursor；contact 列表新增 total／nextCursor。
- 请求参数、对象 ID、actor/角色、幂等/版本条件：note 查询支持 q、contactId、association、sort、cursor、limit；默认 20、最大 50；cursor 绑定 actor 与查询；写入使用 idempotencyKey／expectedVersion，关系对象在同 actor 范围验证。
- 刷新、缓存、异步任务与失败处理：联系人空查询零请求，250 ms debounce；AbortController 和 generation guard 丢弃迟到／旧 scope 响应；草稿以 server／account／note 分区，错误或冲突不清空。
- 旧 App 兼容策略：v1 记录投影为 v2；旧客户端 PATCH 省略新字段时保持原关系；旧联系人备注只读保留，不迁移或删除。

## 验收结果

- 自动化：Web 定向 45/45、typecheck；App 定向 65/65、typecheck、契约同步、全量 2598/2598 均通过。Web 全量原始结果 3016 pass／53 fail／183 skip；唯一新增 guard 失败已修复并 19/19 复验，余 52 与既有基线相同。
- 构建：Web 最终 production build 5 成功并重启，health `live/ok`；iOS 当前源码构建 0 error／0 warning，重新安装并启动。
- Web 写 → App 回读：`note:53ab6344ccab90377467a888` 版本 1 的标题、正文、提及、手动联系人和活动由原生 App 完整读取。
- App 写 → Web 回读：`note:ba1eaa2bf19e31afda3cfa4c` 版本 1 由 App 创建，Web 回读相同字段；App 把第一篇更新到版本 2 后 Web 回读移除手动联系人但保留 mention／event。
- 冲突、失败、权限与异步场景：stale expectedVersion 1 得 409；第二 actor 得 404；创建幂等重放不复制；自动化覆盖迟到搜索、范围变化和失败保稿。
- 原生 UI/浏览器验证：浏览器档案页显示 `Orbit QA / qa@orbit.test`，联系人页显示“佐藤健一”；App 用同一账号读取该联系人和笔记。4a 六状态、联系人页签和大字号均有原生截图及 accessibility JSON。
- 未检查范围：远程部署、实体设备、生产数据库和外部副作用。
- 可客观判断的关闭条件：已满足，本交接关闭。

## 更新历史

- 2026-09-15 10:05 JST，Bridge：Sprint 0025 run-01 启动，冻结 Note v2、有界搜索、4a 六状态和 live Web/App 验收契约。
- 2026-09-15 12:44 JST，Bridge：功能提交 `01a1592d9`；Web/App 自动化、生产构建、原生构建、同账号浏览器和双向 HTTP／App 回读完成，BR-011 更新为 `verified`。
