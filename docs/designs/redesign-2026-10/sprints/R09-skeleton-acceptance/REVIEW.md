# Sprint R09 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `git diff 40f195d7..fcb49b43`（`339ff05a` 第 1 部分：规则、开发说明、基线修复、走查修复；`fcb49b43` 第 2 部分：走查记录、开发说明修订、审计清单重生成、README 总验收、REPORT），在 `redesign` HEAD `fcb49b43` 上复核。`docs/audits/**` 是机器输出，只做了抽查。
**依据：** PLANNER 修订 2（唯一契约）、GOAL.md、README 通用规则与 RD-03 / RD-24 / RD-25；REPORT、`walkthrough.md` 只作线索。证据目录是 `~/orbit-sprint-evidence/redesign/R09/run-01/`。截图集用 Artifact read 读到了页面源码（`S8PXMfqVrY9nusMFtfdCHY`，128 个文件）。
**基线：** 骨架开始时 `9d404c1c8`：orbits 6811 条 / 0 失败；App 4062 条 / 1 失败（`/start`）。

## 结论：有条件通过

下面这些主体已经做到，复核人逐项核实过：
- **规则入库（orbits 一侧）**：`repos/orbits/AGENTS.md` 的「redesign 开发规则」与 `AGENTS-redesign-section.md` 逐字一致（只差相对链接前缀，复核人 diff 过）。PLANNER §1 要求的分支、契约、迁移、新代码约定、热点归属五项都在。
- **基线修复的三处代码改动是对的**：
  - DEP0205 只屏蔽这一个编号。复核人实测 Node v26.10.0 + tsx 4.19.2：`node --import tsx -e 1` 会打印 DEP0205，加 `--disable-warning=DEP0205` 后 stderr 为空。被它弄红的 3 个文件（`event-canonical-membership-operator-runner`、`event-profile-contract-repair-operator-runner`、`relationship-lifecycle-preflight-cli`）断言的是「导入没有副作用 → stderr 为空」，其他输出照样会让它们失败。
  - 时钟修复让 `offline-pages-profile-events` 不再依赖日期。
  - 审计生成器新增的 `label` 分支目前命中 27 处，全是新组件库的 `Button`（App R04、Web R06）。复核人确认两端 `Button` 都把 `label` 渲染成可读名称。
- **复核人重跑的定向测试**：
  - orbits `tests/audits/` + `event-canonical-membership-operator-runner`：170 条，0 失败；
  - orbits `orbit-2026-*` + `app-inbox-page`：47 条，0 失败；
  - App `offline-pages-profile-events` + `use-loading-deadline` + `ink-signal-event-operations`：28 条，0 失败；
  - orbits `tsc -p tsconfig.json` 退出码 0，App `npx tsc --noEmit` 退出码 0。
- **三份允许清单的条数**与 REPORT、README 一致。复核人直接读的 fixture：Ionicons 71 个文件；App 写死文字 148 个文件 / 3779 处；App 旧写法 85 个文件 / 282 处；Web 写死文字 232 个文件。
- **开发说明**：抽查 27 条引用，24 条准确（见下文「开发说明抽查」）。

但有 **5 条中等问题**：
- **M1**：截图集没有按 PLANNER 把设计稿画板与实现并排，并且缺 App 的 iOrbit 页签。
- **M2**：走查覆盖面明显小于 PLANNER §3。
- **M3**：W1、W2 写着「已修并复查」，但证据目录里的第二轮结果恰好是修复前的状态。W2 也没有回归测试。
- **M4**：SC-05 的全量日志不对应最终 HEAD。App 日志实际是 4 条失败。
- **M5**：SC-02 记为 ✅ 偏乐观：演练没有做到「全程不用问人」，修订后的说明也没有再验证。

没有严重问题。

**条件：**
- M1–M5 在 `redesign` 上修完（RD-25）。
- 人工项完成：
  - 把规则贴进 App `AGENTS.md`；
  - 产品负责人确认热点文件归属表；
  - 产品负责人看过**修好后的**截图集并试用。

这两项都完成后，才算结束骨架。M1、M4 应该排在产品负责人拍板之前：拍板依据的正是这两份材料。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 规则入库 | ⚠️ 一半（与 REPORT 一致） | orbits `AGENTS.md:141-167` 与 `AGENTS-redesign-section.md` 一致。App `AGENTS.md` 按任务约束没有改，这个处理合理，但 SC 仍然没有达成。归属表还没有确认。另外，这一节被放进了 GitNexus 自动维护的区块里（m1） |
| 02 开发说明可用 | ⚠️（REPORT 记 ✅） | 演练分支已删除（`git branch -a` 没有 `drill`），`drill-diffstat.txt` 有 30 个文件，与 REPORT 描述一致。但演练卡在 App `route-parity`，那一步要人来决定，加上分支名建不出来，SC 要求的「全程不用问人」没有达成；修订后的说明也没有重新演练（M5）。抽查发现说明里仍有不准确的地方（m8） |
| 03 走查无严重问题 | ⚠️ | `walkthrough.md` 没有未处理的严重问题。覆盖面不足（M2）。两条中等问题的「复查」没有证据（M3） |
| 04 截图集 | ⚠️ | 两端主要页面都有，深色、三语、宽度都能筛选。但设计稿只有 5 张，放在单独的页签里，没有逐张并排。App 缺 iOrbit 页签。已知例外没有按 `screen-ownership.md` 写到具体 Sprint（M1） |
| 05 基线对照 | ⚠️ 结论大概率成立 / 证据不对应 HEAD | `orbits-test.log` 写着 6940 / 0 失败 / 872 跳过，但它是 15:14 跑的，比 inventory 重生成（15:58）和 `web-route-transport` 改成 57 都早。`app-test.log` 是 4172 条、**4 条失败**。复核人对改过的部分做了定向重跑，全部通过，typecheck 退出码 0（M4） |
| 06 拍板 | 待人工 | 本 REVIEW。产品负责人还没有拍板 |

## 运行时抽查

### 重跑

| 命令 | 结果 |
| --- | --- |
| orbits `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node scripts/run-node-tests.mjs tests/audits/ tests/services/event-canonical-membership-operator-runner.test.ts` | 170 条：166 通过、4 跳过、0 失败（含 `web-route-transport` 的 57 页、`visible controls have static accessible-name evidence`） |
| orbits `run-node-tests.mjs tests/ui/orbit-2026-*.test.ts* tests/pages/app-inbox-page.test.tsx` | 47 / 47 |
| orbits `tsc --noEmit --incremental false -p tsconfig.json` | 退出码 0 |
| App `node --test … offline-pages-profile-events use-loading-deadline ink-signal-event-operations` | 28 / 28 |
| App `npx tsc --noEmit` | 退出码 0 |
| `node --import tsx -e 1`，加与不加 `--disable-warning=DEP0205` | 不加时打印 DEP0205；加了以后 stderr 为空 |

### 探针（只读，不改仓库）

| 探针 | 结果 |
| --- | --- |
| 统计新 inventory 里「只靠组件 `label` 得到名字」的控件 | 27 处，全部是 `Button`（App `components/ui`、showcase、`OnlineOnlyBoundary`、`HomeDashboardScreen`；Web `orbit-2026/ui/States`、`ShellDemoPill`、`HomePlaceholder`）。目前没有误判，但规则本身太宽（m2） |
| 读 `web2/walkthrough-results.json`（REPORT 说是「修复后第二轮」） | 4 次访问 `/app/inbox@390` 的 `hScroll: true`；键盘一轮 `focusInInput: false`。文件时间是 15:28–15:32，早于提交修复的 `339ff05a`（15:37）。也就是说，这一轮是**发现**问题的那一轮，不是复查（M3） |
| 读截图集源码 | `DATA.app` 里没有 `agent-*`，虽然证据目录 `app/` 里有 6 张 iOrbit 截图；设计稿只有 `01-system`、`b11-nav-v3`、`web-light` 5 张（M1） |
| GitNexus `ai-context.js` 的 `upsertGitNexusSection` | 发现 `<!-- gitnexus:start -->` 与 `<!-- gitnexus:end -->` 之间的内容在内容变化时会被**整段替换**（m1） |
| `grep onAccessibilityEscape src/components/ui` | 0 处（m4） |
| 时钟平移（把测试进程的 `Date` 往后挪 1–14 天）跑 App 带固定日期的 9 个文件 | 有 2 条失败，但原因是 Playwright 浏览器的时钟没有一起挪，探针本身无效，**不算问题**。orbits 7 个页面 / 服务测试平移 14 天后 221 条全过 |

## 开发说明抽查（27 条，24 条准确）

| # | 说明里的说法 | 核对 |
| --- | --- | --- |
| 1 | App 展示页 `/showcase/components`、`/icons`、`/copy` | ✅ `app/showcase/*.tsx` |
| 2 | Web `orbit-2026/ui/index.ts` 导出 `Button`、`ListRow`、`Modal`、`Drawer`、`Popover`、`useToast`、`Table`、`EmptyState` | ✅ |
| 3 | `npm run design:tokens`、`copy:qa`、`audit:full-product`、`audit:surfaces`、`typecheck:app`，App `sync:contract` | ✅ `package.json` |
| 4 | App token `src/api/design/tokens.ts` | ✅ |
| 5 | `TaskScreen.tsx` 的 `TASK_SLOTS` | ✅ `:33` |
| 6 | `ShellPage` 在 `shell/slots.tsx`，插槽 `title / subtitle / right / rightRail` | ✅ `:62-65`（另有 `left`、`demoPill`） |
| 7 | `orbit-2026/task/TaskContainer.tsx` | ✅ |
| 8 | 契约 8：`shared/contract/event-assessment.ts`、`shared/api-schema/event-assessment.ts`、`GET /api/events/assessments` | ✅ |
| 9 | 演示世界有「SaaS Summit 2026」、78 分、10 人 / 3 场活动 | ✅ `demo-world/index.ts:49`、`fixtures.ts:195` |
| 10 | `demo-world-consistency`、`demo-world-copy` | ✅ `tests/contracts/`、`tests/copy-qa/` |
| 11 | `REDESIGN_CONTRACT_CAPABILITIES`、`mock-service.ts`、`handlers.ts` 用 `redesignContractRoute` | ✅（`redesignContractRoute` 定义在 `route.ts`，`handlers.ts` 导入它） |
| 12 | `tests/api/redesign-contract-routes.test.ts` 的 `CASES`、`redesign-schema-parity.check.mts`、`scripts/contract-snapshot.mjs` | ✅ |
| 13 | `ORBIT_REDESIGN_MOCK`：逗号分隔或 `all`，生产忽略 | ✅ `route.ts:18-29`（看 `NODE_ENV !== "production"`） |
| 14 | `whenNotImplemented(body, { use: "hide" })` 不是「尚未实现」时返回 null；`use: "default"` 返回 `{ show: true, value }` | ✅ `shared/compute/not-implemented.ts` |
| 15 | 示例里的 `<RetryState … />` | ❌ 不存在，两端都叫 `RetryCard`（m8） |
| 16 | App 的导入路径 `../api/compute/not-implemented` | ⚠️ 文件存在，但从 `src/screens/<域>/` 出发要写 `../../`，说明没有像 Web 那样提示「按层级数」（m8） |
| 17 | `src/i18n/copy-kinds.ts`；`LENGTH_LIMITS` / `EN_LENGTH_LIMITS`；`APP_DOMAINS_IN_SCOPE` | ✅ `check.mjs:23,25`、`cli.mjs:11` |
| 18 | copy-qa 的 kind 列表 | ✅ 8 个 kind 都在 copy-qa 里 |
| 19 | App `PRIVATE_ROUTE_PREFIXES`、`integratedFeatureRoutes`、`page-offline-inventory.ts` → `docs/offline/page-inventory.md`、`route-parity(-exceptions).ts` | ✅ |
| 20 | `parentForPath`、`notification-model.ts` | ✅ `app-navigation.ts:57`、`src/notifications/` |
| 21 | Web `ORBIT_PRIVATE_APP_PREFIXES`、`proxy.ts` 的 `isPublicApiPath` | ✅ |
| 22 | `audit:full-product` 写到工作区根目录 `docs/audits/` | ✅ `WORKSPACE_ROOT` |
| 23 | `web-route-transport` 的三处计数、`verify-web-route-transport.mjs`，「R09 结束时是 57 页」 | ✅（复核人重跑通过） |
| 24 | `shell-routes.ts` 的 `shellNavKeyFor`、`orbit-ask-routes.ts` 的 `PAGE_CONTEXTS` | ✅ |
| 25 | `pickCopy`、`standardCopyFor`、`useOrbitLanguage`、`useStandardCopy` | ✅ |
| 26 | GitNexus `impact … -f <文件> --summary-only` | ✅ CLI `--help` 有这两个参数 |
| 27 | 第 0 步开个人分支、第 10 步「提交并 push」 | ⚠️ 与 README 第 10 行 / RD-25「不开 Sprint 分支」冲突；也没写个人分支怎么合回（m7） |

## 问题清单

### 严重

无。

### 中等

**M1 截图集没有做到「每张和设计稿画板并排」，缺 App 的 iOrbit 页签，已知例外没有落到具体 Sprint**
- **现象**：截图集把设计稿放在单独的「设计稿画板」页签里，只有 5 张（`01-system` 浅 / 深、`b11-nav-v3` 浅 / 深、`web-light`），与 App / Web 截图没有逐张对应。
- **缺 iOrbit**：`APP_SCREENS` 没有 `agent`，五个页签里的 iOrbit 完全不在。可是证据目录 `app/agent-*.png` 有 6 张，「已知例外」表里还写着「App iOrbit 页标题在最大字号下换行」。
- **已知例外太笼统**：只写「R10–R29 按旧屏归属表」，没有像 PLANNER §4 要求的那样「按 `screen-ownership.md` 写明由哪个功能 Sprint 重写」。
- **R06 m8 的交接没有落实**：R06 复核 m8 交给 R09 截图集的「390 打开态」和「`web.html` 深色」，截图集里都没有。只有 1440 的抽屉 / 对话框，设计稿也只有 `web-light`。
- **影响**：SC-04 的主证据就是这个页面，而它正是产品负责人拍板（SC-06）的依据。缺少并排，就不能判断「新壳和组件是否对得上设计」。
- **建议修法**：
  - 每个壳级画面（App 底栏 / Task 四段 / 首页头部、Web 1440 / 1024 / 390 的壳、展示页）配上设计稿对应画板的裁图，左右并排，浅 / 深各一行；
  - `APP_SCREENS` 加上 `agent`；
  - 已知例外按画面列出 `screen-ownership.md` 的负责 Sprint；
  - 补 390 打开态和 `web.html` 深色。

**M2 走查覆盖面明显小于 PLANNER §3，减少动效 / 断网整项沿用旧结果**
- **Web**：PLANNER 要求「所有已登录页面」。现在需要登录的页面至少 27 个（`web-route-transport` 的 `authRedirects`）。走查只覆盖 13 个路径，其中 4 个是 `/app/tasks?tab=…` 这类查询参数变体，实际不同的页面约 10 个。没走到的包括：
  - R07 刚改过「不挂壳」的 kiosk 页；
  - `/app/events/[id]`、`/app/contacts/[id]`；
  - 账号 / 管理页、`/app/start`、`/app/profile/onboarding`。
- **其他维度也只抽了样**：键盘只走了首页；减少动效只看了 ⌘K 面板；中英文只看了 4 页。
- **App**：要求「所有二级页面」，实际只走了 4 个二级页。减少动效和断网整项沿用 R04 / R05，但 R05 之后壳（底栏、Task 四段、首页头部）又改过（R07 复核修复也动了壳）。REPORT「自定决定 4」把它写成了决定，PLANNER 并没有给这个余地。
- **影响**：R07 是「全站一次切换」，没走到的已登录页面最可能出现壳与旧页面重叠、固定控件被胶囊遮住之类的问题。SC-03「无严重问题」的结论只覆盖了样本。
- **建议修法**：
  - Web 用现有 Playwright 脚本把 `inventory.json` 里全部需要登录的页面（动态路由用 `verify-web-route-transport.mjs` 的样例）跑三档宽度 + 深色，检查壳、`hScroll`、控制台错误；
  - App 至少补跑 Expo Router 下所有二级路由的浅 / 深截图；
  - 减少动效、断网在模拟器里用「设置 → 辅助功能」和网络链接调节器各走一遍首页、Task、展示页。做不到的部分写进已知例外，并请产品负责人接受。

**M3 W1 / W2 标为「已修并复查」，但没有复查证据，W2 没有回归测试**
- **现象**：`walkthrough.md:30-31` 写「复查无溢出」「复查焦点在搜索框」，REPORT 也说 `web2/` 是「修复后第二轮」。可是 `web2/walkthrough-results.json` 里：
  - `/app/inbox` 在 390 的 4 次访问都是 `hScroll: true`；
  - 键盘一轮 `focusInInput: false`。

  这些文件写于 15:28–15:32，修复提交 `339ff05a` 在 15:37。所以 `web2` 是**发现**问题的一轮（W1 正是 `40f195d7` 给收件箱加页面边距后才出现的；第一轮 `web/` 里没有溢出），修复后没有留下第三轮证据。
- **W2 没有回归测试**：REPORT 自己承认组件测试里 portal 同步挂载，所以测不出这个问题。这次修复（`CommandPalette.tsx:67-78`）没有配套测试，`orbit-2026-cmdk.test.tsx:47` 的焦点断言在旧代码下也会通过。
- **影响**：两条中等问题算不算关闭，现在只能看执行人的口述。复核人不能登录，也不能起服务，无法替代复查。
- **建议修法**：
  - 修复后重跑同一个脚本，结果存成 `web3/`（或覆盖 `web2/` 并在 walkthrough 里写明时间）；
  - W2 用 Playwright 在真实页面（或 portal 延迟一帧挂载的测试替身）断言 ⌘K 后 `activeElement` 是 combobox；
  - W1 加一条 390 下 `/app/inbox` 没有横向滚动的断言（`orbit-2026-shell` 的 harness 已经能测 390）。

**M4 SC-05 的全量日志不对应最终 HEAD，App 日志实际是 4 条失败**
- **现象**：
  - `orbits-test.log` 结束于 15:14。之后又有改动：inventory 在 15:58 重生成，`web-route-transport.test.ts` 改成 57（`fcb49b43`），⌘K 和收件箱的修复大概率也在全量之后（见 M3）。日志里 `whole-Web transport` 通过时，用的是旧的 53 页清单。
  - `app-test.log`：`tests 4172 / pass 4168 / fail 4`，退出码 1。除了 `/start`，还有 `use-loading-deadline`（断言失败 `2 !== 1`，不只是超时）和 `ink-signal-event-operations` 两条超时。REPORT 写「单独连跑两次都通过」，但没有留日志。截图集的「基线」也写着「App 只剩 `/start`」。
- **复核人做了什么**：定向重跑上述 3 个 App 文件（28 / 28），orbits `tests/audits/`（170 条、0 失败）、`orbit-2026-*`（47 / 47），两端 typecheck 退出码 0。结论大概率成立，但契约要求的主证据是「全量清单」。
- **影响**：README 把「orbits 6940 / 0、App 4172 / 仅 `/start`」写成以后所有功能 Sprint 的对照基线。基线如果不是在冻结的 HEAD 上、无干扰地跑出来的，后面每个 Sprint 的「零新增」都会有争议。`use-loading-deadline` 是计时断言，「模拟器同时跑导致变慢」能解释超时，但解释不了一个计数断言失败，应该确认它是不是计时不稳定（flaky）。
- **建议修法**：
  - 在 `fcb49b43`（或修完 M3 后的提交）上，不跑模拟器，重跑两端全量，存成 `orbits-test-final.log`、`app-test-final.log`，REPORT 的基线表写明提交号；
  - `use-loading-deadline.test.ts:43` 如果确认是计时不稳定，就改用假时钟，或者登记为已知不稳定。

**M5 SC-02 记为 ✅ 偏乐观：演练没有「全程不用问人」，修订版没有再验证**
- **现象**：
  - 演练按原说明建分支 `redesign/R…` 失败；
  - 到 App `route-parity` 时必须由用户决定例外，演练按规则停下了；
  - 一共提出了 15 条缺口。

  SC-02 的操作链是「只照着说明……全程不用问人」，这一轮显然没有达成。说明之后按 15 条缺口改了，但改过的版本没有人再照着走一遍，复核人抽查还发现了新的不准确（m8）。
- **影响**：功能 Sprint 从 R10 开始直接靠这份说明分头开发。SC-02 的意义正是证明「照着做能做完」。
- **建议修法**：
  - 再开一个全新的会话，只照修订版说明，把同一个虚拟功能走到底；
  - 为了不碰用户决定，可以同时加 App 占位路由，走完 App 的 4 处登记；
  - 记录还要问人的地方，修完再记 ✅。

  或者在 REPORT 把 SC-02 改为 ⚠️，写明「修订版未复验」，由产品负责人决定是否接受。

### 轻微

- **m1 orbits `AGENTS.md` 的规则写进了 GitNexus 自动维护的区块**：
  - **现象**：`AGENTS.md:140` 是 `<!-- gitnexus:start -->`，规则在 `:141-167`，区块结束在 `:210`。GitNexus 的 `upsertGitNexusSection`（`dist/cli/ai-context.js`）在内容有变化时会**整段替换**两个标记之间的内容，所以有人在 `repos/orbits` 里跑一次会生成上下文文件的 `gitnexus analyze`，规则就会被悄悄删掉。根目录按说明用 `--index-only`，不会触发这个问题，所以概率不高，但删除是静默的。
  - **修法**：把这一节移到 `<!-- gitnexus:start -->` 之前。以后贴进 App `AGENTS.md` 时也放在标记外面。
- **m2 审计生成器认 `label` 的范围太宽，而且没有测试**：
  - **范围**：`generate-full-product-functional-audit.mjs:8820` 只看标签名是否首字母大写。走到这个分支的大写标签，除了新组件，还有 RN 的 `Pressable`、`TouchableOpacity`、`TextInput`、`Switch`、`Picker`（属于 `NATIVE_CONTROLS`）和 Web 的 `Link`。它们都忽略 `label` 属性，写 `<Pressable label="x">` 会被判成「有名字」，实际上读屏读不到。当前 27 处命中全是 `Button`，所以还没有误判。
  - **测试**：`full-product-functional-audit.test.ts` 没有为新分支加夹具（REPORT 也没提）。
  - **修法**：只认从 `components/ui` / `orbit-2026/ui` 导入的组件（或写一份白名单，例如 `Button`、`IconButton`、`ListRow`）；补两条夹具：`<Button label="x" onPress>` 判为有名字，`<Pressable label="x" onPress>` 判为缺名字。
- **m3 DEP0205 的屏蔽本身安全，记两点**：
  1. 绕过启动器直接 `node --test --import tsx …` 时，那 3 个文件仍然会红。说明第 10 节和 `AGENTS.md` 没写「orbits 定向测试也要走 `scripts/run-node-tests.mjs`」。
  2. 根因是 tsx 4.19.2 还在用 `module.register()`。应该登记一条跟进：升级到改用 `registerHooks` 的 tsx 后，删掉这个参数（`run-node-tests.mjs:28-33` 的注释里写明删除条件）。
- **m4 `Scrim` 的注释与实现不符，读屏用户关不掉弹层**：
  - **现象**：`Scrim.tsx:15` 写「读屏用自己的手势（Escape / 双指擦除）关闭对话框」，但 `src/components/ui/` 里没有任何 `onAccessibilityEscape`。RN 在 iOS 上只有设置了 `onAccessibilityEscape` 的元素才会响应双指 Z 手势。`BottomSheet` 的抓手是 `accessibilityRole="adjustable"`，却没有动作。所以内容里没有按钮的弹层，VoiceOver 用户关不掉。
  - **定性**：这不是 R09 引入的（`Scrim` 原来就是 `accessible={false}`），但 R09 的注释把一个缺口写成了已经保证。
  - **修法**：在 `ConfirmDialog`（非破坏性时）、`BottomSheet`、`FullDrawer` 带 `accessibilityViewIsModal` 的容器上加 `onAccessibilityEscape={close}`；补一条测试；注释改成与实现一致。
- **m5 ⌘K 聚焦修复用的是计帧补丁**：
  - **现象**：`CommandPalette.tsx:67-78` 在 6 帧内只要焦点不在输入框就抢回来。用户在约 100ms 内按 Tab 或点了别处，焦点会被拉回输入框。
  - **修法**：对标 Radix / Headless UI 的 `initialFocus`，给 `Modal` 加 `initialFocusRef`，由焦点陷阱自己聚焦，删掉计帧循环（回归测试见 M3）。
- **m6 「合回 `chat-agent` 前总验收」缺几项待拍板 / 交接项**：
  - **结论**：PLANNER §5 与 RD-24 要求的四项（归属表每行处理、三份清单为空、`@expo/vector-icons` 移除、旧公用组件删除）都在，R06 m9、R07 M3 / M5 / m7、R08 M3 / M5 / m5、R01 m4 也都收进去了。
  - **还缺**：
    - R04 复核 M5「注销用动作表」请产品负责人事后确认；
    - R05 复核 m6「底栏随路径即时出现、不随转场滑动」请产品负责人在模拟器上确认。

    这两条既不在清单里，也不在截图集的「需要产品负责人拍板」列表里。
  - **交接没落到负责 Sprint 的文档里**：R09 走查 W3（`/app/events`、`/app/contacts` 开发模式水合警告 → R26 / R11）和 A2（启动确认画面已显示底栏 → R18）只写在 `walkthrough.md` 里，没有进 `screen-ownership.md` 或这几个 Sprint 的文档，到时候没人会看到。
  - **修法**：清单的「骨架留下的待办」加上前两条确认项，W3 / A2 写进 `screen-ownership.md` 对应行的备注。
- **m7 分支规则改为连字符是对的，但与 RD-25 / README 冲突，也没写合回流程**：
  - **改连字符**：已有 `refs/heads/redesign` 时，git 确实不能再建 `redesign/…`（引用的目录 / 文件冲突），改成 `redesign-R…` 合理，R01 也用过 `redesign-R01-design-tokens`。
  - **但有三处没跟上**：
    - PLANNER §1 仍是 `redesign/R<编号>-<主题>`；
    - README 第 10 行和 RD-25 写着「R02 起直接在 `redesign` 上提交，不再开 Sprint 分支、不开 PR」，与 `AGENTS.md` / 说明第 0 步的个人分支相反；
    - 说明第 10 步只写「提交并 push」，没说个人分支怎么回到 `redesign`（PR 还是快进、谁来合、合前要不要 rebase、两个人同时合时由谁跑全量）。
  - **修法**：在 README 决定表补一条（例如 RD-26「功能 Sprint 起两人并行，各开 `redesign-R…` 分支，经 PR 合回 `redesign`，合前 rebase 并跑全量」），或修订 RD-25 的适用范围；PLANNER §1 标注已改；说明第 10 步写清合回流程。
- **m8 开发说明里还有不准确的地方**：
  - 第 4 节示例 `<RetryState … />` 不存在，两端都是 `RetryCard`（`States.tsx`）；
  - App 导入路径 `../api/compute/not-implemented` 只在 `src/screens/` 这一层成立，应像 Web 那行一样注明「按文件位置数层级」；
  - 第 2 节 `ShellPage` 的插槽漏了 `left`、`demoPill`。

  这几处修完再按 M5 复验。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 App `AGENTS.md` 不改、另存一份 | 合理（任务约束），REPORT 也如实把 SC-01 记为一半。贴进去时注意 m1 |
| 2 DEP0205 由启动器统一屏蔽 | 合理且安全：只屏蔽一个编号，其他 stderr 仍会让「无副作用」测试失败。跟进事项见 m3 |
| 3 审计器认组件的 `label` | 方向对（设计系统约定），范围要收窄、要补测试（m2） |
| 4 减少动效、断网沿用 R04 / R05 | 不成立：R05 之后壳又改过，PLANNER 没给这个余地（M2） |
| 5 截图集用 artifact | 合理；内容没达到 PLANNER §4 的要求（M1） |
| 未列为决定的：分支命名改连字符 | 改得对，但应该作为决定登记并同步 README / RD-25（m7） |
