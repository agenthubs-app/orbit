# Permissions 模块设计文档

## 设计定位

Permissions 负责授权状态和敏感动作确认。Orbit 有很多外部能力：通讯录、邮箱、日历、OCR、通知、外部消息、CRM 写入。Permissions 的任务是让这些能力在用户授权和确认前保持关闭。

它不是 UI 弹窗集合，而是所有外部副作用前的统一检查边界。

## 子能力范围

- `permission-state-and-staged-authorization-mock`：权限状态、授权请求和 staged authorization。
- `sensitive-action-confirmation-guard`：敏感动作确认、批准和拒绝。

## 契约与数据边界

契约位于 `features/permissions/contract.ts`。核心 DTO 包括 permission kind、state、scope、request state、confirmation item、approval decision、safety note 和 provenance。权限状态应表达产品语义，不暴露 OAuth token 或 provider response。

Service factory 提供 permission state 和 sensitive action confirmation services。

## Mock 行为

Mock 权限状态是本地 fixture。授权请求不会打开真实 OAuth；确认动作不会执行外部副作用。批准只代表确认状态变化，真正执行仍由对应模块或 Agent sandbox 控制。

## Live 替换方案

Live 可以接 OAuth、系统权限、workspace policy 或企业管理员配置。Token、scope 和 provider response 必须被封装，不进入页面。确认记录应可审计，并能被 Agent、Notifications、Chat、Acquisition 等模块查询。

## API 与页面使用

API 包括 permissions、calendar request、confirmation approve/reject 等。页面使用 Permissions 展示授权缺口、确认问题和安全说明。所有需要外部写入的模块都应先检查 Permissions。

## 测试要求

- permission state 测试覆盖 granted、denied、pending、not requested。
- confirmation 测试覆盖 approve、reject、missing id、already decided。
- API envelope 测试确认错误和上下文不泄露 token。
- 页面组合测试确认敏感动作前有确认提示。

## 团队协作规则

Permissions 团队维护授权和确认状态，不拥有具体业务动作。业务模块不能绕过 Permissions 直接调用外部 provider。
