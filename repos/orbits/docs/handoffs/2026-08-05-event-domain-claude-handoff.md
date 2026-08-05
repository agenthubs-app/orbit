# Orbit 活动域收尾交接文档

更新时间：2026-08-05  
仓库：`/Users/li/work/orbit/repos/orbits`  
工作分支：`chat-agent`

## 给 Claude 的简短 Goal

请读取并严格执行本文件，接手 Orbit 活动域未提交工作：先核实当前代码、数据库、进程和 AI generation 的真实状态，再完成全中文且无 fallback 的 AI 推荐/分桌生成与真实浏览器发布验收；随后回归活动运营、现场、会后、联系人、约谈和通知流程，运行完整测试与构建，清除测试密码和临时文件，仅提交本任务文件并推送 `chat-agent`。不得重做已完成工作，不得直接改数据库制造通过，不得虚报 Google Calendar/Meet 的外部联调结果。

## 1. 强制执行原则

1. 先读取仓库根目录的 `AGENTS.md` 和本文件，再执行任务。
2. 根据真实代码和运行状态继续，不要从头重写，也不要凭交接内容臆测当前状态。
3. 修改任何函数、类或方法前，必须先运行 GitNexus `impact`。
4. `impact` 为 HIGH 或 CRITICAL 时，先报告风险和影响范围，再修改。
5. 提交前必须运行 GitNexus `detect_changes`。
6. 所有核心业务流程必须通过真实浏览器点击验收，不能只测试 API。
7. 不允许通过直接修改数据库绕过报名、生成、发布、联系申请或约谈流程。
8. AI 推荐与分桌不允许 deterministic/local fallback；失败必须明确失败或走 AI 重试。
9. 生成内容必须为中文；仅允许参会者姓名、公司名和明确批准的技术缩写保留英文。
10. 不要覆盖、删除或提交用户自己的工作区修改。

## 2. Git 与工作区状态

- 当前分支：`chat-agent`
- 最后确认已推送的提交：`0ec53be8 fix(events): complete attendee detail workflows`
- 当前工作区包含大量已经实现、测试过但尚未提交的活动域修改。
- 开始工作后先运行：

```bash
cd /Users/li/work/orbit/repos/orbits
git status --short
git log -5 --oneline --decorate
git diff --stat
```

以下内容属于用户或无关临时内容，禁止纳入活动域提交：

- `/Users/li/work/orbit/AGENTS.md`
- `/Users/li/work/orbit/CLAUDE.md`
- `/Users/li/work/orbit/repos/orbits/next-env.d.ts`
- `.tmp-party-*.png`
- HEIC 设计文件
- `/Users/li/work/orbit/tools/`

不要使用 `git add .`，最终应按文件精确 stage。

## 3. 已经实现但尚未统一提交的功能

### 3.1 活动中心、运营和权限

- 活动中心根据活动生命周期控制操作入口。
- 活动级角色和能力体系：Owner、运营、签到人员、审核员、只读分析员。
- 权限按活动授权，不是全工作区授权。
- 报名规则编辑仅 Owner 可操作。
- 审核员显示只读解释。
- 参会者 CSV 导出使用独立的 `attendees.export` capability。
- 聚合分析与个人活动报告支持双角色切换。

### 3.2 活动现场与会后闭环

- 联系方式交换申请支持创建、接受、拒绝和撤销。
- 上述状态变化会生成站内通知，并支持跳转到活动、联系人或约谈。
- 现场交流 Memo：失败重试复用幂等键；成功后再生成新幂等键；再次编辑形成新版本。
- 联系人时间线能够显示多次交流记录。
- 会后重点联系人和跟进建议包含姓名及联系人详情链接。
- 收件箱文案仅声明站内通知，不虚构短信、邮件或系统外推送。
- 约谈被拒绝后会通知提议方，并保留原确认时间。

### 3.3 Calendar 与 Meet 投影

代码已实现：

- Google Calendar 确定性事件 ID。
- attendees、描述和 Meet conference 创建参数。
- 409 冲突时 PATCH，实现幂等更新。
- 对 Meet 地址进行有限次数轮询，拿不到则失败关闭，不生成假链接。
- 删除事件时把 404 作为幂等成功。
- 使用发起约谈用户自己的 Google OAuth 身份。
- appointment calendar projector 和 outbox worker。
- 过期 revision 自动跳过。
- UI 显示日历同步、Meet 同步状态和会议入口。

本地缺少以下真实外部配置，因此目前只能认为 Provider 合约与模拟测试通过，不能宣称 Google Calendar/Meet 已完成真实联调：

- `ORBIT_GOOGLE_CALENDAR_*`
- token encryption key
- 用户真实 Google OAuth consent

### 3.4 活动运营后台表单

已经修复：

- AI 生成操作失败后，错误信息被 `load()` 清空的问题。
- datetime/numeric 输入使用 `onChange` 导致浏览器 fill、paste 或 autofill 后 React 状态没有更新的问题。
- 相关输入已改为 `onInput`，并在状态更新前保存 `currentTarget.value`。
- 浏览器已验证活动配置可以正常保存。
- 测试活动 `event_signup_01` 的配置版本已推进至 v10。
- 当前画像截止和报名截止时间已过，所以名单冻结是正常业务结果，不应通过数据库强行解冻。

## 4. 当前 P0：完成全中文 AI 生成、发布与验收

当前已经发布的 generation 仍是旧英文版本，因此任务尚未完成。

### 4.1 已知 generation

- `2174876a...`：45/45，当前已发布，但内容仍为英文。
- `8185e127...`：旧配置版本，20/45，存在 grouping schema 失败，不能因配置版本漂移直接重试。
- `f1d4856f...`：45/45、未发布，基本为中文，但仍发现 `12k stars`、`投资-ready`、`AI copilot` 等英文泄漏。
- `1745b2ba...`：严格中文门禁、无 AI 修复的版本，部分任务失败。
- `f165450e...`：严格门禁加一次 AI 翻译修复的版本；交接时仍在运行或收敛，必须重新查询真实状态。

### 4.2 先查询真实状态

```bash
set -a
source .env.local
set +a

orbit_db_url=${ORBIT_EVENT_DATABASE_URL:-${ORBIT_LIVE_DATABASE_URL:-$ORBIT_DATABASE_URL}}

psql "$orbit_db_url" -X -P pager=off -c "
select generation_id, configuration_version, status, expected_task_count,
       error_code, created_at, completed_at, published_at
from event_ops_generations
where event_id='event_signup_01'
order by created_at desc limit 8;"

psql "$orbit_db_url" -X -P pager=off -c "
select generation_id, task_kind, status, count(*)
from event_ops_tasks
where generation_id='event-operations-generation:f165450ea4d5cd3b10d3028d8b9fd545'
group by generation_id, task_kind, status;"
```

并检查 Next dev 和 worker，禁止重复启动 worker：

```bash
pgrep -fal 'next dev|run-event-operations-worker|tsx'
```

### 4.3 当前 AI Provider 设计

`features/events/event-operations/ai-provider.ts` 的未提交修改已经加入：

- `enforceOutputLanguage` 开关。
- 对所有自然语言字段执行中文检查。
- 允许的技术缩写：`AI`、`SaaS`、`KPI`、`API`、`B2B`、`LP`、`IP`、`CEO`、`Scope`。
- 允许参会者 displayName 和 company 中的专有词。
- 普通英文单词不得通过。
- 首次输出违反语言要求时，再调用同一 AI 一次，仅修复自然语言字符串。
- 修复过程中不得改变 ID、数字、null、数组结构或 JSON key。
- 没有本地字符串替换或 deterministic fallback。
- 修复后仍不合格则返回可重试的 `AI_SCHEMA_INVALID`。
- recommendations、grouping、table 的所有自然语言字段均纳入检查。
- fingerprints 已升级至 recommendation v11、deduplicated v12、grouping v7。

AI Provider 属于 HIGH 影响范围，继续修改前必须重新检查 GitNexus impact，并执行广泛回归。

### 4.4 必须完成的生成流程

1. 等 `f165...` 所有 running/retryable 状态收敛。
2. 若有失败 shard，只能在运营后台真实点击“重试失败分片”。
3. 已完成 shard 必须保留，不能全量重复计算。
4. 直至达到 45/45 completed、0 failed，或发现并修复真实代码缺陷。
5. 发布前审计所有持久化 task output，确保不存在未批准的普通英文。
6. 在运营后台真实点击“原子发布”，不能直接改数据库发布状态。
7. 发布后使用普通参会者账号打开活动详情，确认页面读取的是新 generation。

可用下列命令做初步词法审计，但不能只依赖正则；最好写一个只读脚本复用生产语言策略检查全部 persisted payload：

```bash
psql "$orbit_db_url" -X -Atc \
  "select output_payload::text
   from event_ops_tasks
   where generation_id='<新 generation id>'
     and status='completed';" \
| rg -o '[A-Za-z][A-Za-z-]{3,}' \
| sort \
| uniq -c \
| sort -nr
```

### 4.5 AI 代码仍需检查的成熟度问题

当前 AI 翻译修复流程返回的 metadata 主要来自第二次修复调用，没有完整累加原始生成与修复调用的 token、response bytes 和使用量。

应评估并完善：

- 累加两次调用的 input/output/total tokens。
- 累加 provider response bytes。
- 记录完整总耗时，同时保留最终 finish reason。
- 增加单元测试，防止运营成本和性能数据被低估。

如果严格门禁反复误伤专有名词，不允许直接放行所有来源自由文本。成熟方案应给画像或活动资料协议增加结构化 `properNouns` 字段，只允许显式专有名词。

## 5. 必须执行的自动化测试

### 5.1 AI 生成核心回归

```bash
node --test --import tsx \
  tests/capabilities/event-operations-ai-provider.test.ts \
  tests/capabilities/event-operations-engine.test.ts \
  tests/capabilities/event-operations-scale.test.ts \
  tests/api/event-operations-generation-capability.test.ts \
  tests/services/event-operations-generation-delegate-postgres.test.ts
```

### 5.2 所有变更和新增测试

```bash
changed_tests=$(
  {
    git diff --name-only --relative -- 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
    git ls-files --others --exclude-standard -- 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
  } | sort -u
)

printf '%s\n' "$changed_tests" | xargs node --test --import tsx
```

### 5.3 静态检查和构建

还必须执行：

- TypeScript 检查。
- `git diff --check`。
- 完整 `npm run build`。
- GitNexus `detect_changes`。

不要在 Next 开发服务器运行期间直接 build。之前这样做曾导致 `.next` 资源与开发进程不一致。顺序必须是：

1. 停止 Next dev。
2. 执行 `npm run build`。
3. 构建通过后重新启动开发服务器。

## 6. 最终真实浏览器验收清单

此前已经真实点击验证过：活动中心、聚合分析、角色权限、已报名筛选、活动详情、参会者画像、两轮桌号/座位/分组原因、联系方式申请与撤销、通知深链、Memo 多版本、个人活动报告、会后重点联系人、约谈时间调整和拒绝。

因为 AI 发布版本仍未收尾，最终仍要统一回归以下流程：

### 6.1 主办方

- 登录主办方账号。
- 打开 `/app/events/event_signup_01/operations`。
- 查看 AI generation 状态。
- 真实点击重试失败 shard。
- 确认 45/45、0 failed。
- 预览推荐、分组、桌级内容全部为中文。
- 真实点击原子发布。
- 验证发布状态和 generation ID。

### 6.2 普通参会者

- 登录普通参会者账号。
- 打开 `/app/events/EVTSIGNUP01`。
- 验证四张推荐卡片可以点击。
- 验证推荐理由、成员提示、破冰问题为中文。
- 打开参会者详情，验证所有报名和自适应画像答案。
- 验证申请交换联系方式按钮在卡片和详情中均符合产品设计。
- 验证第一轮、第二轮桌号和座位显眼。
- 验证分组原因、桌级主题、桌级破冰问题、成员提示为中文。
- 验证活动推荐关系图使用新发布 generation。
- 验证现场页面也使用新结果。

### 6.3 会后和关系闭环

- 创建、撤销、接受、拒绝联系方式交换申请。
- 验证双方收件箱通知和深链。
- 保存现场 Memo，编辑后再保存，联系人时间线应显示两个版本。
- 打开个人活动报告和重点联系人推荐。
- 发起约谈、调整时间、接受或拒绝。
- 确认原时间保留、状态正确、双方通知正确。
- 验证日历/Meet 在无外部配置时显示真实“未同步”状态，不显示假链接。

### 6.4 显示质量

- 桌面宽屏。
- 窄屏/移动宽度。
- 长中文内容不溢出。
- 空态、加载态、失败态和重试态清楚。
- 除专有名词和批准的技术缩写外，不出现普通英文。
- 不出现 fallback 生成内容。

## 7. 涉及的主要 UI 区域

本轮活动域修改和验收涉及：

- 活动发现与“已报名”筛选。
- 用户菜单中的“我的活动”。
- 活动中心。
- 活动详情与推荐卡片。
- 参会者目录和参会者详情抽屉/页面。
- 联系方式交换按钮和状态。
- 活动运营后台。
- 报名规则与审核。
- 活动级角色权限管理。
- 签到页面。
- AI 推荐/分桌生成与发布面板。
- 第一轮和第二轮现场桌位页面。
- 活动推荐关系图。
- 活动分析。
- 个人活动报告。
- 会后重点联系人和跟进建议。
- 现场 Memo 和联系人时间线。
- 约谈协商页面。
- 收件箱通知及深链。

## 8. 临时密码和安全清理

当前可能存在：

- `scripts/.tmp-rotate-event-browser-passwords.ts`
- `/tmp/orbit-e2e-browser-password`
- 浏览器执行环境中的 `qaPassword`

此前临时测试密码曾意外出现在工具输出里。所有浏览器测试结束后必须：

1. 最后轮换一次 organizer 和全部 fixture 账号密码。
2. 轮换时不要打印新密码。
3. 删除 `/tmp/orbit-e2e-browser-password`。
4. 删除临时轮换脚本。
5. 清除浏览器环境中的 `qaPassword`。
6. 确认密码、临时脚本和临时文件均未进入 Git。

不要在浏览器截图、DOM snapshot、日志或最终报告里展示密码。

## 9. 提交和推送要求

只 stage 本任务文件，不要使用 `git add .`。

提交前执行：

```bash
node ../../.gitnexus/run.cjs detect-changes -r orbit --scope staged --limit 160
```

确认没有用户文件、秘密或无关文件后提交。可以使用一个完整提交：

```bash
git commit -m "feat(events): complete operations and post-event lifecycle"
git push origin chat-agent
```

也可以拆成两个逻辑提交：

```bash
git commit -m "feat(events): complete operations and post-event lifecycle"
git commit -m "fix(events): enforce Chinese AI output before publication"
git push origin chat-agent
```

拆分时必须确保每个提交都可构建，不要把调用方和被调用方拆成不可运行状态。

## 10. 最终交付报告必须包含

1. 最终提交 SHA 和推送分支。
2. 最新发布的 AI generation ID。
3. recommendation/grouping/table shard 总数、成功数、失败数。
4. 总耗时、单 shard 耗时分布和重试次数。
5. AI 内容中文审计结果。
6. 明确确认没有 local/deterministic fallback。
7. 自动化测试命令及通过数量。
8. 生产构建结果。
9. 浏览器真实点击过的账号角色、页面和流程。
10. 截图或其他可复核证据。
11. 临时测试密码和脚本已清理的确认。
12. 明确说明 Google Calendar/Meet 是否完成真实 OAuth 联调；没有真实配置时必须写“未进行外部联调”，不能写“全部通过”。

## 11. 完成定义

只有同时满足下列条件才可宣布完成：

- 新 AI generation 45/45 完成且 0 failed。
- 全部自然语言内容通过中文门禁。
- 通过运营后台真实点击原子发布。
- 普通参会者页面读取新结果。
- 推荐、两轮分桌、桌级问题和关系图均显示正确。
- 活动运营、现场、会后、联系人、约谈和通知主流程浏览器回归通过。
- 所有相关自动化测试、类型检查和生产构建通过。
- GitNexus 变更检查符合预期。
- 测试密码和临时文件已安全清理。
- 仅任务文件被提交并成功推送到 `origin/chat-agent`。

