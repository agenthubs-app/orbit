# R18b 独立复核（`origin/redesign` 52af0d076）

**结论：暂不签收。** REPORT 最新节对未收口项的判断基本诚实；SC-12 全局门禁、SC-14 像素和 SC-16 全量仍未通过。复核只读，未改仓库、未提交；核对了提交、源码及留存日志，未在落后远端的本地工作树重跑测试。以下行号均指 `origin/redesign`。

## S

- **S1｜强制更新、维护可被深链绕过（SC-10/12）。** `repos/orbit-app/app/_layout.tsx:111` 没有全局版本判定；`src/api/app-version.ts:5` 的读取只被更新页、维护页调用，`app/index.tsx:8` 也只覆盖根入口。按 REPORT 的 D 线交接，在根壳接入不可绕过的判定，并实测冷启动与任意受支持深链；接入前保持默认关闭。

## M

- **M1｜“自身新失败 0”无证据，且存在本线失败（SC-16）。** `repos/orbit-app/src/i18n/ja/account.ts:2` 等三语文件新增 `auth.*` 键，与 `tests/i18n-domain-split.test.ts:51` 的域规则冲突；App 全量日志确有该失败。`repos/orbits/app/(app)/app/orbit-2026/auth-public/MaintenanceView.tsx:74` 也进入按钮旧用法失败清单。协调字典归属方迁键并修正只针对旧集合的快照；按获批样式处理按钮后重比像素，再在最终树重跑两端全量并逐名比对基线。最新 REPORT 实际**未声称**零新增失败。
- **M2｜注册失败回退把邮箱写入 URL。** Web `repos/orbits/app/(app)/app/orbit-2026/auth-public/use-account-auth.ts:179`、App `repos/orbit-app/src/view-models/account-auth.ts:173` 均拼接 `email=`，使邮箱留在历史记录并可能随跳转暴露。改用短暂页面状态，或让登录页重新输入；核查 OAuth 回跳仍保留安全 `next`。

## m

- **m1｜范围交接缺记录。** `repos/orbits/app/(app)/app/orbit-2026/account/AccountProfilePage.tsx:201` 的 R18a 页面修复由 `5e26aef60` 随 R18b 提交，超出 PLANNER 列出的本 Sprint 路径。修复本身有针对性测试；请在交接中注明归属与批准依据。

## 核实通过项与边界

SC-01 有预检及补画记录；02–07 有新入口、认证、72 字节校验、安全回跳的源码和定向证据，真实邮件、Google 与邀请全链未验。08–09 的公开路由、FAQ 和空邮箱状态有证据；10–12 的版本契约只增可选字段、App 副本一致，版本读取登记为仅联网、不落离线镜像，未发现需要新增的同步域或 outbox 字段。13 的旧屏已删除，运行时未查到残留导入，路由覆盖和离线页面清单有对应登记；共享旧样式的跨线引用按报告保留。14 的 Web 认证复比 **25 张、0 PASS**，App 代表屏亦失败。15–16 仍待集成与复验；留存全量日志确为 Web **23 fail**、App **29 fail**，不能据后续定向通过推断最终树“自身新失败 0”。