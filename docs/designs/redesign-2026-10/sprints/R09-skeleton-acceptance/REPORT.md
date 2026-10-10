# Sprint R09 — REPORT

**执行人：** 小雨的执行会话，2026-10-10。**依据：** PLANNER 修订 2、README 通用规则、RD-03、RD-24、RD-25。
**基线：** 骨架开始时 `9d404c1c8`（README 通用规则 1：App 4062 条 / 1 条已知失败 `/start`；orbits 6811 条 / 0 失败）。
**证据：** `~/orbit-sprint-evidence/redesign/R09/run-01/`（`orbits-test.log`、`app-test.log`、`typecheck*.log`、`lint.log`、`app-tsc.log`、`web/` 与 `web2/` 走查截图和结果、`app/` 模拟器截图、`detect-changes-*.txt`）。**截图集：** https://claude.ai/artifact/S8PXMfqVrY9nusMFtfdCHY

## 做了什么

1. **规则入库**：`repos/orbits/AGENTS.md` 加「redesign 开发规则」一节（分支、契约、迁移、新代码约定、旧屏、热点文件归属建议表、收口）。同样的文字放在 [`AGENTS-redesign-section.md`](AGENTS-redesign-section.md)。**`repos/orbit-app/AGENTS.md` 没有改**：它在本次任务的「不碰用户文件」清单里，需要人工把这一节贴进去（见「需要人工」）。
2. **开发说明**：[`HOW-TO-START-A-FEATURE-SPRINT.md`](HOW-TO-START-A-FEATURE-SPRINT.md)（组件与展示页、壳的插槽、演示世界与切真实接口、「尚未实现」、跨人依赖空态、文案与 copy-qa、两端各 4 处路由登记、截图对照页、改契约与热点文件、收口）。另一个 AI 会话只照着它做了一遍演练（SC-02，见下）。
3. **全流程走查**：[`walkthrough.md`](walkthrough.md)。Web 13 个已登录页面 × 三档宽度 × 浅深、中英日、键盘、减少动效；App 五个页签和主要二级页 × 浅深、日中英、最大字号。发现 5 条：2 条中等代码问题已修（窄屏收件箱溢出、⌘K 焦点），1 条中等是本地环境（同步密钥缺失），2 条轻微登记给功能 Sprint。
4. **截图集**：两端主要页面、设计稿画板、组件展示页，已知例外和三份允许清单的条数（artifact，链接见上）。
5. **基线回到骨架开始时的口径**（之前各 Sprint 带着的既有失败，这里逐条处理）：
   - orbits 5 条 `DEP0205`：Node 26 对 tsx 的 `module.register()` 在每个子进程里打弃用提示，断言 stderr 为空的测试因此失败。测试启动器给子进程加 `--disable-warning=DEP0205`（只屏蔽这一条）。
   - orbits 审计「visible controls have static accessible-name evidence」：审计生成器不认 R04 / R06 组件必填的 `label` 属性；改为认大写组件的 `label`。App `Scrim`（遮罩）补上 `accessibilityElementsHidden` 和 `importantForAccessibility="no-hide-descendants"`，与它本来的 `accessible={false}` 一致。
   - App `offline-pages-profile-events` 两条：测试数据写死了 `2026-10-10T01:00Z`，今天它变成了过去的活动，被「即将开始」筛掉。改为相对当前时间 7 天后。
6. **审计清单重新生成**：`inventory.json` 与产品清单长期没重生成，R07 新建的 `/app/inbox` 等 4 个页面不在里面。重新生成后 `web-route-transport` 的页面数 53 → 57、要登录的跳转 23 → 27（R07 复核 m7 关闭）。
7. **README**：写入「合回 `chat-agent` 前总验收」清单；分支命名规则改为全连字符。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 规则入库 | ⚠️ 一半 | orbits `AGENTS.md` 已写；App `AGENTS.md` 和归属表的产品确认需要人工 |
| 02 开发说明可用 | ✅（第二次演练） | 第一次演练卡在分支名和 `route-parity`，说明修订后第二次演练两端都做完、没问人、零新增失败；见「开发说明演练」 |
| 03 走查无严重问题 | ✅ | `walkthrough.md`：Web 40 个页面 × 4 档共 160 次访问 + 键盘 / ⌘K；App 五个页签、Task 四段和 16 个二级页 × 浅深 / 三语 / 最大字号。无严重；中等的代码问题 W1、W2、W4 已修并有复查证据 |
| 04 截图集 | ✅ | artifact（版本 3）：每节设计稿画板与实现并排，含 App iOrbit 页签、Web 40 页、390 打开态、深色 web.html、已知例外的负责 Sprint |
| 05 基线对照 | ✅ | 见「基线对照」 |
| 06 拍板 | 待人工 | 独立复核 `REVIEW.md`；产品负责人看截图集并试用 |

## 开发说明演练（SC-02）

**第一次**：另一个 AI 会话（全新上下文）只读开发说明，在临时分支 `redesign-R09-drill` 上做了一个虚拟小功能：`/app/drill` 占位页（新壳标题 + `EmptyState`）、`GET /api/drill/summary` mock 接口（契约、zod、演示世界数据、live 503）、三语文案表、登录前缀与审计清单登记、「尚未实现」时隐藏数据行。约 10 分钟做完；copy-qa、`typecheck`、`typecheck:app`、相关 orbits 测试 60 条和 58 条全过，App `contract-sync` / `contract-fixtures-parse` 通过。唯一没做完的是 App `route-parity`：新 Web 页面需要 App 路由或用户决定的例外，演练会话按规则没有自作主张——这正是说明里缺的一条。演练分支已删除（只在本地，从未 push；`drill-diffstat.txt` 留了文件清单）。

演练提出 15 条说明的缺口，处理如下（说明已改）：

| # | 缺口 | 处理 |
| --- | --- | --- |
| 1 | 分支名 `redesign/R…` 建不了（已有 `redesign` 分支） | 两处规则和说明都改为 `redesign-R<编号>-<主题>` |
| 2、15 | GitNexus 索引落后，新符号查不到，`detect-changes` 结论不可信；改一张表也报 CRITICAL | 开工和收口都先 `analyze --index-only`；说明 CRITICAL 的常见情形和对策写法；本次也已重建索引 |
| 3 | 只讲用已有契约，没讲新增一个契约要改的 8 处 | 新增第 3 节第 5 步，逐处列出 |
| 4 | 只改 `shared/**` 也必须 `sync:contract` | 单列为第 6 步 |
| 5 | 没提 `ORBIT_REDESIGN_MOCK` | 第 7 步 |
| 6 | 「尚未实现」示例太简略 | 换成完整示例：拆信封、隐藏哪一块、真正故障照常报错 |
| 7 | `ShellPage` 在作用域外取文案会退回日文；`rightRail` 不传的效果 | 第 2 节补插槽的四条规则 |
| 8 | copy-qa 的 kind 和常见规则 | 第 6 节补 kind 列表、上限位置和四条常见问题 |
| 9、10 | 审计清单写到工作区根目录；清单过期，计数要改三处 | 第 7 节写明命令、输出位置和三处计数；**清单已在 R09 重新生成**（53 → 57，补进 `/app/inbox`、`/app/start`、`/app/profile/onboarding`、`/app/admin/read-cost`），功能 Sprint 从干净的清单开始 |
| 11 | `shell-routes` 和 `PAGE_CONTEXTS` 什么时候要改 | 第 7 节写明默认行为 |
| 12 | `npm run lint` 不覆盖新文件 | 第 10 节说明靠 typecheck 和门禁 |
| 13 | 只做 Web 页面也会碰到 App `route-parity` | App 第 4 处写明，并说明例外只能由用户决定 |
| 14 | App 基线不是零（`/start`） | 是 README 通用规则 1 记录的用户决定，写进合回前总验收 |

**第二次**（说明修订后，复核 M5）：又一个全新会话照着修订后的说明，在两端各做一个「練習」占位页（Web `/app/practice`、App `/practice`）加新契约 `GET /api/practice/summary`，两端各 4 处登记全做。约 13 分钟，**没有问人**；copy-qa 0、两端 typecheck 0、orbits 相关 114 条全过、App 相关 74 条只剩已知的 `/start`。它又找到 12 处说明缺口（App 只跑单个测试文件的命令、App token 用法、新字典域的两处登记、App 路由的 `mobile-route-access` 和 `withOnlineOnlyRoute`、审计要两端路由加完再跑、App 客户端结果没有 `.json()` 等），已全部补进说明。练习分支已删除（本地，从未 push；`redrill-diffstat.txt`）。

## 基线对照

| | 骨架开始（`9d404c1c8`） | R09 收口 |
| --- | --- | --- |
| orbits `npm test`（en-US） | 6811 条，0 失败 | **6942 条，0 失败**，872 跳过（与开始时相同的跳过集） |
| App `npm test` | 4062 条，1 失败（`/start`） | **4172 条，1 失败（`/start`）** |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 | 0 / 0 / 0 |
| App `tsc` | 0 | 0 |
| `next typegen` + `tsc`（Next 16 路由类型） | — | 0 |
| `copy:qa`（全部来源） | — | 206 条，0 问题 |

上面两行都在最终提交 `63fbdb42` 上跑（日志在 `final-63fbdb42/`，含 `HEAD.txt`）。复核时指出的旧日志问题：第一版 REPORT 用的全量早于审计清单重生成，App 那次有 4 条失败（3 条在模拟器走查同时运行）；现在以这次为准。

**新门禁**（都在全量里，全部通过）：对比度（`orbit-contrast-tokens`、App `design-tokens`）、生成文件一致（`design-tokens-generated`、`icon-source-sync`、`contract-sync` / `compute-sync` / `api-schema-sync`）、新代码无写死文字（两端 `no-hardcoded-copy`）、新代码无旧写法和 Ionicons（`legacy-ui-ratchet`、`ionicons-ratchet`、`orbit-button-ratchet`）、新作用域（`orbit-2026-scope`）、新 CSS 不写死颜色（`orbit-2026-css-tokens`）、只加不改（`contract-append-only`、`redesign-schema-parity`）。

**三份允许清单（骨架结束时，只减不增）**：App Ionicons 71 个文件；App 写死文字 148 个文件 / 3779 处；App 旧写法 85 个文件 / 282 处；Web 写死文字 232 个文件 / 2305 处写死 + 3669 处缺日文。

## GitNexus

- 改动前的 impact：`Scrim` LOW（3 个直接调用方，只加两个无障碍属性）；`CommandPalette`、`RelationshipInboxPage` UNKNOWN（R07 新符号），文本搜索确认只有壳和收件箱页使用；测试启动器、审计生成器是脚本，不在调用图里。
- 索引在 R09 收口前重建（`analyze --index-only`，图和向量完成；关键词索引报 FTS 构建失败，需要时用 `gitnexus analyze --repair-fts` 修复，不影响 impact）。
- `detect-changes --scope all`（`detect-changes-2.txt`）：15 个文件、15 个符号、0 条流程，与本 Sprint 改动一致；对骨架起点 `9d404c1c8` 的整体比较（`detect-changes-vs-skeleton-start.txt`）：962 个文件、754 个符号、224 条流程——R01–R09 的全部改动。

## 复核处理

独立复核（`REVIEW.md`）：有条件通过，5 M / 8 m，全部处理，见 REVIEW 末尾「处理记录」。

## 自定决定

1. **App 的 `AGENTS.md` 不改，规则另存一份**：任务约束把它列为用户的未提交文件；规则内容在 sprints 目录里，贴进去即可。
2. **DEP0205 用启动器统一屏蔽**，不逐个改测试：这是运行时环境（Node 26 + tsx）的提示，不是被测代码的输出；只屏蔽这一个编号，其他警告照常。对标：Node 官方建议用 `--disable-warning=<code>` 处理已知的第三方弃用。
3. **审计器认组件的 `label`**：R04 / R06 的按钮组件要求 `label` 并把它渲染为可读名称，这是设计系统的约定；与其在每个调用处重复 `aria-label`，不如让审计懂这个约定（产品清单扫描器同样处理，R07）。
4. **App 的减少动效、断网沿用 R04 / R05 的走查**：模拟器没有切换这两项的命令行开关；R05 之后 App 壳没有再改（R06–R09 只改了 Web 和 R04 组件的无障碍属性）。Web 的减少动效本轮实测过。
6. **旧页面对话框被胶囊遮住，在壳层统一处理**（页面有打开的对话框时，左栏和胶囊降到 `--z-raised`），不逐个改旧页面的 `z-index`：至少 6 个旧页面的遮罩用 60–100，逐个改既违反 RD-24 也容易漏。对标 iOS：模态出现时标签栏在模态之下。
5. **截图集用 artifact 发布**（PLANNER 要求），图片压缩为 JPEG，深色、三语、宽度可筛选。

## 交接

- 规则：`repos/orbits/AGENTS.md`「redesign 开发规则」；App 侧同文在 `AGENTS-redesign-section.md`。
- 开发说明：`HOW-TO-START-A-FEATURE-SPRINT.md`。
- 截图集：https://claude.ai/artifact/S8PXMfqVrY9nusMFtfdCHY
- 已知例外与合回前总验收：README「合回 `chat-agent` 前总验收」。
- 接下来按 PLANNER：先写 R21（iOrbit）和 R22（计划）的 Sprint 文档。

## 需要人工

1. 把 `AGENTS-redesign-section.md` 贴进 `repos/orbit-app/AGENTS.md`（链接改成相对 App 目录的路径）。
2. 产品负责人确认热点文件归属表，结果改在两端 `AGENTS.md`。
3. 产品负责人看截图集、在模拟器和浏览器里试用，同意结束骨架（SC-06）。
4. 本地 `repos/orbits/.env.local` 补 `ORBIT_SYNC_CURSOR_SECRET`（任意随机长串）并重启 dev server，App 的待办、人脈才能在本地同步。
