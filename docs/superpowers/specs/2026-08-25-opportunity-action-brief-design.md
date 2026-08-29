# 人脉机会行动简报设计

**日期：** 2026-08-25
**状态：** 已确认，进入实现
**范围：** Orbit 人脉分析的“机会”页签与共享机会服务

## 目标

用户看到机会建议后，能立即理解三件事：为什么现在要做、具体怎么做、第一步从哪里开始。分析必须稳定、可解释，不调用大模型，不消耗 token。

## 设计原则

1. 规则决定优先级和动作，不让模型承担确定性判断。
2. 所有判断必须附带真实证据；证据不足时明确显示“信息不足”。
3. 保留现有机会字段，在接口中追加版本化 `actionBrief`，兼容 Web 和旧客户端。
4. 点击机会卡片后先展示行动简报，不再直接跳到联系人详情。
5. “查看联系人”是辅助动作，主动作始终与当前机会相符。

## 数据契约

`HighPriorityOpportunity` 增加可选 `actionBrief`：

```ts
interface OpportunityActionBrief {
  ruleVersion: "opportunity-brief-v1";
  type: "follow_up" | "coverage_gap" | "relationship_risk" | "referral_path";
  title: string;
  judgment: string;
  evidence: readonly string[];
  steps: readonly string[];
  primaryAction: {
    kind: "open_contact" | "open_contacts" | "open_pipeline";
    label: string;
    contactId?: string;
  };
  secondaryAction?: {
    kind: "open_contact" | "open_contacts" | "open_pipeline";
    label: string;
    contactId?: string;
  };
  evaluatedAt: string;
  evidenceIds: readonly string[];
  priority: {
    total: number;
    urgency: number;
    relationshipValue: number;
    goalRelevance: number;
    evidenceCompleteness: number;
    dormantRisk: number;
  };
}
```

字段可选是为了兼容旧 fixture 和 mock 服务；live 服务返回的高优机会必须带该字段。

## 规则与评分

评分总分 100：紧迫度 0-30、关系价值 0-25、目标相关度 0-20、证据完整度 0-15、沉睡风险 0-10。

- 紧迫度：根据任务到期时间计算。逾期或今日到期最高，无日期最低。
- 关系价值：使用既有 `businessRelevanceScore` 或 `relationshipStrength`，按 25 分折算。
- 目标相关度：当前任务与联系人已有明确关系目标或价值类型时加分。
- 证据完整度：任务、关系、联系人三类证据按覆盖数量计分。
- 沉睡风险：关系处于培养阶段且缺少近期互动时加分。

同分时继续沿用既有的到期时间和任务 ID 排序，保证结果可复现。

## 文案生成

文案只使用模板插值，不生成小作文：

- `judgment`：一行结论，说明现在为什么值得行动。
- `evidence`：最多三条，每条只放一个事实。
- `steps`：最多三步，使用具体动词。
- 文案优先显示数据库中的中文名称；缺失字段使用中性兜底，不拼接中英双语。

## iOS 交互

机会卡保持当前主页的色彩、图标和圆角。卡片只显示标题、短判断、状态，不增加信息密度。

点击后打开当前页上的底部行动面板：

1. 顶部显示机会类型、标题和关闭按钮。
2. 中间依次显示“为什么现在”“依据”“怎么做”。
3. 底部固定主按钮，辅助按钮为“查看联系人”或“查看联系人库”。
4. 面板支持点击遮罩关闭，不新增路由。

没有 `actionBrief` 的旧数据继续执行现有跳转逻辑。

## 错误处理

- 证据数组为空时显示“现有记录不足，先补充联系人信息”，不伪造依据。
- 非法日期按“未设置时间”处理，不抛出接口错误。
- 规则生成失败不能阻断机会列表；接口继续返回旧字段。
- 全程保持 `aiProviderRequested: false`、无外部网络请求、无数据库写入。

## 验证

1. 服务测试覆盖评分边界、证据不足、非法日期和输出稳定性。
2. iOS view-model 测试覆盖新字段解析和旧接口兼容。
3. 页面源码/渲染测试覆盖打开、关闭、主次动作。
4. 运行 `repos/orbits` 与 `repos/orbit-app` 的类型检查和相关测试。
5. 在 iPhone 17 Pro Simulator 检查机会卡和底部面板，确保无遮挡、无文字溢出。
