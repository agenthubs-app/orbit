# Sprint W0019 — 上线清单与大目标收口

**Plan revision:** 2（2026-09-28 按 Codex 方案 review 修订：原「Preview 复验与上线清单」拆为本 Sprint 与 W0020）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-04（上线清单部分）。**单一目标:** 生产上线清单文档 + 本地合并树全量对照。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** W0018 合并后的 `chat-agent` HEAD。
**进入条件:** W0018 completed。

## 上下文包（从这里起步，不通读其他 REPORT）

- 必读：
  - `scripts/migrate-web-runtime.ts`：迁移入口（计划 W0007、匹配 W0010，以及 W0017 若新增的维护领取表）。
  - `vercel.json`：生产 cron（`/api/internal/maintenance` 每天 03:00 UTC）与队列触发器；`vercel.staging.json`：staging 无 cron／Queue。
  - `shared/config/guide-demo.ts`：`ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE`（D1、D2）。
  - `docs/operations/2026-09-25-neon-egress-audit.md`（用户未提交文件，只读）：生产源码落后于主线、`ORBIT_PG_READ_METRICS` 已设置。
  - W0017 REPORT 的流量表与「上线后观察项」；W0018 REPORT 的遗留问题；README「发布动作」。
- 易错边界：
  - 只写文档与跑本地测试；不部署、不连任何云端库。
  - 清单每一步标明：执行者、需要的授权、验证方法、回退方式；生产源码落后主线的事实要写进清单（先确认要发布的 SHA）。

## 范围与文件

- 新建：`docs/operations/<日期>-iorbit-release-checklist.md`。
- 修改：无产品代码。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0019-01 | 上线清单包含：发布 SHA 确认、迁移顺序与回退、`ORBIT_GUIDE_DEMO`／`ORBIT_GUIDE_DEMO_SINCE` 取值及理由、维护任务与调度、上线后 24 小时／7 天的流量与功能观察项，每步标明授权人 | 清单文档 |
| SC-W0019-02 | 大目标 2 全部合并后的本地合并树全量对照：新增失败为 0（或逐条说明） | 全量对照记录 |

## 最小测试与检查

- 档位：I（大目标收口）：一次全量基线对照。

## 失败与交接

清单交用户；需要云端授权的复验交 W0020。
