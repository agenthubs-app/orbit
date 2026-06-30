# 排障知识

## Orbit AI trace submit 卡在 loading

来源：`.learnings/TROUBLESHOOTING.md`

问题表现是 `/dev/orbit-ai/trace` 提交后按钮保持 loading，看起来无法点击。根因之一是 live provider 请求没有硬超时，导致 trace API 一直等待。后续还发现 `/app/agent` 存在 responsive desktop/mobile ChatBox 副本和 blank prompt native disabled 状态，需要用 runtime DOM 验证。

处理原则：

- provider adapter 必须有 hard timeout。
- timeout、网络失败和 JSON 解析失败要转成结构化 `MODEL_REQUEST_FAILED`。
- prompt submit 控件应优先用 `aria-disabled` 表达视觉状态，并在 handler 里阻止空输入。
- 调试 responsive UI 时要检查可见副本和隐藏副本。
