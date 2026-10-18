# REVIEW S1 — App 活动详情来源 ID

R29 活动列表读 `/api/events` 的当前账号来源记录。QA 种子给这类记录一个账号范围 ID（例 `iorbit-qa-f8546e7220:event_signup_03`）；活动详情 `/api/events/[id]/overview` 读取已发布的 Event Core ID（例 `event_signup_03`）。种子在 `sourceMetadata.providerRecordId` 保留这个上游 ID。旧列表直接把账号范围 ID 放进详情 href，所以同账号 13 条全为 404。

列表视图现在仅对 QA 种子来源 `iorbit-account-agent-pressure-fixtures` 使用 `providerRecordId` 组成详情 href；列表记录自身的 `id` 和其他来源的 href 不变。`admin-view-model.test.ts` 覆盖两类来源。`/Volumes/ORICO/Dev/line-a-evidence/R32/run-01/event-source-probe.json` 在本地 `orbit_line_a`、live 模式、同一 QA 账号下记录列表 13 条及每条规范 ID 的 overview HTTP 200；不代表原生链已通过。

原生 16e 模拟器在同一 QA 会话中完成 A03 → A04 → 首条详情 → A04 → A03 → 下拉刷新，脚本退出 0 且 `detailAvailable: true`。详情截图显示「日中投资人与创业者沙龙」及介绍／议程／主催标签，不是加载态或 404。证据：`/Volumes/ORICO/Dev/line-a-evidence/R32/run-01/app/native-navigation.json`、`native-nav-*.png` 与 `r29-native-navigation.log`。此文件随 S1 修复单独提交。
