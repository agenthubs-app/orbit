# 长跑 Harness planner 提示词

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness/prompts/planner.md` |
| 中文镜像 | `knowledge/docs/zh/harness-prompt-planner.zh.md` |
| 分类 | `harness` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

定义长跑 harness 中 planner 角色的职责、输入输出和执行约束，是多代理循环的系统提示来源。

## 审计依据

已核对 prompt 文件仍在 harness/prompts 下；实际执行行为需要和 harness 调用代码及运行证据一起审计。

## 结构化阅读入口

- 第 1 节：源标题：Inputs You May Rely On
- 第 2 节：Planning 循环
- 第 3 节：源标题：SPEC Requirements
- 第 4 节：源标题：SPEC: Orbit
- 第 5 节：产品 执行 摘要
- 第 6 节：实现 Principles
- 第 7 节：Technical 边界
- 第 8 节：源标题：Sprint Definitions
- 第 9 节：Sprint 契约 Seeds
- 第 10 节：Hard 规则

## 保留的代码与命令证据

### 代码证据 1

```json
{
  "contracts": [
    {
      "sprint_number": 1,
      "goal": "one user-visible sprint goal",
      "success_criteria": [
        {"id": "SC-1", "description": "observable behavior"}
      ],
      "out_of_scope": ["explicit non-goal"],
      "evidence": {
        "routes": ["/"],
        "commands": [{"name": "test", "cmd": ["npm", "test"]}],
        "api": [],
        "source_files": [],
        "public_routes": []
      },
      "file_boundary": {
        "capability_root": "features/example",
        "owned_paths": ["features/example/**", "app/dev/capabilities/example/**"],
        "allowed_shared_paths": [],
        "forbidden_paths": ["features/unrelated/**"],
        "mock_to_live_doc": "features/example/LIVE_IMPLEMENTATION.md",
        "shared_change_policy": "forbidden_unless_explicit"
      }
    }
  ]
}
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
