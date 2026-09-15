# Sprint 0015 — 执行总结

## 目标实现情况

- IORBIT、事项／Today、个人日程／日历与收件箱的产品界面已接入账号级中／日／英语言环境；会话正文、事项标题、联系人引用、活动名称、日期和时区仍保持原始业务值。
- 语言切换、草稿、失败恢复、事项写入、收件箱已读与权限边界均由真实路由交互测试覆盖；本轮没有为了翻译触发模型、邮件、日历或通知 provider。
- 原生冒烟先发现日文事项页的直达返回按钮仍显示中文；新增回归测试先 RED，再在六个 0015 `AppScreen` 消费页面显式接入本地化父级标签，复验为“ホームに戻る”。
- 本 Sprint 的四项 SC 已完成；更完整的多设备、键盘、辅助功能与跨端矩阵仍按原计划由 0016／0017 承接，不作为本轮缺项重算。

## 运行记录

- 目标／原需求：R-12 第三组；SC-0015-01～04。
- 结果：completed。
- run：run-01；Generator owner `/root`；2026-09-15 07:39～12:39 JST。
- Planner revision／SHA256：revision 1；`50280129380cfa0a181bdbdb4a38d1a74dfae38c7ddb815b027151982810f858`。
- 基线 HEAD／承接的脏文件：`c5c091fba`；用户未跟踪的设计 PNG/zip/目录、`repos/orbit-app/prototypes/` 与 `.gitnexus` 全程保留且未暂存。
- 被验收的最后功能 HEAD：`16d545b06cc26c96a19be08b6a1efa5ea09518e6`；主体三语功能 `d7180e134acea94aa6ba252eadbafd06e5d11202`。
- 原环境／账号角色／设备：本地 Web `127.0.0.1:3000`、Metro `127.0.0.1:8082`、专用 iPhone 17 Pro simulator `9BF990F2-…`；隔离测试账号 `orbit.empty.…@example.test`。最终账号语言恢复为英文、系统字号恢复为 standard/large。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| AI、事项、日程、收件箱三语 chrome；动态语言、literal 数据和请求语义边界 | `src/i18n/**`、目标 `src/screens/**`、直接 `src/view-models/**` 与测试 | `d7180e134` | 01～04 |
| 修复直达事项／日程／Agent 页面沿用中文返回标签；加入覆盖六个 `AppScreen` 消费者的回归测试 | AI 1、事项 2、日程 3 个 screen 与 `tests/app-locale-assistant-workflows.test.tsx` | `16d545b06` | 01、02、04 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0015-01 | pass | IORBIT 会话定向测试；中文原生 `/ai` 直达页 | 消息控件、历史／空态、建议问题与发送入口为中文；没有自动发送或模型调用，原文与引用保持 literal。 |
| SC-0015-02 | pass | 事项／日程定向测试；日文 `/tasks`、英文 `/schedule` 原生直达 | 事项、个人日程、日历三语可用，日期／时区不变量与失败保稿通过；日文返回标签修复后为“ホームに戻る”。 |
| SC-0015-03 | pass | inbox 定向测试；英文 `/inbox` 原生直达 | “Home / Compose / Inbox / Messages / Alerts” 可见；空账号不伪造消息，未执行真实发送或已读写入。 |
| SC-0015-04 | pass | 320／宽屏／dark／1.6～2.0 字号、草稿与键盘回归；专用模拟器最小冒烟 | 目标测试和 App 全量通过；原生中／日／英关键路由可访问。完整实体设备矩阵由 0016 承接。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC／证据路径 |
| --- | --- | --- | --- |
| 五文件目标组合 | 修复前主体功能 | exit 0；129/129 | 01～04 |
| 首轮 App `npm test` | `d7180e134` + 0024 已合入源码 | exit 0；2775 pass、0 fail、0 skip；211237ms | 01～04 |
| 原生中文 IORBIT、日文事项、英文日程／收件箱 | 2026-09-15；专用 simulator | 主体均可读；首次日文事项出现中文“返回首页” | 01～04；`build/harness-state/evidence/sprint-0015/run-01/native/` |
| 新增直达返回本地化测试 | 修复前 | exit 1；5/6，`AgentActionsScreen.tsx` 首个缺少本地化返回属性 | 01、02、04；RED |
| 新增回归测试、typecheck | `16d545b06` 前同一产品 diff | exit 0；6/6；`npm run typecheck` exit 0 | 01、02、04；GREEN |
| 修复后五文件目标组合 | `16d545b06` 前同一产品 diff | exit 0；130/130；55899ms | 01～04 |
| 修复后 App `npm test` | `16d545b06` 前同一产品 diff | exit 0；2776 pass、0 fail、0 skip；365088ms | 01～04 |
| 修复后原生日文事项 | 2026-09-15；专用 simulator | “ホームに戻る”及日文事项空态可见 | 02、04；`native/ja-tasks-fixed.png` |
| `git diff --check`；Web／Metro 存活检查 | 最后产品 diff | exit 0；3000/8082 均 HTTP 200 | 01～04 |

本轮因三个 L 集成门槛按 Planner 执行两次 App 全量；第二次是在原生发现的问题完成 RED→GREEN 后取得的最终证据。未运行付费模型、真实邮件发送、生产部署或实体 iPhone；新增 provider 调用和费用为 0。0016 继续完整原生设备／键盘／辅助功能矩阵，0017 继续 Web↔App 系统验收。

## 交接

- 0015 已完成并释放 `src/i18n/{messages,zh,ja,en}.ts` 独占锁；后续页面使用 `AppScreen` 时不能依赖其中文默认标签，应显式传入 locale 父级名称，或在独立 Sprint 设计共享本地化导航模型。
- App 最后功能版本 `16d545b06`；Web/API 本轮无源码变化，继续使用 0013 的账号语言偏好服务。因无 Web 源码更新，本轮没有重编译重启 Web；冒烟期间 3000 与 8082 均保持可用。
- 原生证据包含 `zh-ai.png`、首次问题截图 `ja-tasks.png`、修复后 `ja-tasks-fixed.png`、`en-schedule.png` 与 `en-inbox.png`；账号语言最终为 `en`。
- GitNexus 对三个 screen 返回 LOW、三个因索引缺失返回 UNKNOWN；staged detect_changes 错误返回 0 changes，与 Git 暂存的 7 文件清单冲突，因此未把它当范围证明，实际按精确 staged diff、定向测试和最终 App 全量审查。
- 未提交内容仅为用户已有未跟踪设计素材、prototype 与 `.gitnexus`；无活测试进程，Web／Metro 服务继续运行。
- 精确回退应分别反向处理 `16d545b06` 与 `d7180e134`，不得清理用户未跟踪文件。
