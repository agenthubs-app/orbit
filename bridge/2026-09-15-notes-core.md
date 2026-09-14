# BR-009 — 独立私有笔记核心

- 创建/更新日期：2026-09-15
- 总状态：consumer_ready
- 优先级：P1
- 发起角色：Bridge
- 下一责任方及是否已接单：Bridge 验证；本地实现已接单，同环境双向验收待可用环境
- web_status：source_ready
- app_status：consumer_ready
- verification_status：本地契约、服务、HTTP 与 App 交互已验证；同账号 Web/App 双向运行时未验证
- 依赖/阻塞：缺少本轮 Web 与原生 App 共用的真实环境、账号及原生设备证据
- 设计/实现/发布授权来源（如适用）：用户 2026-09-15 指令；Sprint 0018 `APPROVED_SCOPE_ADDENDUM.md`

## 变化与证据

- 用户可见的旧行为 → 新行为：联系人详情中的旧私有备注保持只读；新笔记由独立列表、新建和详情页管理，可关联多个人脉。
- Web 页面/服务/HTTP 路径及方法：`features/notes/**`；`GET/POST /api/notes`；`GET/PATCH /api/notes/:id`；`DELETE /api/notes/:id/contacts/:contactId`。
- App 页面/消费点：`/notes`、`/notes/new`、`/notes/:id`；首页“记笔记”；联系人详情中的关联笔记入口。
- Web/App SHA 或未提交 diff 范围：基线 `40338854659b1408ea9903b19a043d56a214352f`；功能提交 `8e81e588e20934d3633e839b902ab011d21e1d6a`。
- 响应字段/Schema/枚举变化：共享 `NoteContract`、`NotesCollectionContract`、`NoteDetailContract`；App 使用同步副本并做严格运行时解码。
- 请求参数、对象 ID、actor/角色、幂等/版本条件：所有读写以服务端 actor 隔离；创建和更新使用稳定幂等键；更新与解除联系人关联要求 `expectedVersion`；创建、更新、解除关联均核对确认回执。
- 刷新、缓存、异步任务与失败处理：App 以身份、焦点和 API 基址形成作用域；失败、冲突或回执不匹配时保留草稿；旧作用域回调不会确认成功。
- 旧 App 兼容策略：新增可选页面和契约文件，不改变旧联系人 DTO；旧联系人备注不迁移、不删除，也不再从联系人详情写入。

## 验收结果

- 命令、cwd、运行环境、exit code、通过/失败/跳过：Web 定向 13/13、Web typecheck、App 定向 62/62、联系人详情浏览器 40/40、App typecheck、`git diff --check` 均 exit 0；App 全量 2583/2583、0 skip，exit 0。Web 全量 3004 pass／52 fail／183 skip，exit 1；notes 新测试通过，失败属于既有环境／产品审计，其中 5 个审计子项相对旧文档基线扩大，详见 Sprint REPORT 与保留日志。
- Web 写 → App 回读：未运行，证据：本地两端共用同一严格契约与 HTTP 路由测试；不等同真实同账号回读。
- App 写 → Web 回读：未运行，证据同上。
- 冲突、失败、权限与异步场景：服务测试覆盖 actor 隔离、幂等冲突、版本冲突、并发同版本单一胜者和解除关联；App 覆盖错误回执、取消、冲突与作用域变化。
- 原生 UI/浏览器验证（需要时）：浏览器中的真实 RN Web 组件交互已验证；原生设备未运行。
- 未检查范围：真实 PostgreSQL、远程部署、真实账号与原生设备；未引入迁移，也未写真实数据库。
- 可客观判断的关闭条件：同一环境中完成 Web 创建 → App 刷新读取、App 更新 → Web 刷新读取，并保留 actor 隔离、版本冲突和原生设备证据。

## 更新历史

- 2026-09-15 07:45 JST，Bridge：功能提交 `8e81e588e`；App 全量通过，Web notes 定向通过且 Web 全量既有失败如实保留；真实双向环境仍待提供。
