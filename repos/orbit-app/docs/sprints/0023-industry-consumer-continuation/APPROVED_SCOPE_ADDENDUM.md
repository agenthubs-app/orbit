# 0023 接线范围补充

2026-09-14，用户在收到下列具体接线缺口后再次确认同意，并要求继续由当前代理直接执行。复用该批准，不再逐文件询问。本补充只解除这些传递与兼容缺口，原冻结 Planner 哈希、五项 SC、唯一 Generator 和累计 USD 5 上限不变。

路径相对 Web `repos/orbits`：

| 文件 | 本次用途 |
| --- | --- |
| `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts` | 在已有 `Pick` 与成功投影中传递两个可选行业 ID。 |
| `features/orbit-ai/artifact-task-preview-service.ts` | 兼容新增 artifact 类型，并拒绝在通用预览中生成或回放本人资料。 |
| `features/orbit-ai/general-conversation-service.ts` | 为新工具族补一项类型映射，不新增旧规则分流。 |

原有 `tests/capabilities/orbit-ai-trace-debug.test.ts`、`orbit-ai-artifact-contract.test.ts` 的目录／枚举断言随新工具更新；保留旧工具顺序、行为检查和所有安全断言。新增功能测试仍使用原批准的本人资料工具、完整 trace 和资料页测试文件。

实现采用逐次认证读取。完整资料仅与当前 runtime 对象关联，不进入 artifact JSON；完整 trace 对本人资料回合只保存技术元数据。已有真实跨端、原生、真实模型与数据补齐验收仍分别记录，不能以本地测试替代。

这不是执行完成报告，也不授权未知数据库写入、迁移、部署或提高费用上限。
