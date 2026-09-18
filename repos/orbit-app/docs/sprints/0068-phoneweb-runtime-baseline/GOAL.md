# Sprint 0068 — phoneweb 运行时基座归位主线

## 要实现什么

把 Phone Web 的运行时基座合并回 `chat-agent`：浏览器 API origin 解析、浏览器认证、
Web 版 base URL / 图片源 / 推送设备会话 / 服务器设置页，以及本机 phoneweb 服务与
journey smoke 脚本。这批文件此前只存在于 phoneweb 线的分支上，主线一个字节都没有。

## 做完能看到什么

- 主线 `repos/orbit-app` 出现 `*.web.ts(x)` 平台分流实现和 `browser-*.ts` 浏览器适配层，
  原生构建不受影响 —— 同一份屏幕代码在原生走原有实现，在 Web 走新增的 `.web` 实现。
- `scripts/phoneweb-server.cjs` 可在本机把 App 以 Web 形式跑起来，journey smoke 脚本可执行。
- 这批文件带来的测试（浏览器认证、origin 解析、Web 推送设备会话、locale 水合等）在主线可跑。

## 怎么验收

先确认原生侧没有被 Web 实现污染：平台分流断言通过、App 全量不出现新增失败。
再确认 Web 侧这批文件自带的测试在主线环境下能跑通。
最后确认合并没有带进 phoneweb 线的其它产品改动 —— 本 Sprint 只要运行时基座。

本 Sprint 只做归位，不实现 Web 本地优先（那是 0077／0078），不部署 phoneweb。
完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
