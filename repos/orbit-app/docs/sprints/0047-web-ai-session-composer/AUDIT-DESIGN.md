# Web 会话续聊缺口：证据与修复设计

2026-09-16，证据来自 [0044 原 run 报告](../0044-ai-conversation-readback-repair/REPORT.md)。产品源 `426b18819523c0b05dd30365b5a02669850841ac`、生产 BUILD_ID `ffPa-FLfCgMTBiMrUVaAu`，不是旧 QA 包或 nested Git 版本。

原生实际发送后正式 GET200/revision2，历史重开成功；Web 同账号正式会话读取成功，但 `/app/agent?session=精确ID` hydration 后 agent root1、input/textarea/contenteditable0、无 page error。第二次 POST 没有发生；两次局部验证脚本修复耗尽，之后只读诊断确认不是 selector 或路径猜测。测试会话已通过原生 UI 删除并正式 GET404/history 缺席，不能把已删 ID 当作未来正例。

根因是 `app/(app)/app/orbit-global-ask/orbit-global-ask.tsx` 排除 agent home，假定该页已有完整 composer；而 `agent/orbit-real-agent.tsx` 的 inChat 分支只渲染标题和消息。`useOrbitAskTarget` 注册仍在，dashboard-only 提问入口不能覆盖已打开的会话。

采用页面内唯一 composer：保留全局跨页 dock 的 agent 排除规则，不重新打开浮球来掩盖缺失。沿用当前页面的语言、按钮、spacing 和 `ask` 可靠发送链，不新建 endpoint、会话 store 或模型循环。输入只由用户显式提交；回读完成前禁用，pending 时禁用，拒绝空白。相同会话的请求必须包含服务器读取的会话 revision，身份继续来自 canonical resolver。

失败时保留草稿与原 reliable request 的安全重试；不清除正文、不自动换 session、不为 unknown outcome 生成新 request。对会话切换和 late response 保持现有可靠链约束，不能把前一会话草稿/回复写入另一个会话。Phone PW0010 正在同 Web `ask` 函数附近修复结果展示，必须先消费其固定切片或串行移交，不能覆盖其 people/artifact fallback。

不改变 0044 failed 事实。三域 notes 实际调用与 source revision/evidence fence 仍映射 0036 原任务；真实失败恢复缺项需本项适用输入交互补证，不能仅用 deterministic 假 provider 声称原生实测完成。
