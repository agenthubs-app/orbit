# Sprint 0018 — 执行总结

## 2026-09-15 真实共同环境补充验收

原 run-01 结束时缺少的 SC-0018-05 已在同一套本地生产 Web/API、隔离 PostgreSQL、同一登录账号和原生 iOS Simulator 中补齐；这次只恢复外部验收，没有重开 Generator 或修改功能代码。Sprint 当前状态更新为 `completed`。

- Web 生产构建通过（Next.js 16.2.9，48 个静态页面，TypeScript 通过），构建产物启动于 `http://127.0.0.1:31019`，`/api/health` 返回 live；App 以 `EXPO_PUBLIC_ORBIT_API_BASE_URL=http://127.0.0.1:31019` 原生编译安装，0 error／0 warning。
- Web/API 创建 `note:5a6524e05324e73d81b111b0` 版本 1 和两个联系人后，原生 App 登录同一账号并显示相同正文、版本及联系人集合。Web 将其更新为版本 2 后，App 离开并重新打开同一路由，读取到版本 2 和新正文。
- 原生 App 创建 `note:9e1a9fb78898e1482913a975` 版本 1 并关联一个联系人后，运行中的 Web API 回读到相同 ID、正文、版本、联系人及 owner。
- 对版本 2 笔记再提交 `expectedVersion: 1` 返回 HTTP 409／`CONFLICT`；第二个独立登录账号读取该笔记返回 HTTP 404／`NOT_FOUND`，没有泄露私有正文。
- 脱敏原始证据位于 `build/live-e2e-0019/`：`web-note-in-native-app.png`、`app-write-web-read-evidence.json`、`web-note-update-v2.json`、`web-note-stale-conflict.json`、`secondary-note-read.json`。登录 cookie、token 与密钥不进入报告或提交。

因此 SC-0018-05 当前为 `pass`。原报告下方保留 run-01 当时的 `blocked` 事实，用于追溯，不再代表当前 Sprint 状态。本次环境是本地生产 Web 进程与 iOS Simulator，不代表远程部署或实体设备发布验收；这两项不属于 SC-0018-05 的必要条件。

## 目标实现情况

- 本轮实现了 actor 私有的独立笔记：一份正文可关联多人，支持列表、创建、详情、版本更新、解除单个关联和幂等重试；App 首页“记笔记”进入真实创建页，联系人详情只读展示旧备注并进入独立笔记。
- 本地已验证正文单份存储、多人关联、越权拒绝、版本冲突、并发单胜者、失败保稿、取消不创建空记录、旧入口不再写联系人备注，以及 Web/API 契约与 App 严格解码一致。
- run-01 结束时尚未执行真实共同环境验收；2026-09-15 09:21 JST 已按上方补充完成，SC-0018-05 当前为 pass，Sprint 当前为 completed。未创建数据库迁移、未部署。

## 运行记录

- 目标／原需求：R-13 核心；独立私有笔记、多人关联、权限、版本／幂等和旧入口安全切换。
- 结果：run-01 历史结果为 blocked；补充验收后当前为 completed。
- run：run-01；Generator owner `/root`；开始 2026-09-15 06:55 JST，结束 2026-09-15 07:45 JST。
- Planner revision／SHA256：revision 3；`750df5d4ceb63b6691de6b61667eda96152da779833ead97e1b171c02057b79b`。
- 基线 HEAD／承接的脏文件：`40338854659b1408ea9903b19a043d56a214352f`；根 `AGENTS.md`、`CLAUDE.md` 为既有用户改动，本轮未写、未暂存、未提交。
- 被验收的最后功能 HEAD：`8e81e588e20934d3633e839b902ab011d21e1d6a`。
- 环境／账号角色／设备（脱敏）：原 run 使用 Node 测试 actor 与 React Native Web 渲染器；补充验收使用生产构建的 live Web/API、隔离 PostgreSQL、两个独立 QA 登录账号和原生 iOS Simulator。

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
| SC-0018-05 | pass | 同一 live Web/API、隔离 PostgreSQL、同账号 Web/App 双向读写与刷新；iOS Simulator 原生 App；第二账号与 stale update 反例 | 同一 note ID／version／联系人集合双向一致；Web 更新后 App 读到版本 2，stale 写 409，非 owner 读取 404。 |

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

原 run 必需但未执行的 Web 创建→App 刷新读取、App 创建→Web 刷新读取、真实 actor 隔离／冲突和原生 App 交互已由上方补充验收完成。GitNexus `detect_changes(scope: staged)` 在固定主检出索引上返回 0，无法看到当前 worktree 暂存区；提交前另用 `git diff --cached --name-status` 与 `git diff --cached --check` 核对 38 个功能文件，排除了用户根文件。

## 交接

- 已验证成果／仍欠功能：功能 commit `8e81e588e` 提供 Web/API 与 App 笔记核心；SC-0018-05 已补齐，本 Sprint 无剩余必需 SC。
- 未提交改动、文件所有权及活进程句柄：报告生成时仅本轮 Bridge／登记文档待提交；根 `AGENTS.md`、`CLAUDE.md` 属于用户；没有测试活进程。
- App／API 实际版本、另一端影响：两端同在 `8e81e588e`，共享 `NoteContract`；App 依赖 `/api/notes` 集合、详情和解除关联接口。
- 费用：原累计 `$0.012780 / $5`；本轮模型／OCR／付费服务新增调用 0，累计不变。
- 已知风险／恢复或回退方式：已验证隔离 PostgreSQL 和本地生产进程，尚不证明远程部署或实体设备发布状态；可按 commit 定向 revert，不自动迁移或删除其他数据。
- 下一步／依赖恢复条件／需 Planner 处理的失败 SC：本 Sprint 无失败 SC；发布负责人可在远程部署和实体设备就绪后另做发布验收，不影响本 Sprint 关闭。
