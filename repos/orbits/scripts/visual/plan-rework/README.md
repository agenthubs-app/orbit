# 计划页像素门禁 · 复跑脚本（交接表 R25-05）

原来散在各会话 scratchpad 的造状态 / 跑组脚本，参数化后收在这里，新会话可以直接复跑 `views/web-plan-{A,B,C}.json`。

**前提**：只读 mock 服务器（不写真实库，数据 = 设计稿示例数据）：

```bash
ORBIT_NEXT_DIST_DIR=.next-rework-plan ORBIT_REDESIGN_MOCK=plan-v2-summary npx next dev --webpack --port 3203
```

（经 `.claude/launch.json` 临时配置起；跑完停服务、`git checkout -- tsconfig.json next-env.d.ts`、删 distDir。）
登录态用门禁默认的 `~/orbit-sprint-evidence/redesign/.auth/qa@orbit.test.json`（先跑一张带 `--login qa@orbit.test` 的门禁生成；含会话 cookie，不提交）。

| 脚本 | 用法 | 做什么 |
| --- | --- | --- |
| `api.sh` | `api.sh <METHOD> <path> [json]` | 以 qa 身份调 `/api/agent/plans<path>` |
| `setup.py` | `setup.py <状态>` | 造状态。B 组（生成流程）：`bg` / `q` / `p` / `d` / `r1` / `r3`（新建 intake 推进到 背景 / 5問 / 前提 / 初版 / 修正 1 回 / 修正 3 回，打印 intakeId）；C 组（見直し）：`03` / `one`（用掉 1 次，W-R25-01）/ `05` / `06a` / `used` / `achieve` |
| `run.sh` | `run.sh <A\|B\|C> <out 子目录> <fixture\|-> <only>` | 切 fixture（`-` 不切）后跑对应清单的 `--only` |
| `c-all.sh` | `c-all.sh <步骤…>` | C 组整套：`legacy r03 r05 r06 done goals modal mm mgoals medit mused edit used`（每步切 fixture + 造状态 + 比） |
| `sum.sh` | `sum.sh <out 子目录> <id…>` | 汇总 raw 与超阈带 |

环境变量：`PLAN_ORIGIN`（默认 `http://localhost:3203`）、`PLAN_STORAGE`（默认上面的登录态）、`PLAN_OUT`（默认 `~/orbit-sprint-evidence/redesign/pixel-audit/run-02/plan-rework`）。
清单里的 `app-origin` 写死了端口（A 3201 / B 3202 / C 3203），`run.sh` 会用 `--app-origin $PLAN_ORIGIN` 覆盖。
B 组门禁前先跑 `node features/plans/v2/design-fixtures/seed-local-chats.mjs --origin $PLAN_ORIGIN --storage $PLAN_STORAGE`（目標入力右栏「最近の会話」）。
