# 复用模式

## Framework / mock / live 三层解耦

来源：`repos/orbits/.learnings/LEARNINGS.md`

Orbit 的 agent 和业务能力必须保持 framework/contract、mock、live 三层解耦。Contract 只定义能力、类型、错误和注入点；mock 数据只能放在 fixtures 或 mock service；live provider 不能 import mock fixture 或依赖演示身份。

## 提交状态检查要覆盖整个任务范围

来源：`repos/orbits/.learnings/LEARNINGS.md`

回答“某个任务是否已提交”时，不能只检查单个代表文件。应先确认 Git 根目录，再检查 `git status`、`git diff --stat` 和任务相关路径的 staged/unstaged/untracked 状态。

## 注释任务也要处理空行移动

来源：`repos/orbits/.learnings/LEARNINGS.md`

如果目标是提交注释改动，空行移动也可能属于同一任务。提交前要区分注释行、注释移动和 blank-only hunk，避免 IDE 里残留看似未提交的注释改动。
