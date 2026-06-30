# 长跑 Harness evaluator 提示词

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness/prompts/evaluator.md` |
| 中文镜像 | `knowledge/docs/zh/harness-prompt-evaluator.zh.md` |
| 分类 | `harness` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

定义长跑 harness 中 evaluator 角色的职责、输入输出和执行约束，是多代理循环的系统提示来源。

## 审计依据

已核对 prompt 文件仍在 harness/prompts 下；实际执行行为需要和 harness 调用代码及运行证据一起审计。

## 结构化阅读入口

- 第 1 节：源标题：Scope
- 第 2 节：Evidence First Evaluation 循环
- 第 3 节：Evidence 规则
- 第 4 节：源标题：Required Adversarial Checks
- 第 5 节：源标题：Rubric
- 第 6 节：源标题：Verdict Logic
- 第 7 节：源标题：Output Format

## 保留的代码与命令证据

### 代码证据 1

```json
{
  "contract_results": [
    {"id": "SC-1", "status": "pass", "evidence": "specific evidence key/path"}
  ],
  "rubric_scores": {"C1": 3, "C2": 3, "C3": 3, "C4": 3, "C5": 3},
  "feedback": "specific failures and fixes"
}
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
