# Sprint 0005 — AI 幂等与跨端会话恢复

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态只在[登记表](../README.md)；具体运行状态以登记表为准。
**原需求:** R-00、R-02；已有显式发送、history携带和真实6条消息回读直接复用。
**目标:** 会话发送、未知结果重试和保存恢复遵守服务端幂等，App／Web续聊不丢历史。

## 进入条件与基线

0002核实B3并发布请求ID、重复／超时、保存版本契约；Web恢复会话自动保存风险已处理或具备隔离对象专测授权；同环境双端会话和原累计费用账本就绪。

开始前从前序实际 REPORT 读取版本和未完成，不把目录存在当依赖完成。起始 HEAD／diff、Planner SHA256、owner 和 run-01 在领取时登记；当前不填写虚构运行信息。报告保留已有5次供应商请求/$0.012780，不作为本轮新增。Web恢复链路源码为orbit-real-agent.tsx hydrateHistory→restoreSession→persistCurrentSession；未实测丢失不得声称数据已损坏。

## 文件边界与排除范围

实施 cwd 为 `/Users/xzhao/Projects/orbit/repos/orbit-app`。只读[原范围](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)、[既有证据](../../verification/2026-09-13-app-connectivity.md)和本任务直接源码。允许修改：
- `src/screens/ai/AiConversationScreen.tsx`
- `src/screens/ai/AiScreen.tsx`
- `src/view-models/conversations.ts`
- `src/view-models/agent-history.ts`
- `tests/ink-signal-ai-conversation.test.ts`
- `tests/conversation-view-model.test.ts`
- `tests/agent-history-view-model.test.ts`

条件性新建（先满足进入条件；当前不存在不表示已实现）：
- `tests/ai-conversation-persistence-interactions.test.tsx`

除此仅可写本 Sprint 的 `REPORT.md`；登记表由协调者更新，其他路径遵守[RULES](../RULES.md)。
**不做：** @联系人、新的自动化工具、修改provider／Web／密钥、通过换问题隐藏原503。

## 验收契约

| SC | 可观察结果 | 最小必要证据 |
| --- | --- | --- |
| SC-0005-01 | 挂载／重开／前后台不自动发新问题；同一请求的重复提交按服务端协议得到唯一结果。 | 实际路由动作次数与服务端幂等证据分别记录，组件锁不能代替后者。 |
| SC-0005-02 | 超时未知结果有明确恢复动作，断网／保存失败保稿且仅重试保存时不重新生成。 | HTTP边界超时、断网、失败、迟到401与重试payload场景。 |
| SC-0005-03 | 会话或账号／服务器切换不串历史；后续问题携带已确认前文。 | 既有history/草稿测试及新增版本冲突回归。 |
| SC-0005-04 | Web创建→App续聊→Web回读与反方向都保留消息、顺序及应保留元数据。 | 同一隔离session的两方向摘要／版本与重开证据；避开未经授权自动写。 |
| SC-0005-05 | 真实生成／工具证据有效，首次503的最先失败层、根因与处理结论有对应证据；付费不超过原累计上限。 | 复用11.3成功记录及原失败请求元数据；仅必要新调用用原账本。若根因仍未知或外部修复未完成，本项保留blocked，不以另一问题成功关闭R-00，也不盲目付费复现。 |

## 一次 Generator 执行

1. 核对条件／批准与当前文件，保护既有改动；条件未齐不消耗 run。
2. 对待改符号做 impact；承接有效 RED 或补本轮行为失败测试。文档／验收型不制造代码修改。
3. 只实现契约增量／收集必需证据，执行下述最小集；本地失败处理遵守规则上限。
4. 对每个已验证独立功能做范围审查、暂存 detect_changes 和 commit；协调者独占Git，其他代理不能并行改其范围。
5. 生成本 Sprint REPORT，登记结果并结束。无 Evaluator、self_assess 或第二次 Generator。

## 最小测试与检查

**档位与理由：** H：模型生成、持久化／幂等和身份隔离。
在 App cwd，现有最小相关回归：
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-ai-conversation.test.ts tests/conversation-view-model.test.ts tests/agent-history-view-model.test.ts
```

本轮行为需要新增的测试：`tests/ai-conversation-persistence-interactions.test.tsx`。创建后必须并入上述目标命令；仅跑旧测试不能证明新增SC。

新增文件创建后并入目标命令；npm run typecheck、提交前一次npm test、git diff --check；真实双端验收单独记范围。
**不额外运行：** 不重复全部AI建议模块验收、不调用独立模型自评、不为复现未知503耗尽预算。

## 失败与交接

必需 SC 失败／受阻不得完成；run 内只做规则允许的有限修复，不改验收条件。超出白名单、需要新设计／接口或必需环境缺失时结束并交 Planner，不自动再生成或换编号重试。
执行结束按[报告模板](../templates/REPORT.md)新建 `REPORT.md`，包含各 SC、真实功能 commit SHA／文件／理由、命令与退出码、原生／跨端范围、未提交改动、失败和预算／下一步。纯文档、无修改或失败也要报告，不能预填成功。
