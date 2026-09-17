# P0 测试确定性说明

`tests/ink-signal-schedule.test.ts` 与 `tests/ink-signal-tasks.test.ts` 的 Playwright fixture 时间戳以 Tokyo 本地时间表达，`open()` 因此显式使用 `timezoneId: "Asia/Tokyo"`。这样 `05:20Z` 稳定显示为 `14:20`，`2026-09-10T00:00:00Z` 稳定显示为 `9月10日 09:00`，不依赖运行机器的系统时区。

这只是两个 fixture 的局部设置，不改变全局 `TZ`、产品默认时区或 timeout。独立的多时区测试继续通过各自显式的 `timezoneId` 覆盖其他设备时区。
