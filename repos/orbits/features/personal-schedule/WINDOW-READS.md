# 日程窗口读取范围

本地实现，尚未部署。基于 `04cbd31c`，与同批通知 GET 移除全日程 refresh 一起集成。

## 已替换的读取

周期展开原来读取整个系列的全部异常记录，再在进程里计算当前窗口。现在 SQL 只返回两类候选：

1. 原始发生时间落在窗口里的实例异常，含取消及改期移出窗口的实例；
2. `patch.startsAt` 的日期可能落入窗口的其他实例异常，用于保留历史实例改期移入窗口的情况。

第二类使用窗口 UTC 日期前后两天的保守范围，覆盖带时区偏移的合法时间字符串；最终仍按真实开始时刻判断窗口归属，不能把日期字符串比较当作最终业务筛选。取消、重复规则、实例是否在系列有效范围内、存储身份和归属仍由现有解码及展开规则校验。

普通列表使用配置的数据库客户端；写操作、后台窗口维护使用当前事务的 executor，避免读不到本事务刚保存的例外。内存测试实现使用相同候选选择；SQL 出错不回退为全量下载。精确实例读取仍按完整实例 ID 查询一次。

已删除没有生产调用者的 `refreshReminderPlans(actor)` 全日程遍历入口。真正后台处理保留 `refreshReminderPlansForSeries(actor,id)`，由到期窗口工作领取具体系列。相关成本测试改测该实际入口，不为了旧测试保留全量路径。生产切换前提见 `docs/operations/schedule-reminder-inbox-cutover.md`。

## 本地证据

新增 `tests/services/personal-schedule-window-exception-cost-postgres.test.ts`，真实 PostgreSQL、随机 schema。固定同一个系列和窗口，先验证历史移入、窗口移出、取消、窗口内修改、异主拒绝及系列开始前的伪实例不会出现，再追加 10,000 条无关历史异常。

- 修改前：显示结果不变，但异常查询返回从 3,556 B 增至 12,943,556 B，预算断言失败。
- 修改后：显示结果相同，异常查询固定一次、5 行、2,706 B，追加历史后不增长。
- 已有独立诊断脚本 `scripts/diagnostics/schedule-exception-window-cost.ts` 复验：无关历史 0/100/1,000/5,000 条时异常返回均为零行，整个 SELECT 结果约 1.08 KB；原 5,000 条场景为约 6.90 MB。
- 将 5,000 条历史实例真的改期进当前窗口时，仍返回全部 5,090 项，HTTP 序列化结果仍约 2.95 MB。没有静默截断，也没有把合法的大结果冒充已完成分页。

复现（Web 根目录，不加载 `.env`）：

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 node --import tsx --test tests/services/personal-schedule-window-exception-cost-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 node --import tsx scripts/diagnostics/schedule-exception-window-cost.ts
```

这些是本地结果 JSON 字节，不是 Neon 计费流量或生产用户分布。当前窗口合法结果分页、个人日程主集合的全历史读取，以及数据库内部候选扫描成本仍未整体解决。本批不新增缓存、表或未经测量的索引，不宣称日程模块已全面有界。
