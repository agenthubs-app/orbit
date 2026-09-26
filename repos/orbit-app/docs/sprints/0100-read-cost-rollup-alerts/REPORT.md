# Sprint 0100 执行报告：读取量汇总、对账、管理页和报警（监控 O2 + O3）

**run-01**。Generator 为子代理，协调者代写本报告。分支 `sprint/0100-read-cost-rollup-alerts`，未推送。Planner SHA256 为 `06ee63b6…`，契约没有改动。
**状态：completed**。有 3 件事需要用户知道，见第 7 节。

## 1. 结论

- **维护任务**：在每天运行的维护任务（`/api/internal/maintenance`）里新增 `read_cost_rollup`，没有另加 cron。它做五件事：
  1. 把已经结束的 UTC 日汇总成两张表：一张按「日期 × 接口 × 来源」，一张按「日期 × 账号」。每条小票按 1/抽样率放大；重算某一天时先删后写，所以重复跑结果不变。
  2. 写一行 Neon 对账。
  3. 对最近 2 天检查 3 条报警规则。
  4. 清理：小票保留 14 天，汇总保留 1 年，对账行永久保留。
  5. 把报警写进管理员的收件箱。

  已经算完的日子会跳过，所以心跳每 10 分钟跑一次几乎没有开销。
- **管理页和接口**：网页 `/app/admin/read-cost` 页面，加上 `GET /api/admin/read-cost` 接口。页面有五块：7 天总量和 Neon 对账、最费的 20 个接口、最费的 20 个用户、单个接口 30 天趋势、最近的报警。
- **谁能看**：只有环境变量 `ORBIT_READ_COST_ADMIN_ACCOUNT_IDS` 里列出的账号能看；这个变量为空时谁都看不到。

  | 访问者 | 页面 | 接口 |
  |---|---|---|
  | 管理员 | 200 | 200 |
  | 非管理员 | 404 | 403 |
  | 未登录 | 跳转登录页 | 401 |

- **报警通知**：走现有的收件箱写入路径，新增来源类型 `read_cost_alert`，只有管理员看得到。同一规则、同一天、同一对象只报一次。没配管理员时，报警先挂起，配上之后再补发。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 汇总之和等于小票之和；同一天重跑结果不变 | 通过 | 真库测试覆盖：抽样率 0.5 的小票算作 2 次、没有归属的小票、跨日边界。运行时：测试小票合计 21,294,789 字节，汇总表合计也是 21,294,789 字节。 |
| 02 清理边界 | 通过 | 真库测试：14 天多 1 分钟的小票被删，13 天的保留；366 天前的汇总被删，364 天前的保留。运行时：维护任务删掉 15 天和 20 天前的两张小票，13 天前的那张还在。 |
| 03 访问控制 | 通过 | 路由测试和运行时 HTTP 都验证了上表；管理员能看到 5 个区块；非管理员拿到的 404 页面里没有任何读取量数据。 |
| 04 报警各发一次，重跑不重复 | 通过 | 真库测试：执行真实的 `runMaintenancePass`，再从真实收件箱路由读回，管理员 2 条、非管理员 0 条；重跑后数量不变。运行时：第一次维护返回 `alertsRaised 2 / alertsDelivered 2`，第二次都是 0。agenthubs 管理员账号（`account_orbit_generated`）通过 `/api/inbox/notifications` 读回 2 条中文通知，英文版也正确。 |
| 05 Neon 未配置时显示「未取得」；全量等 | 通过 | 未配置时记 `unavailable`，不发任何请求；本地模拟 Neon 接口时算出覆盖率 60%，触发低覆盖率报警；Neon 返回 500 时记 `failed`，维护任务照常成功。 |

**变异检查**（证明测试真的会失败）：
- 去掉按抽样率放大，SC-01 变红；
- 把报警写入从「冲突时跳过」改成「冲突时更新」，SC-04 变红。

两处都已恢复。

## 3. 设计选择

- **表**：新建 4 张表，建表语句追加在小票建表语句后面，迁移的步骤数和顺序都没变，只需要跑一次 `db:migrate:live`：
  - `orbit_read_cost_daily_routes`
  - `orbit_read_cost_daily_accounts`
  - `orbit_read_cost_reconciliation`
  - `orbit_read_cost_alerts`：规则、日期、对象三者唯一，另有 `notified_at` 列
- **时区**：所有日期计算都显式写 `at time zone 'UTC'`。开发中发现本地库的时区是 Asia/Tokyo，已经修正，并有测试覆盖。
- **报警规则**：阈值是代码常量，写在 `features/operations/read-cost/config.ts`。
  1. 某接口当天的平均每次读取量，超过过去 7 天日均值中位数的 2 倍。**子代理额外加了两个限制：至少要有 3 天历史数据，且当天平均值至少 100KB，用来避免小接口的噪声。这两条不在设计案里，需要用户确认。**
  2. 单次请求读取超过 5 MiB。
  3. Neon 数据有效，且覆盖率低于 70%。
- **Neon**：`NEON_API_KEY` 和 `NEON_PROJECT_ID` 都配置了才会调用。接口是 `consumption_history/projects?granularity=daily`，读取其中的 `data_transfer_bytes`；返回结构对不上时记为 `failed`。
- **契约**：新来源类型 `read_cost_alert` 加进了 contract 和 schema，并用 `npm run sync:contract` 同步到 App。

## 4. 文件与提交

路径都在 `repos/orbits` 下。

- **新增**：
  - `features/operations/read-cost/` 下的 `config.ts`、`rollup.ts`、`neon-usage.ts`、`alerts.ts`、`maintenance-task.ts`、`overview.ts`
  - `app/api/admin/read-cost/`
  - `app/(app)/app/admin/read-cost/page.tsx`
- **修改**：
  - `shared/storage/migrations.ts`
  - `features/operations/maintenance/configured-tasks.ts`
  - `features/notifications/inbox-record-service-factory.ts`：只加了一个针对新来源类型的判断分支
  - 收件箱的 contract 和 schema，两端都改了
- **测试**：
  - `tests/operations/read-cost-postgres.test.ts`：6 条，真实数据库
  - `tests/operations/read-cost.test.ts`：4 条单元测试
  - `configured-maintenance-reminder-wiring.test.ts` 新增 1 条。这一条是接线完成后才补的，没有先看到它失败。
- **提交**：
  - `8320dc031` feat(orbits): read-cost daily rollup, Neon reconciliation, admin page and alerts (0100 O2+O3)
  - `fa8be1d8e` fix(orbits): keep read-cost admin tables readable at phone width
  - `de6e0749a` fix(orbits): use an on-scale gap in the read-cost trend chart

## 5. 子代理执行的全量测试

- **orbits 第 1 次**：48 条失败，其中 15 条是新增的：
  - 14 条是因为测试命令多加了 `ORBIT_DATABASE_TARGET=local`。已经复现，去掉这个变量后全部通过。
  - 1 条是真问题：趋势图里的 `gap: 2` 让尺寸刻度棘轮从 167 变成 168，改成 `gap: 4` 后修复。
- **orbits 第 2 次**：5143 条，33 条失败，失败名单全部在已知清单里。
- **App**：3596 条，1 条失败，是 route-parity。它的缺口清单里多了 `/admin/read-cost`。
- **Postgres 测试**：新增的 10 条全部通过。
- **typecheck**：三处都是 0 错误。
- **读取上限棘轮**：没有变化。

## 6. 运行时证据

构建方式：`next build --webpack`，然后 `next start -p 3100`，连本地 `orbit_events`。

1. 造了 52 张测试小票（路由为 `GET /api/test-0100/*`）。
2. 真实调用维护接口：不带密钥返回 401；第一次运行 13 天被汇总、2 条报警生成并送达、2 张过期小票被清理；第二次运行全部是 0。
3. agenthubs 账号登录后读收件箱，看到两条报警：
   - 「读取量翻倍：GET /api/test-0100/dashboard」，977 KB 超过中位数 781 KB 的两倍；
   - 「单次请求读取超过 5 MB」，6.0 MB。
4. 截图：1280 和 390 两个宽度，都没有横向溢出。

测试数据和测试账号已全部清理。证据在 `build/harness-state/evidence/sprint-0100/run-01/`。

## 7. 需要用户知道的

1. **跨端风险（已实测）**：0100 之前的 App 构建不认识 `read_cost_alert`。管理员只要有报警，**整个收件箱列表都会解析失败**。上线顺序必须是：先把管理员手机上的 App 更新到新版本，再配置 `ORBIT_READ_COST_ADMIN_ACCOUNT_IDS`。没配名单时，报警只挂起、不写进任何人的收件箱。这也暴露了一个更普遍的问题：App 的 schema 遇到任何未知通知类型都会整页失败，后续应改成跳过未知条目（另行登记）。
2. **agenthubs 账号在网页上被资料引导闸门拦住**：它缺主行业、细分行业和生日，所以网页上所有页面都会被 307 到 `/app/profile/onboarding`，读取量页也打不开。这是现有数据状态，没有替用户改。
3. **需要用户确认**：规则 1 额外加的两个限制要不要保留；这个网页专用的管理页，是在 App 里补一个对应页面，还是在 route-parity 里加例外。

## 8. 上线步骤

1. 在生产库执行 `npm run db:migrate:live`。
2. 管理员手机上的 App 更新后，配置 `ORBIT_READ_COST_ADMIN_ACCOUNT_IDS`，值为生产环境 agenthubs 账号的编号。
3. 可选：配置 `NEON_API_KEY` 和 `NEON_PROJECT_ID`，然后检查对账表的 `neon_status` 是否为 `ok`。

## 9. 遗留问题

1. Neon 用量接口的地址和字段没有在真实账号上验证过。
2. 管理后台的导航里没有「读取量」入口。
3. `neon_status` 为 `failed` 的对账行，之后不会自动重取。
4. `window failure…` 这条测试在多个文件同时跑时不稳定，和本 Sprint 无关。

## 10. 协调者复核
以下检查由协调者在 `de6e0749a` 上独立完成：

- **Postgres 测试**：设置 `ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test` 后，运行 `read-cost-postgres`、`read-cost` 和 `read-receipts-postgres` 三个文件，共 14 条，全部通过，没有跳过。
- **orbits 全量**：5143 条，4713 通过，33 失败，397 跳过。失败名单按名字逐条对照已知清单，没有新增。
- **运行时抽查**：先 `next build --webpack`，再 `next start -p 3100`。未登录访问 `/api/admin/read-cost` 返回 401；不带密钥访问 `/api/internal/maintenance` 返回 401；未登录打开 `/app/admin/read-cost` 返回 307，跳转到登录页并带上 next 参数。汇总表和报警表都是空的，说明子代理已把测试数据清理干净。
- **diff 审查**：没有新增 skip 或 only。
- **登记为后续问题**：App 收件箱的 schema 遇到未知的通知来源类型时，会让整个列表解析失败。以后每新增一种通知类型，旧版 App 都会出这个问题。应该改成跳过无法识别的条目，并加一条反例测试。建议在下一个会改动 App 收件箱的 Sprint 里一起处理（最早是 0104）。
