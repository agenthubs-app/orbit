# R11a 画板预检（五项结论）

跑法：`node scripts/visual/board-preflight.mjs --suite scripts/visual/views/<端>-R11a.json --md …`（2026-10-18，R11a 改稿与 b12 g10 补画提交之后）。逐元素的数据来源清单原样放在 [preflight-web.md](preflight-web.md)（Web 清单 `web-R11a.json`）和 [preflight-app.md](preflight-app.md)（App 清单 `app-R11a.json`）。

| # | 项 | Web | App | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 画板自洽（同一画面不同画板之间文字 / 结构矛盾） | 0 | 0 | 无需拍板 |
| 2 | 近似但不等的值（字号 ±1、行高 ±0.06、圆角 ±1、色差 ≤14） | 6 | 1 | 全是 kit 原值与 token 的小差（如行高 1.55 vs `--lh-body` 1.5）；实现一律用 token，门禁里按 `[raster]` 归因 |
| 3 | 缺 token（间距不在 `--space-*` 刻度上等） | 61 | 95 | 多为画板内联 `style`（`padding:12px 14px`、`gap:10px`、`margin-top:14px`）；实现按最近 token 或 kit 类原值写，不新增 token（token 归 A 线）；像素收口时逐带看 |
| 4 | 疑似无功能元素 | 31 | 37 | 见下「数据与功能」；其余是装饰图标 / 标注圈（§51 补充 7：标注圈不进实现） |
| 5 | 数据来源 | 见下 | 见下 | 全部有契约字段或明确处理 |

## 数据与功能（第 4 / 5 项的处理）

- **页头**「N人 · 今月 +M」：`/api/contacts/summary` 的 `total` / `addedThisMonth`（Asia/Tokyo 月界）；App 本机目录 `summary` 同口径。
- **つながり / 目標に関係する人 N**：`summary.tabCounts.goalRelated`（计划 id 读时合并，`GET /api/contacts/goal-related-ids`）。
- **情報の濃さ 三段 + 三格**：`summary.densityCounts`（卡片 `density` 读时并入计划）。
- **出どころ**：`summary.sourceChips`（`meishi / linkedin / phone / event / manual / self`；`self` 读时合并）。
- **页签 すべて / 目標に関係 / 要フォロー**：`total` / `tabCounts`；要フォロー = `isOpenFollowUpTask`（`shared/compute/follow-up-task.ts`，tasks + lifecycle）。
- **行**：头像（名字首字）、`displayName`、`organization · role`、`density`、`sourceChip`、🎯 `links[].label` + 話した（`goal-related-ids.links`）、最終接点（`lastInteractionAt`，没有时「M/D 登録」「YYYY年M月につながる」）。
- **絞り込み**：段階 `status`（知り合い / 関係構築，§B-2）、業界 `primaryIndustryId`（`summary.industries` 前 5 + その他）、地域 `region.city`（`summary.regions` 前 3 + その他）、出会った場所 `metKind`（`summary.metKinds`）、情報の濃さ `density`；底部「N人が該当」= 带筛选的 `summary.total`。
- **連絡先詳細**：`GET /api/contacts/[id]`（头卡、`nextAction`、`publicProfile.offering / seeking`、`notes`、`lastInteraction`、`fieldHistory` → 以前の値）、`value-lines`（なぜこの人か，失败整块隐藏）、`/api/agent/plans/v2/contacts/[id]/fit`（虚线确认卡）、`/api/invite-codes/connections/[id]`（本人入力、`pausedFields`、共有する項目）。
- **日程を提案**：R20a `MeetingProposalSheet` / `MeetingProposalModal`（只引用）。
- **下書きを作成**：进 iOrbit 带预填意图；「送信はしません」是说明文字。
- **画了但本期不做**：段階「推進中 / 協業中」（§B-2，`[data]`）；「最近削除した項目」（设计稿无 / 下一期，DEFERRED-A R11-17）；转职冲突提示（§51-4，下一期）。
- **右栏 今日の 1問**（Web）：R16 `TodayQuestionCard`（已过门禁的画板口径）。
