# Codex Review — Sprint 0102

审阅日期：2026-09-27。结论：**快照失效策略总体清楚，但 AI 报告的版本绑定遗漏了实际输入。**

## 审阅版本与范围

- 基线：`af39bf984`；实现：`9bb4e5552`、`a8e118c19`；结束报告：`84890147d`。
- 阅读 PLANNER、REPORT、关系图版本 SQL、快照读写与账号过滤、时间无关核心/每次渲染、联系人分析版本预检、报告 stale 判定及相关测试。
- 以下问题所在代码与审阅 HEAD `ec308129ab85f2db981b5116e145b1a33c860dc3` 相同。

## 发现

### [P2] 修改关系目标后，旧 AI 报告仍被标为当前版本

位置：[contacts-analysis-report-provider.ts:97](/Users/xzhao/Projects/orbit/repos/orbits/features/mobile/contacts-analysis-report-provider.ts:97)，配套 `getAnalysisSource()` 预检与 `getAnalysis()` stale 比较。

有 graphVersion 时，sourceDataVersion 只哈希关系图版本，完全忽略 source.profile；但 profile 仍装入 analysisSource，并通过 `contactsAnalysisSynthesisInput()` 交给模型。用户将目标从“寻找投资人”改为“寻找客户”，六类关系图不变，版本号也不变，针对旧目标的“目标覆盖/下一步建议”报告仍显示 stale=false。旧页面的分析入口也能通过版本预检，虽然参与报告生成的实际输入已变。

**独立复现：** 对相同 graphVersion、不同 profile.relationshipGoal 的两个 source 调用 `createContactsAnalysisSourceDataVersion()`，结果相同。报告 provider 直接用这一哈希比较 stale，形成确定的失效遗漏，无需付费模型调用。

REPORT 第 3 节称“修改个人资料不改变版本”为有意取舍。本意见针对**会进入模型并影响判断的关系目标**，不是要求生日、头像等所有资料变化都让快照失效。关系图快照版本与完整 AI 输入版本不应混为一项。

**建议：** 保留关系图版本驱动 gaps/opportunities 快照，在 AI sourceDataVersion 中额外绑定分析所用目标/资料的有限字段版本；预检同步使用该复合版本。补目标修改后报告变 stale、旧来源版本被拒的测试，也检查可选输入暂时不可用后恢复的版本语义。

## 验收与上线边界

- count/sum/max 同时参与关系图版本可覆盖乱序提交和删除；快照读写包含 workspace/账号检查，未发现可证实的跨账号泄漏。
- 没有 sync_revision 列会退回整图；有列却没有可靠更新机制则缓存无法可信失效。生产要核对列、赋值触发器和所有写入路径，不能仅检查列存在。REPORT 已明确正式同步迁移与现有写锁不兼容，不能把迁移直接执行当作可用修复。
- SC-0102-05 的 Simulator 没有执行；“App 源码未改”可以解释复用意图，但这里后端响应和 AI 行为已改变，需标注原生证据未独立补齐，不写全项通过。

## 验证与影响

- 独立执行上述版本哈希复现；没有运行数据库或模型、没有新建业务记录。
- 未重跑真库 18 种变更、时间推进、HTTP 409/200、原生或全量；历史证据见 REPORT。
- GitNexus 索引比本 Sprint 旧；已先查图谱，再核对源码版本、AI 路由、模型输入和报告 provider。无法用旧图谱证明新增缓存调用链完整。建议修正 AI 输入版本绑定后再接受该部分完成结论。
