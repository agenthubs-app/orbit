# 长跑 Harness verifier 提示词

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness/prompts/verifier.md` |
| 中文镜像 | `knowledge/docs/zh/harness-prompt-verifier.zh.md` |
| 分类 | `harness` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 中文摘要

定义长跑 harness 中 verifier 角色的职责、输入输出和执行约束，是多代理循环的系统提示来源。

## 审计依据

已核对 prompt 文件仍在 harness/prompts 下；实际执行行为需要和 harness 调用代码及运行证据一起审计。

## 结构化阅读入口

- 第 1 节：源文档第 1 个标题
- 第 2 节：源文档第 2 个标题
- 第 3 节：Dev 路由 Sprint Rule
- 第 4 节：源文档第 4 个标题
- 第 5 节：源文档第 5 个标题
- 第 6 节：边界
- 第 7 节：源文档第 7 个标题

## 保留的代码与命令证据

### 代码证据 1

```json
{
  "scores": {"clarity": 3, "trust": 3, "efficiency": 3, "delight": 3},
  "issues": [
    {
      "id": "UX-1",
      "severity": "low",
      "user_impact": "specific user-facing impact",
      "evidence": "specific evidence key/path",
      "recommendation": "specific improvement"
    }
  ],
  "feedback": "experience-level assessment"
}
```

## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。
