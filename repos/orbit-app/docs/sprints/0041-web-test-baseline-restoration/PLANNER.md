# Sprint 0041 Web 测试基线恢复实施计划

> **执行代理必读：** 每个 Task 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 独立实施；以下复选框是唯一执行清单。

**目标：** 恢复可信的 Web 测试基线：确定性测试在本地稳定全绿；依赖环境的集成测试有明确、会失败的前置检查；当前已发现的失败全部修复且不降低断言。

**方案：** 用一份穷尽式测试文件清单派生三个入口：本地确定性测试、带前置检查的集成测试、发布前全量门禁。确定性的审计与 fixture 漂移在原处修复；PostgreSQL 测试使用每次运行独有的身份和数据，避免共享旧状态改变结果。

**技术栈：** Node.js test runner、TypeScript/TSX、Next.js 16、PostgreSQL 测试 provider、现有产品审计生成器、GitNexus、npm scripts。

**规格：** `repos/orbit-app/docs/sprints/0041-web-test-baseline-restoration/GOAL.md`

## 全局约束

- 本 Sprint 承接一次已批准的合并例外：B/0034 与 D/0036 的定向测试、两端 typecheck 和独立审查均已通过；它们合并前，Web 全量测试已经存在失败。
- run-01 基线是 `chat-agent@893071b24` 或执行前登记的更新主线 SHA。不得带入用户未提交文件或其他 Sprint 的未合并改动。
- Calendar、Gmail、Microsoft Graph 的 OAuth adapters 仍是明确的后续事项，不属于本 Sprint。
- 不得删除测试、扩大 `skip`、改成空断言，或靠 glob/profile 漏掉文件换取绿色结果。
- 每个 `repos/orbits/tests/**/*.test.ts` 与 `*.test.tsx` 文件必须且只能属于一个 profile。新增、重复或消失的文件都要让完整性测试失败。
- `npm test` 运行完整 deterministic profile；`npm run test:integration` 运行环境 integration profile，缺前置时列出具体缺项并返回非零；`npm run test:all` 串行运行两者，是最终发布门禁。
- 只有真实跨越外部边界的测试才能归入 integration，例如 PostgreSQL 访问或受监督的浏览器运行证据。内存 route、fixture、源码检查和纯 service 测试继续属于 deterministic。
- 只有行为 RED 证明产品缺陷时才修改生产代码。依赖私有实现文字的脆弱断言应改为公共行为或可注入边界断言，不能换一段新的源码字符串继续匹配。
- PostgreSQL 测试每次运行使用唯一 actor/workspace/record 标识，只清理本次创建的数据，不读取或删除开发者共享数据。
- 开发遵守 TDD；改现有 symbol 前运行 GitNexus upstream impact；每次 commit 前运行 staged `detect_changes`；合并前必须独立审查。审查通过后由协调者合并回 `chat-agent` 并 push。

---

### Task 1：冻结失败账本并建立测试分档

**文件：**
- 新建：`repos/orbit-app/docs/sprints/0041-web-test-baseline-restoration/BASELINE.md`
- 新建：`repos/orbits/tests/support/web-test-profiles.ts`
- 新建：`repos/orbits/tests/architecture/web-test-profiles.test.ts`
- 修改：`repos/orbits/scripts/run-node-tests.mjs`
- 修改：`repos/orbits/package.json`

**接口：**
- 产出：`discoverWebTestFiles(root)`、`classifyWebTestFiles(files)`、`DETERMINISTIC_PROFILE`、`INTEGRATION_PROFILE`。
- 命令：`npm test`、`npm run test:integration`、`npm run test:all`。
- 消费者：后续所有 Task 和最终合并门禁。

- [ ] **步骤 1：保存精确 RED 基线**

在固定 SHA 的 `repos/orbits` 运行一次 `npm test`。`BASELINE.md` 记录命令、退出码、Node 版本、`ORBIT_EVENT_DATABASE_URL` 是否存在（只记布尔值）和每个失败测试名。初始分类至少包含：

- `tests/audits/full-product-functional-audit.test.ts`
- `tests/storage/live-provider-pool-reuse.test.ts`
- `tests/pages/app-home-live-route-services.test.ts`
- `tests/pages/app-followups-live-route-services.test.ts`
- `tests/pages/app-register-live-route-services.test.ts`
- `tests/services/appointment-details-postgres.test.ts`
- `tests/services/maintenance-heartbeat.test.ts`

不得记录连接串、Cookie、token、真实 actor 数据或响应正文。

- [ ] **步骤 2：先写 profile 完整性 RED**

测试夹具包括：一个 deterministic 文件、一个 PostgreSQL integration 文件、一个未分类新文件、一个重复项和一个已消失路径。只有每个文件恰好出现一次时才允许通过。缺少集成前置时，返回包含前置名称的错误，不能返回 skip。

```ts
assert.deepEqual(classifyWebTestFiles([
  "tests/unit.test.ts",
  "tests/postgres.test.ts",
]), {
  deterministic: ["tests/unit.test.ts"],
  integration: ["tests/postgres.test.ts"],
});
assert.throws(
  () => classifyWebTestFiles(["tests/new-unclassified.test.ts"]),
  /UNCLASSIFIED_WEB_TEST/,
);
```

- [ ] **步骤 3：确认 RED**

运行 `node --test --import tsx tests/architecture/web-test-profiles.test.ts`。预期因 profile 模块和 runner 行为不存在而失败。

- [ ] **步骤 4：实现穷尽式 profiles 与三个命令**

递归发现测试文件并按 POSIX 相对路径排序。integration 使用一份明确、可审查的集合；验证集合内每个文件存在且不重复后，deterministic 才能取其穷尽补集。`run-node-tests.mjs` 增加 `--profile deterministic|integration|all`。integration 在 spawn 测试前执行前置契约；all 遇到首个非零结果立即停止并保留退出码。

- [ ] **步骤 5：GREEN 并提交**

运行完整 profile 测试。检查 staged 文件、GitNexus detect 和 `git diff --check`，提交：

```bash
git commit -m "test(web): define exhaustive baseline profiles"
```

---

### Task 2：修复确定性产品审计和存储边界漂移

**文件：**
- 修改：`repos/orbits/tests/audits/full-product-functional-audit.test.ts`
- 仅在 RED 指向生成器缺陷时修改：`repos/orbits/scripts/generate-full-product-functional-audit.mjs`
- 修改：`repos/orbits/tests/storage/live-provider-pool-reuse.test.ts`
- 修改：`repos/orbits/tests/pages/app-home-live-route-services.test.ts`
- 修改：`repos/orbits/tests/pages/app-followups-live-route-services.test.ts`

**接口：**
- 输入：当前 route inventory、当前有效运行证据、configured live-record-store 的公共 factory。
- 产出：验证公共行为与依赖边界的测试，不再匹配私有实现拼写。

- [ ] **步骤 1：逐个复现完整失败文件**

对上述文件逐个运行 `node --test --import tsx <file>`，把精确失败名写入 `BASELINE.md`。区分冻结计数过期和生成器逻辑错误；只看到计数变化不能直接改期望。

- [ ] **步骤 2：为生成器缺陷写最小 RED**

为 prop-gated `DataCard`、literal route props、navigation replay、route-local query parameter 和 runtime coverage 分别准备一个可达、一个不可达的源码夹具，只允许计入 route-local 的可达行为。存储边界使用注入的 configured store/factory spy 验证 route 调用了公共边界；不再搜索 `createConfiguredPostgresLiveRecordStore` 这段源码文字。

- [ ] **步骤 3：只修真正出错的一层**

生成器错误就修 AST/data-flow 规则，并保留反例。生成证据正确、只有冻结期望过期时，更新独立审查过的期望，并在 `BASELINE.md` 写明对应 route/evidence 变化。不得放宽 runtime coverage 或复活旧证据。

- [ ] **步骤 4：运行完整 deterministic 集**

先把五个完整文件一起运行，再运行 `npm test`。要求 0 失败，且本 Sprint 不新增 skip。

- [ ] **步骤 5：提交 deterministic 修复**

运行 Web typecheck、staged detect 和 diff 检查，提交：

```bash
git commit -m "test(web): restore deterministic audit baseline"
```

---

### Task 3：修复活动 fixture，不降低 route 行为要求

**文件：**
- 修改：`repos/orbits/tests/pages/app-register-live-route-services.test.ts`
- 仅当该测试确实共享此 fixture 时修改：`repos/orbits/tests/support/completion-runtime-fixture.ts`
- 只有独立行为 RED 证明生产缺陷时修改：`repos/orbits/features/events/core/public-catalogue.ts`

**接口：**
- 输入：能被当前 public-catalogue schema 接受的完整 published event record。
- 产出：participant summary、public code、canonical identity 内部一致的确定性注册 route fixture。

- [ ] **步骤 1：保留 participant-summary RED**

运行完整注册 route 测试并记录当前 `EVENT_CORE_INVALID_PUBLISHED_EVENT`。增加 fixture 契约断言：测试支持层生成的 published event 必须通过 route 使用的同一个 public catalogue decoder。

- [ ] **步骤 2：在 fixture owner 修正数据**

用明确测试值补齐全部必填 participant-summary 字段。不得放宽生产 decoder、填入虚构 fallback count 或绕过已审查 public code。若 decoder 拒绝一个已经符合公开 schema 的值，先增加另一条独立 RED，再考虑生产代码。

- [ ] **步骤 3：GREEN 与消费者回归**

运行 `tests/pages/app-register-live-route-services.test.ts`，再运行所有导入被改 fixture 的测试。route redirect、first-value decoding、fragment clearing 的断言必须保留。

- [ ] **步骤 4：提交 fixture 修复**

运行 typecheck、staged detect 和 diff 检查，提交：

```bash
git commit -m "test(events): restore registration fixture validity"
```

---

### Task 4：隔离 PostgreSQL 测试并建立显式前置检查

**文件：**
- 新建：`repos/orbits/scripts/check-test-prerequisites.mjs`
- 新建：`repos/orbits/tests/architecture/integration-test-prerequisites.test.ts`
- 修改：`repos/orbits/tests/services/appointment-details-postgres.test.ts`
- 修改：`repos/orbits/tests/services/maintenance-heartbeat.test.ts`
- 只有 impact 指向共享隔离需要时修改：最近的 `repos/orbits/tests/support/*postgres*.ts` helper

**接口：**
- 产出：`checkIntegrationPrerequisites(env)`，返回 `{ ok: true }` 或 `{ ok: false; missing: string[] }`。
- 集成前置：可解析的 `ORBIT_EVENT_DATABASE_URL`、成功的只读连通性探针、测试声明的 schema capability。
- 每个测试使用“Node test run 标识 + random UUID”生成唯一 prefix，只清理带该 prefix 的记录。

- [ ] **步骤 1：先写前置检查 RED**

分别断言缺 URL、URL 非法、数据库不可达、schema capability 缺失时返回稳定命名的 blocker，并让 integration 命令非零退出。输出不得包含 secret。合法的注入式 probe 返回 `{ ok: true }`，且不能写数据。

- [ ] **步骤 2：确认 RED**

运行 `node --test --import tsx tests/architecture/integration-test-prerequisites.test.ts`。预期因前置脚本/契约不存在而失败。

- [ ] **步骤 3：隔离 appointment 与 heartbeat 身份**

把固定 actor/workspace/idempotency key 换成每个测试独有的 UUID 值。所有记录在测试内 seed；断言并发场景只有预期的 accepted result；`t.after` 只删除本测试的唯一记录。heartbeat 的状态序列从本轮 seed chain 推导，不能读到旧运行留下的 `resent`。

- [ ] **步骤 4：分别验证缺前置与具备前置**

移除 URL 后运行 `npm run test:integration`，要求非零退出，且 blocker 明确写出 `ORBIT_EVENT_DATABASE_URL`。恢复批准的本地测试数据库后，连续运行两次完整 integration profile；两次都要通过且测试数一致，证明不依赖旧状态。

- [ ] **步骤 5：提交 integration 隔离**

运行相关 typecheck、staged detect 和 diff 检查，提交：

```bash
git commit -m "test(web): isolate postgres integration baseline"
```

---

### Task 5：恢复 Web 全量门禁并发布失败账本

**文件：**
- 修改：`repos/orbit-app/docs/sprints/0041-web-test-baseline-restoration/BASELINE.md`
- 执行结束后新建：`repos/orbit-app/docs/sprints/0041-web-test-baseline-restoration/REPORT.md`
- 合并验证成功后修改：`repos/orbit-app/docs/sprints/README.md`
- 若 Web/API 行为或共享契约变化则修改：`bridge/status.md`、`bridge/handoffs.md`

**接口：**
- 输入：Tasks 1–4 的固定提交和精确 test profiles。
- 产出：逐项 before/after 账本、固定最终 SHA、合并树门禁证据。

- [ ] **步骤 1：运行 deterministic gate**

在 `repos/orbits` 运行 `npm test`，要求退出码 0、每个测试文件都已归档、没有本 Sprint 新增的 skip。同一 SHA 运行一次 Web typecheck。

- [ ] **步骤 2：运行具备前置的 integration gate**

连接已批准的隔离 PostgreSQL 环境，连续运行两次 `npm run test:integration`，再运行一次 `npm run test:all`，三次都必须退出 0。若环境不可用，Sprint 不能标记 completed；如实记录 blocker，已经独立全绿的 deterministic 提交仍可复用。

- [ ] **步骤 3：必要时重建并重启 Web**

若修改了生产 Web/API 或共享契约，停止本 Sprint 自己的旧进程，运行 production build，启动新产物，并要求 `/api/health` 返回 `live/ok`。若只有测试文件变化，记录为什么不需要重建和重启。

- [ ] **步骤 4：审查、提交、交接**

运行 `git diff --check`、placeholder/skip 扫描和 staged GitNexus detect。`BASELINE.md` 必须把每项原失败标成 fixed、integration-prerequisite 或 still-failing；不允许任何失败凭空消失。最终实现 SHA 固定后，再单独提交 REPORT/账本。

- [ ] **步骤 5：合并并验证 `chat-agent`**

协调者合并固定 SHA，在精确合并树重跑 deterministic gate、Web typecheck 和具备前置的 integration gate，然后 push `chat-agent`。完成这些步骤后，0041 才能标记 completed。

## 失败与交接规则

- 本 Sprint 只有一个 Generator run。缺少已批准的 integration 数据库时，run 可以结束为 `blocked`；不得把它改写成 skip 或 completed。
- deterministic 失败最多做两轮有限修复。保留最初 RED 和最终 GREEN 证据。
- 最终交接列出分支、固定实现 SHA、报告 SHA、精确文件、命令与退出码、profile 测试数、前置状态、剩余失败和回退边界。
- 执行支线不得自行 merge 或 push `chat-agent`；由协调者在独立审查后完成集成。
