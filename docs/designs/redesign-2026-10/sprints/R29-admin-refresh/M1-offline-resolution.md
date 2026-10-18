# REVIEW M1 — 公开入口首次离线探测

`/admin/access` 只呈现公开管理员登录，不读取后台私有资源。其 `withOnlineOnlyRoute` 现在打开时执行一次公开健康探测（`probeOnOpen: true`），与其他未登录公开入口一致；探测失败时由 `OnlineOnlyBoundary` 显示「接続が必要です」。`offline-pages-actions.test.tsx` 把该实际路由纳入六个未登录入口的探测约束。

本地故障服务器在 3200 端口关闭每个连接，原生 16e 模拟器终止 App 后以 `/admin/access` 冷启动。45 秒后的截图与无障碍树均显示「接続が必要です」和重试按钮，原入口内容也按既有 boundary 设计留在下方；脚本退出 0。故障日志包含 `/api/health`，没有 `/api/events` 或后台列表读取；App 的全局同步和会话还产生了独立请求，故不能把日志里健康请求总次数解释为本路由的探测次数。证据：`/Volumes/ORICO/Dev/line-a-evidence/R32/run-01/app/native-offline-access.{json,png}`、`offline-request-paths.jsonl`、`r29-native-offline-access.log`。此文件随 M1 修复单独提交。
