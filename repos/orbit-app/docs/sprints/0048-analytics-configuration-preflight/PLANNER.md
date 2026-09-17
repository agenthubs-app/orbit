# Sprint 0048 — 配置预检不被快照读取遮蔽

唯一SprintContract，revision1；existing-codebase / single-generator。前序0043已failed，报告b971a8e1f。本次只承接其配置说明失败，设计见[AUDIT-DESIGN](AUDIT-DESIGN.md)，实施见[计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0048-analytics-preflight.md)。规划基线`79e5ed43e`；run_count=0，当前D45/E46原run仍占两个ROOT槽，不自动启动第三Generator。

## 文件与边界

Web修改`features/events/event-analytics/read-model.ts`、完整`tests/services/event-analytics-configuration.test.ts`，新增`tests/services/event-analytics-unconfigured-postgres.test.ts`。完整handler文件`tests/api/event-analytics.test.ts`和现有snapshot/真实read-model PG文件是直接消费者；handler生产文件仅在确有接线缺口并登记后修改。App优先复用既有配置错误展示，不修改认证、i18n、事件资格或其他源。路径均以`repos/orbits`或`repos/orbit-app`为对应端根；共享根台账/集成由ROOT管理。

排除：迁移真实库、自动补配置/表、改角色或报名、快照finalize、新指标、Core生命周期改写、provider/OCR/Push、恢复已结束0043。

## 验收（四项）

| SC | 行为 | 主验证 |
| --- | --- | --- |
| 0048-01 | 无ROI配置时在snapshot前失败为既有配置分类 | 完整configuration用例：snapshot抛42P01陷阱不得被调用；scope仍准确 |
| 0048-02 | 真PG存在操作源但没有配置/analytics snapshot表，仍是配置错误；不写数据 | taskowned独立cluster+唯一schema，真实SELECT/零skip；schema精确cleanup |
| 0048-03 | 已配置live/saved快照行为与授权拒绝不变，其他错误不伪装配置缺失 | 完整snapshot/API/read-model PG直接消费者、401/403安全404/异常反例 |
| 0048-04 | 重建重启主线production后，同canonical账号同精确活动Web与主8082原生显示配置说明 | 正式HTTP503及reason、实际原生path/actor/APIorigin证据、操作截图、固定SHA/merge/remote |

## 执行与交付

先读ROOT规则/前序报告/设计，注册唯一run和Planner hash，既有符号impact后TDD。权限读取H：定向完整文件覆盖错误/传递消费，两端相关检查按真实变更；本地收口受影响Web一次I检查，保留基线失败与skip，不以旧0043失败数冒无回归。PG测试不加载MAIN `.env`，只允许ROOT明确隔离目标；真实MAIN仅有权只读验证。每失败最多两repair，不二次Generator。source修改后必须Web production build/restart再用App验证；当前Phone原A设备窗口未释放前不得抢UI/服务。

REPORT仅真实结束创建，逐SC pass/fail/missing，路径限定commit→ROOT冻结SHA合入chat-agent→精确合并树验证→适用push/remote核对。中间source检查不代表实际原生路径/hash已确认；配置正例通过不关闭其他Sprint缺项。
