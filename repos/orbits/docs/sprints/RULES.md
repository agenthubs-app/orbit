# Web Sprint 单次 Generator 执行规则

本规程照搬 App 端 [`repos/orbit-app/docs/sprints/RULES.md`](../../../orbit-app/docs/sprints/RULES.md) 的方法（2026-09-28 用户要求 Web 端用同样方法开发），只把路径、运行环境和验证手段换成 Web 端（`repos/orbits`，Next.js）。两边规则冲突时，以用户最新明确指令为准，其次是本文件。

## 0. 批准与复用

- 以用户最新明确指令核对批准。已定稿的设计决定（[REQUIREMENTS.md](REQUIREMENTS.md) 记录的 Q1–Q54 及修正）就是各 Sprint 的产品批准，Generator 不再逐文件、逐 Sprint 重复索要。
- Planner 文件表是影响范围的起点。完成已批准目标所必需的本地文件新增、类型接线、纯数据模块提取和对应测试，不因文件表遗漏而成为新的产品审批：先查依赖和实际影响，在 REPORT 登记新增路径和用途，再继续。
- 真正改变目标、验收标准或引入不相关功能，才是范围变更。未知的真实数据库／账号／记录不能从批准推断出来；真实外部操作（生产数据写入、部署、push、付费 AI 调用）仍须有可识别目标及适用授权。
- 信息不足先区分事实与决定：能从源码、测试和既有约定查明的事实由代理查明；有合理依据的可逆实现细节自行选择并说明；只有缺少会实质改变结果的用户决定时，暂停相应动作，继续独立工作。未决定项集中列在 [README 的「等待用户决定」](README.md#等待用户决定)。

## 1. long-run-harness 简化版

保留：SprintContract（可验证验收项）、Handoff、existing-codebase 文件边界、证据归档、预算、逐操作链提交和明确终止。
取消：独立 Evaluator、打分／rubric、契约协商循环、self_assess、REFINE/PIVOT、最小迭代次数、评审后自动再次 Generator。

`已批准 PLANNER.md → 一个 Generator 执行 → 必要验证 → Sprint 分支 commit → REPORT.md／交接 → 协调者合并 chat-agent → 合并树验证 → 结束`

每个 Sprint 最多一次 Generator run，执行前登记为 run-01。Generator 可正常阅读、TDD、编辑、运行命令和有限修复；不能以自评或「再优化一版」为理由重开生成阶段。

## 1.1 成本控制（2026-09-28 用户决定，从 W0012 之后的下一个大目标起执行）

目的不变：每个大目标拆成多个 Sprint，GOAL／PLANNER／REPORT 全部落库，事后可查。省的是执行开销，不省文档。

- **主会话只做调度，保持很薄。** 主会话不读源码、不跑长日志：派发 Generator、裁决 review、提交合并、登记。一个大目标做完就结束会话；下一个大目标新开会话，从本 README 和上一目标的 REPORT 接续。
- **Generator 只读 PLANNER 的「上下文包」。** 每个 PLANNER 必须有「上下文包」一节（见模板）：必读文件与关键符号签名、前序 Sprint 交接要点（几行）、易错边界。Generator 从它起步，**不通读其他 REPORT、README 或全库**；上下文包是起点不是上限——改动实际需要的额外文件先用 GitNexus 查调用方再读，并在 REPORT「假设与额外阅读」里列出。
- **易错边界写成验收项。** 「不能做什么」（例如示例期对真实接口 0 调用、查询失败时的行为、自动路径不得替用户做决定）写进 SC 并要求测试证明，而不是只写在说明里。
- **review 放在方案阶段。** 每个大目标的全部 PLANNER（含上下文包）写完后，用 Codex 做一次方案 review 再开工。代码 review 只给 H 档 Sprint 做一次，不做复查；review 意见交回同一个 Generator 修（它还带着上下文），协调者只裁决。L 档靠测试与协调者抽查。
- **合并小 Sprint 的执行。** 同一大目标里无依赖冲突的 L 档 Sprint 可以两三个交给同一个 Generator 依次做；每个 Sprint 仍各自提交、各写 REPORT、各自合并登记。
- **模型。** Generator 用 Opus 5.5（用户 2026-09-28 决定，不降级到 Sonnet）。
- **全量测试。** 只在 H 档收口跑一次；一个大目标全部合并后再跑一次。
- **REPORT 用短模板。** 不逐文件复述改动（看 git diff），只写结果、SHA、SC 表、review 处理、假设与未完成项。

## 2. 角色与并行

- Planner 是每个 Sprint 的 `PLANNER.md`，定义目标、输入、范围、SC 和必要检查；运行时不再启动 Planner 模型。
- Generator 是该 Sprint 唯一实现者；禁止再派另一个实现／评审代理形成隐式循环。
- 协调者领取就绪任务、管理文件锁和登记表、统一 Git 集成。Generator 就是当前主代理时可直接承担这些管理动作。
- 默认逐个执行。确需并行时最多两个独立就绪 Sprint，文件不重叠、无依赖、不争用同一 dev server／浏览器账号；并行的第二条线必须按根 `CLAUDE.md` 在外接盘 `/Volumes/ORICO/Dev/worktrees/orbit/<name>` 建 worktree，外接盘未挂载则停下询问，不回落到内置盘。
- 共享 view-model、`iorbit-styles.ts`、`orbit-reference-styles.tsx`、语言／时间基础设施不并行修改。

## 3. 编号、目录与唯一事实来源

- Web Sprint 编号为 `W` + 四位十进制，从 `W0001` 递增，不复用、不重排；目录 `WNNNN-short-name/`。`W` 前缀用来和 App 端的 `0001…` 区分，Bridge 交接里不会撞号。
- 本目录 `README.md` 是全局运行状态和生命周期的唯一登记表；Planner 不复制可变运行状态。
- 每个 Sprint 必须有 `GOAL.md`（一句话说明要实现什么、做完能看到什么、怎么验收）和 `PLANNER.md`（唯一契约：原需求编号、基线、依赖、白名单、排除范围、最多五项 SC、测试映射、失败处置和交接）。模板在 `templates/`。
- 开始前记录 Planner SHA256；启动后不得降低 SC 或修改批准条件来制造成功。必要文件补充以追加记录保留原哈希。
- `REPORT.md` 仅在实际执行结束后创建；失败／受阻也必须报告。
- 中断时先保存脱敏 `checkpoint.md`（已改文件、已提交 SHA、未完成、活进程、当前测试）。恢复同一 run，不清空重开。

## 4. 启动前最小检查

1. 读本规则、本 Sprint 的 GOAL／PLANNER 和它声明的前序报告；不反复遍历全部历史。
2. 查看 HEAD、`git status --short` 和计划涉及文件的 diff。**用户未提交的文件不得覆盖、不得带进 Sprint 提交**（当前已知：`bridge/`、`docs/designs/Orbit_0918/`、`repos/orbits/docs/development/web-2026-09-17/`、`repos/orbits/docs/operations/2026-09-25-neon-egress-audit.md`）。
3. 复用适用批准，核实依赖。缺前置只暂停对应动作，不消耗 run。
4. 登记 run-01、Planner 哈希和基线，再开始编辑。
5. 每个待改符号先 GitNexus upstream impact：`node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`（在 `/Users/li/work/orbit` 执行）。HIGH/CRITICAL 先报告；`risk: UNKNOWN` 不是低风险，要用文本搜索补查。索引落后时按根 `CLAUDE.md` 刷新。

同一 run 已完整读过且未变化的规则、源码和 impact 结果可复用。选定一个可验证的用户操作链后连续实现，接口、消费者和失败保护尽量同一批完成。

## 5. 最小执行与测试设计

每个 SC 对应一个可观察行为及一个主要验证方式。默认路径是「改变行为的 RED → 最小实现 → 定向 GREEN → 操作链收口」。

### 5.1 分档与全量触发

| 验证档 | 适用条件 | 必需检查 |
| --- | --- | --- |
| D 文档／只读 | 不改变运行行为 | 路径／链接和 diff 检查；不跑产品测试 |
| L 局部实现 | 影响边界清楚的界面／局部功能 | 开发时只跑改变行为的用例；操作链提交前跑修改测试所在完整文件及直接消费者、`npx tsc --noEmit -p .` 一次；可见变化用浏览器验证。默认不跑全量 |
| H 高风险／共享 | HIGH/CRITICAL，或身份／权限／写入／幂等／迁移／共享契约／付费 AI 调用变化 | 定向集覆盖失败、隔离、并发及传递消费者；全量延后到本 Sprint 本地代码收口 |
| I 集成收口 | 含 H 的 Sprint 收口或明确集成 Sprint | 一次 `npm test` 全量对照基线，加该阶段实际业务 SC |

### 5.2 全量测试的基线对照

`repos/orbits` 全套件有历史失败基线（与分支工作无关）。判断回归看**失败清单是否新增**，不是「是否全绿」：

1. `git stash push -u -- <只列本 Sprint 改动的路径>` → `npm test` 存失败清单 → `git stash pop`；
2. 再跑一次 `npm test` 存失败清单；
3. `comm -13` 对比，只调查新增项。

跑测试时不要 source `.env` 系列文件（会把基线从 ~30 抬高）。

### 5.3 测什么

- 一项业务规则在所属层测一次；UI 只测接线、可见结果和 UI 特有状态。优先复用既有夹具（如 `tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`）。不测 mock 自身，不为常量或覆盖率堆测试。
- 改版替换旧设计时，旧的「设计稿逐块在位」类断言改为断言新设计，不保留两套。
- 失败后最多两个本地修复轮次，每次只重跑失败用例和受影响最小集，仍不过则结束为 failed。

### 5.4 浏览器验证

- 可见变化必须在真实页面验证：dev server 用 `.claude/launch.json` 的 `orbits` 配置（端口 3000）；端口已被其他会话占用时直接复用 `http://localhost:3000`，不另起第二个 `next dev`。
- 桌面 1440 与手机 375 各看一次；检查控制台错误。截图存证据目录，不放进源码或文档目录。
- 登录态用 `next-auth/jwt` 签会话 cookie 注入，不在登录表单输入密码。

## 6. 边界、预算与证据

- 实施目录 `/Users/li/work/orbit/repos/orbits`。改动 App 端（`repos/orbit-app`）需要在 Planner 里列明并说明跨端影响。
- 数据库迁移只写迁移文件和本地验证；在生产库执行迁移、部署、push 需要单独授权。
- **付费 AI 调用按 README「用户决定」执行**：D3 计划生成不接 AI（只用 mock）；D5 名片识别补行业与批次匹配沿用名片识别现有计费方式，用户于 2026-09-28 明确不另设累计上限，但每次真实调用都要在 REPORT 记录次数与 token 用量。其他付费 AI 场景需要新的用户决定，未定前只用 mock provider 和夹具。
- 证据（截图、日志、命令输出）放在**所有仓库之外**：`~/orbit-sprint-evidence/web/sprint-WNNNN/run-01/`。`repos/orbits/AGENTS.md` 禁止在 app 仓库生成截图、trace 和日志，根目录 `harness-state/`、`harness-logs/` 属于不可编辑的 harness 项目，都不能用。REPORT 只记录证据路径和摘要。不保留 cookie／token／密钥或完整个人对话。
- 数据库测试读 `ORBIT_EVENT_DATABASE_URL`（绕过 `ORBIT_DATABASE_TARGET` 重定向），必须指向本机专用测试库；运行前先跑 `node scripts/assert-local-test-databases.mjs`，并在 REPORT 里证明相关测试没有被 skip。2026-09-28 核对：`.env.local` 中该变量指向 `localhost:5432`。

## 7. 状态与失败终止

| 状态 | 条件 |
| --- | --- |
| planned | 计划已写，未就绪；不执行 |
| ready | 进入条件与批准齐全 |
| running | run-01 正在执行 |
| paused | 用户暂停或中断，先留 checkpoint |
| completed | 所有必需 SC 有同版本有效证据，功能与报告已提交，最终 SHA 已合并到 `chat-agent` 且合并树验证通过 |
| blocked | 缺外部条件或用户决定 |
| failed | run 已结束，必需 SC 失败；保留成果和报告，不自动二次生成 |

## 8. 提交与合并

- 提交单位是可独立验收的用户操作链；只暂存本 Sprint 明确文件，**禁止 `git add .`／`git add -A`**。
- 提交前执行 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；`partial`／`truncated` 不算干净，重跑。
- 在 `REPORT.md` 列：SC → 文件 → commit SHA → 证据；未提交改动、失败、回退方式、下一步单列。先用易读文字说明已验证能做什么、仍不能做什么。
- 分支：从 `chat-agent` 建 `sprint/WNNNN-short-name`，在当前工作树切换即可（用户在 2026-09-28 选择不另建 worktree）；用户的未跟踪／未提交文件留在工作树，不暂存。收口后由协调者把固定最终 SHA 合并回 `chat-agent`（`git merge --no-ff`，不 rebase），在合并树跑受影响测试和 typecheck，记录合并 SHA 后才写 completed。
- push 需要用户明确授权。

## 9. 启动指令（给后续 AI）

```text
执行 Web Sprint WNNNN。先读 RULES.md（含 1.1 成本控制）和对应 PLANNER.md（从「上下文包」起步），
确认进入条件；未就绪不启动，记录缺项并继续其他独立工作。
按第 0 节复用已定稿的设计决定，登记必要的文件补充，不重新索要批准。
本 Sprint 只进行一个 Generator run，不启动 Evaluator 或返工循环。
沿一个用户操作链连续实现；开发中定向测试，按第 5 节分档验证，可见变化必须浏览器验证。
路径限定 commit，写 REPORT.md，交接固定 SHA，合并回 chat-agent 并验证合并树后才标 completed。
失败如实结束，不降低验收条件，不自动创建第二轮。
```
