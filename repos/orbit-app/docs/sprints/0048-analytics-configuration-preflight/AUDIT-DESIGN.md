# 0048：实际根因与最小设计

## 来源与批准边界

用户已批准0042～0046修复与持续推进；本追加只承接0043冻结SC02/03的实际未配置说明失败，不降低原SC，不重开已结束Generator。0043报告`b971a8e1f6ce48796e00591ae83f6e7726dfdcd8`保持failed。

## 查实的失败链

2026-09-16 ROOT在`79e5ed43e`源码（分析源与生产`f2a25`相同）对明确本机`orbit_events/workspace:orbit-dev/event_02`执行REPEATABLE READ READ ONLY事务，直接调用真实`createEventAnalyticsReadModel`，仅参数化SELECT，无provider或业务写，最终ROLLBACK。诊断进程exit0仅代表采集正常，不是业务通过。

1. ORGANIZER_AGGREGATE_SQL：1行，SQL SHA256 `897ac47a51f8940894699952af6c2a856acd0d025d25e0da65b47f3a64f57df2`。
2. EVENT_ANALYTICS_ROI_SQL：0行，SQL SHA256 `0d431a9c8ff0fe376066760f19c4f765f4cc0a17689bd7e2068609254577472c`。
3. readEventAnalyticsRoiSnapshot：PG `42P01`，准确缺表`event_analytics_roi_snapshot_heads`。
4. 当前检查`roiRow`在第3步之后，因而没有抛出既有EVENT_ANALYTICS_CONFIGURATION_REQUIRED；handler将一般异常转换为INTERNAL_ERROR500。C的正式同canonical账号HTTP也实际得到500，无配置reason。

缺表是此事务的实际触发点，不能推广成所有分析错误的根因。没有运行迁移，没有断言已配置活动缺表可正常读取。

统一GitNexus图最后索引源码6a8d，早于C43；query/context仅辅助导航，行号与当前树有差异，根因以当前真实源码及上述PG只读复现为准，不冒图谱新鲜或零影响。

## 最小行为变化

在readOrganizerAggregate中，取得ROI查询结果后、读取snapshot之前判断row/roiRow。缺roiRow立即抛出既有EventAnalyticsReadModelError配置分类，复用handler既有503及reason `event-analytics-configuration-required`。不新增SQL、不绕过既有organizer门禁、不catch所有PG异常伪装配置缺失、不调用快照finalizer。

已配置分支保持原来的live/saved快照与数据校验；该分支真读失败仍沿原错误语义。App已有配置reason展示可复用，只有真实验证发现接线问题才登记必要局部路径。

## 排除与剩余

不解决Core/public cancelled冲突、真实registered阳性fixture、SQLCipher初始化、全域授权epoch或AI工具源版本。上述事项仍开放。缺快照表的真正migration部署另核精确目标与批准，本Sprint不自动修数据库。
