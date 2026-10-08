- **P1｜调用方数量与覆盖口径不闭合**  
  位置：`PLANNER.md:73-89、185、191、217`；`docs/sprints/README.md` D22（写 22 个调用方）。  
  方案称有 24 个直接调用方，但列举的页面 19 个、接口入口 5 个已经是 24 个，随后又列出 `agent-request-context.ts` 的两个依赖注入入口，却没有说明它们是否包含在 24 个之内；README 又仍写 22 个。SC-03 的回归文件也没有建立“调用方 → 覆盖测试”的完整映射，因此无法证明全部入口均被覆盖。  
  建议：开工前固定一种统计口径，区分“静态直接调用、依赖注入调用、经 `resolveAuthenticatedApiActor` 间接调用”，生成带文件和行号的最终清单；将 README 数量同步，并在 SC-03 增加逐调用方的现有测试映射。没有测试的入口至少通过静态调用清单加集中 actor 等价测试说明为何无需独立页面测试。

- **P1｜计量 SC 的测试设计不足以证明生产计量链路仍然成立**  
  位置：`PLANNER.md:55-58、113-118、157、184(e)`。  
  生产计量实际依赖 `configured.client` 创建时注入的 `configuredReadMetrics(env)`，再由其 observer 调用共享 gate 的 `observe`。SC-02 只写“计数替身 client＋计数闸门”，替身 client 若只是返回行，不会自然执行 `readMetrics` observer；即使直接调用计数闸门，也只能证明测试接线，不能证明专用 SQL 确实经过生产 client 的计量包装。  
  建议：把 SC-02(e) 改成明确的配置层集成测试：通过 `createClient` 捕获并执行传入的 `readMetrics`，或使用真实 `createPgLiveRecordSqlClient`，比较共享 gate snapshot/observer 在轻量 SQL 前后的 rows、bytes 增量；同时断言 provider 使用的是 `configured.client`，而不是另建或裸注入的 client。

- **P2｜等价矩阵尚未锁定完整的旧查询谓词**  
  位置：`PLANNER.md:112-116、152-154、183`。  
  实现说明要求 WHERE 与 `listQuery` 等价，但 SC-01 只覆盖 deleted 和跨 workspace，没有覆盖 archived 记录。旧查询条件是 `lifecycle_state <> 'deleted'`，因此 archived 也会参与原始行数、阻止 accountId 回退，并可能参与排序；实现若误写成 `lifecycle_state = 'active'`，现有矩阵仍可能全过。  
  建议：增加 archived profile/account 场景，尤其是“按 id 命中 archived 但无效的 profile 时仍不回退”，并对生成 SQL 明确断言使用 `<> 'deleted'`。

- **P2｜全站流量估算对多个轮询端点的频次含义不明确**  
  位置：`PLANNER.md:186、237`。  
  W30-4 只写“收件箱停留 10 分钟，15 秒一次，约 40 次”，但 SC-04 同时列出三个轮询端点。没有说明 40 次是三个端点合计、每个端点各 40 次，还是页面实际只启动其中一部分；这会造成该部分月估算最多约 3 倍偏差。名片批次轮询也只给持续时间和间隔，没有规定实际经过身份解析的端点数及停止条件。  
  建议：先用页面/接口实测确定每个轮询周期实际请求的端点集合，再按“端点 × 每周期调用次数 × 周期数 × 活跃用户数”逐项计算；REPORT 同时列出单端点数据和合计，明确 1000 人是否都按日活计算。
