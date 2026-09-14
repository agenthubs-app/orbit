# Sprint 0018 — 执行总结

## 目标实现情况

- 本轮实现了 actor 私有的独立笔记：一份正文可关联多人，支持列表、创建、详情、版本更新、解除单个关联和幂等重试；App 首页“记笔记”进入真实创建页，联系人详情只读展示旧备注并进入独立笔记。
- 本地已验证正文单份存储、多人关联、越权拒绝、版本冲突、并发单胜者、失败保稿、取消不创建空记录、旧入口不再写联系人备注，以及 Web/API 契约与 App 严格解码一致。
- 尚未在同一真实账号与环境中执行 Web 写→App 回读、App 写→Web 回读及原生设备验收，因此 SC-0018-05 受阻，本 Sprint 结果为 blocked。未创建数据库迁移、未访问真实数据库、未部署。

## 运行记录

- 目标／原需求：R-13 核心；独立私有笔记、多人关联、权限、版本／幂等和旧入口安全切换。
- 结果：blocked；本地功能已提交，真实同账号跨端与原生证据缺失。
- run：run-01；Generator owner `/root`；开始 2026-09-15 06:55 JST，结束 2026-09-15 07:45 JST。
- Planner revision／SHA256：revision 3；`750df5d4ceb63b6691de6b61667eda96152da779833ead97e1b171c02057b79b`。
- 基线 HEAD／承接的脏文件：`40338854659b1408ea9903b19a043d56a214352f`；根 `AGENTS.md`、`CLAUDE.md` 为既有用户改动，本轮未写、未暂存、未提交。
- 被验收的最后功能 HEAD：`8e81e588e20934d3633e839b902ab011d21e1d6a`。
- 原环境／账号角色／设备（脱敏）：本地 Node 测试环境、测试 actor；React Native Web 测试渲染器；没有真实账号、共享部署或原生设备。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| actor 隔离、单正文、多联系人、版本冲突、幂等与并发串行 | `repos/orbits/features/notes/**`、`repos/orbits/app/api/notes/**`、`repos/orbits/shared/contract/notes.ts` | `8e81e588e` | SC-0018-01～03 |
| App 笔记列表／创建／详情、联系人选择、严格解码与失败保稿 | `repos/orbit-app/app/notes/**`、`src/screens/notes/**`、`src/view-models/notes.ts`、`src/api/**` | `8e81e588e` | SC-0018-01～04 |
| 首页入口及旧联系人备注只读切换 | `HomeDashboardScreen.tsx`、`ContactNotesSection.tsx` 和相应测试 | `8e81e588e` | SC-0018-04 |
| 契约、HTTP、服务与真实组件交互回归 | `repos/orbits/tests/**notes**`、`repos/orbit-app/tests/**notes**` 及联系人／首页回归 | `8e81e588e` | SC-0018-01～04；SC-0018-05 仅本地契约部分 |

## 验收结果

| SC | pass / fail / blocked / not_run / not_applicable | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0018-01 | pass | Web note service/API tests；App notes browser/view-model tests | 同一 ID／版本的单正文可关联多人，更新后各入口读取同一记录。 |
| SC-0018-02 | pass | actor 隔离、解除关联、正文保留与 App 只读旧入口测试 | 跨 actor 返回不可见；解除一人不删除正文或其他关联。 |
| SC-0018-03 | pass | 幂等键、期望版本、并发同版本更新、错误回执和作用域变化测试 | 冲突不覆盖新版本，失败保留草稿，重试不重复创建。 |
| SC-0018-04 | pass | 首页、创建取消、笔记详情、联系人旧入口浏览器回归 | “记笔记”位于确认位置；取消不写空笔记；旧联系人备注无写操作，合法资料编辑回归通过。 |
| SC-0018-05 | blocked | 本地共享契约、HTTP 和 App 消费已通过；未运行真实同账号 Web↔App 与原生设备场景 | 缺共同运行环境、真实账号和原生设备，不能用本地 mock／组件测试代替双向回读。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| Web notes service/API/contract 定向测试 | `8e81e588e` 前，2026-09-15 | exit 0；13 pass、0 fail | SC-0018-01～03 |
| Web `npm run typecheck` | 同上 | exit 0 | 契约与 API 编译边界 |
| App notes/contact/home/routes/contract 定向测试 | 同上 | exit 0；62 pass、0 fail | SC-0018-01～04 |
| App 联系人详情浏览器回归 | 同上 | exit 0；40 pass、0 fail | SC-0018-04 |
| App `npm run typecheck` | 同上 | exit 0 | App 路由／消费边界 |
| App `npm test` | 同上 | exit 0；2583 pass、0 fail、0 skip | H 档 App 受影响端全量；日志 `build/harness-logs/sprint-0018-app-full.log` |
| Web `npm test` | 同上 | exit 1；3004 pass、52 fail、183 skip | H 档 Web 全量；新增 notes 测试通过。52 项为既有环境／产品审计失败；其中 5 个审计子项相对文档旧基线扩大，分别为既有 DataCard 路由清单、字面路由分支、导航回放计数、AI query 参数以及运行时路由覆盖（新增 3 个 notes 路由也进入既有未覆盖清单）。日志 `build/harness-logs/sprint-0018-web-full.log` |
| `git diff --check` | 功能暂存内容 | exit 0 | 全部本地实现 |

首次 App 全量暴露两处仍期待旧联系人备注写入的测试；按新入口契约迁移后，相关 40/40、7/7 及最终 App 全量均通过。Web 全量失败没有被记成通过，也没有为本 Sprint 修改无关旧审计。

必需但未执行：真实 Web 创建→App 刷新读取、App 更新→Web 刷新读取、真实 actor 隔离／冲突，以及原生设备交互。GitNexus `detect_changes(scope: staged)` 在固定主检出索引上返回 0，无法看到当前 worktree 暂存区；提交前另用 `git diff --cached --name-status` 与 `git diff --cached --check` 核对 38 个功能文件，排除了用户根文件。

## 交接

- 已验证成果／仍欠功能：功能 commit `8e81e588e` 提供本地 Web/API 与 App 笔记核心；只欠 SC-0018-05 的真实共同环境双向回读和原生证据。
- 未提交改动、文件所有权及活进程句柄：报告生成时仅本轮 Bridge／登记文档待提交；根 `AGENTS.md`、`CLAUDE.md` 属于用户；没有测试活进程。
- App／API 实际版本、另一端影响：两端同在 `8e81e588e`，共享 `NoteContract`；App 依赖 `/api/notes` 集合、详情和解除关联接口。
- 费用：原累计 `$0.012780 / $5`；本轮模型／OCR／付费服务新增调用 0，累计不变。
- 已知风险／恢复或回退方式：内存型通用记录存储仅证明服务／HTTP 行为，不证明真实 PostgreSQL 或部署；可按 commit 定向 revert，不自动迁移或删除旧数据。
- 下一步／依赖恢复条件／需 Planner 处理的失败 SC：在同一可访问部署、同一账号及原生设备上执行 BR-009 的双向写读、刷新、版本冲突和越权场景后关闭 SC-0018-05。该外部阻塞不阻止 0019 使用已提交的本地 note ID／version 契约继续实现。
