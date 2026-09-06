# Orbit 免费封闭测试上线任务表

更新日期：2026-09-06。目标：先让少量测试用户通过稳定公网地址使用 Web/API，再接入 iOS。

当前状态：本地生产构建已通过；全量回归未通过，尚未部署到远程，也未迁移数据库。

## 1. 执行顺序与验收门槛

| 阶段 | 工作 | 验收标准 | 当前状态 |
| --- | --- | --- | --- |
| 0 | 保存已有工作 | 已有代码、设计、文档按内容提交 | 已完成，基线 `76b062d02` |
| 1A | 修复生产构建 | Node 22 下生产编译、应用及运维脚本类型检查、静态页面生成通过 | 已完成 |
| 1B | 本地生产模式冒烟 | 健康检查、登录页、私有页面/API 认证、开发页面隔离通过 | 已完成 |
| 1C | 回归基线整顿 | 定位并处理全量测试失败；明确测试库与产品数据边界 | 待处理，当前 45 项失败 |
| 2 | 本地数据库备份与恢复演练 | 只备份 `public`，验证归档、恢复及表数据一致性 | 未开始 |
| 3 | 创建远程 PostgreSQL | Supabase 免费项目、维护连接和运行连接就绪 | 未开始 |
| 4 | 数据迁移 | 迁移所有应用表；逐表和逐 collection 校验；保留可恢复备份 | 未开始 |
| 5 | 生产环境配置 | 独立认证密钥、Google OAuth、AI、数据库、CORS 和正式域名配置 | 未开始 |
| 6 | Netlify 部署验收 | OpenNext 打包成功；远程登录、业务读取、账号隔离、AI 流式回复通过 | 未开始 |
| 7 | 后台任务 | 单次限时任务执行、幂等、失败记录与调度验证 | 未开始 |
| 8 | iOS 接入 | 正式 API 地址、密码/Google 登录、核心页面及历史记录验证 | 未开始 |
| 9 | 封闭测试放行 | 上述阻塞关闭，备份、额度监控、回滚流程就绪 | 未开始 |

## 2. 本轮已完成的构建修复

- `app/api/mobile/contacts-dashboard/route.ts` 只导出合法的 Next.js 路由字段。依赖注入和错误映射移到同目录 `handler.ts`。
- 成功分支使用 `result.success === true`，兼容当前非 strict TypeScript 配置下的联合类型收窄；认证、actor 和响应结构不变。
- 行业迁移脚本先保存已检查的组织名称，再在回调里匹配后缀，消除 `unknown.endsWith` 类型错误。本轮未执行真实数据迁移。
- `next.config.js` 将文件追踪根目录固定在应用目录，避免受开发机主目录的其他 lockfile 影响。
- `.nvmrc` 和 `netlify.toml` 声明 Node 22；验证版本为 `22.23.2`。
- 生产构建使用 `tsconfig.build.json`，继承现有编译选项，只排除 `tests/`；应用、共享代码、运维脚本仍接受类型检查。
- `npm run typecheck` 保留原来的全量检查。没有启用 `ignoreBuildErrors`，也没有删除或放宽既有测试。

生产与全量检查分开是范围划分，不代表测试债务已解决。正式发布仍受 1C 门槛约束。

## 3. 已执行的验证

| 检查 | 结果 |
| --- | --- |
| Node 22 `npm run build` | 通过，包含 TypeScript、43 个静态生成任务和构建追踪 |
| 人脉总览 schema、服务、路由，CORS，行业迁移单测 | 16/16 通过 |
| 生产健康接口 | HTTP 200，`mode=live` |
| 生产登录页 | HTTP 200 |
| 未登录访问移动人脉总览 API | HTTP 401 |
| 生产开发页面隔离测试 | 57 个开发路径均返回 404 |
| 生产私有页面/API 边界测试 | 私有页面跳转登录，API 返回 401 |
| Node 22 全量测试 | 2,238 项：2,174 通过，45 失败，19 跳过 |
| 全量 TypeScript | 113 项错误，全部位于测试代码；超过已有 110 项上限，待 1C 清理 |

生产冒烟服务使用临时本地端口，验收后已关闭。当前证据不覆盖远程 Netlify 运行、Google 真实授权、已登录业务流程或远程数据完整性。

## 4. 下一批回归问题

下表是失败分组，不是已确认的根因。逐项区分实现缺陷、测试数据前提和过时断言；不能直接删测试或提高阈值。

| 优先级 | 范围 | 代表测试 |
| --- | --- | --- |
| P1 | 数据库迁移、事务与测试库前提 | `event-canonical-membership-*.test.ts`、`event-profile-contract-repair-*.test.ts`、`postgres-live-record-storage.test.ts` |
| P1 | 账号归属、联系人读取和活动报名 | `app-contacts-dashboard-account-scope.test.ts`、`app-contacts-subroutes-live-route-services.test.ts`、`app-event-registration-guide.test.tsx`、`app-register-live-route-services.test.ts` |
| P1 | 共享契约与非测试代码类型边界 | `contract-surface.test.ts`、`orbit-typecheck-ratchet.test.ts` |
| P2 | AI 草稿及语言、联系人展示和活动图片 | `ai-email-draft-service.test.ts`、`orbit-agent-gemini-live.test.ts`、联系人详情与活动页面测试 |
| P2 | 页面清单、导航与视觉约束 | `full-product-functional-audit.test.ts`、`product-surface-manifest.test.ts`、`auth-state-consistency.test.ts`、`orbit-scale-ratchet.test.ts`、`orbit-z-scale.test.ts` |

数据库相关回归应先建立专用测试数据库，避免把当前小雨演示数据当作可重复的测试前提。备份必须先于任何修复性数据写入。

## 5. 后续数据库迁移要求

上一轮审查发现主连接指向本地 PostgreSQL。迁移前重新确认连接目标和当前数据量，不沿用旧统计作为迁移验收结果。

1. 盘点 `public` 下的表、行数、关键 collection、扩展和迁移版本。
2. 生成完整 `public` schema 的 PostgreSQL custom-format 备份，保存在已忽略的备份目录，限制文件权限，并记录校验和。
3. 在独立临时数据库验证恢复，校验主外键约束、逐表数量和关键记录。
4. Supabase 分别提供维护连接与 transaction pooler 运行连接；保存到本地忽略的环境配置或平台密钥管理，不写进文档、Git 或聊天。
5. 对空远程库先建立 schema，再恢复数据；恢复流程必须先做兼容性试验，不能直接重复创建 Supabase 自带对象。
6. 不迁移本地 `profile_repair_operator_cli_*` 等测试 schema。
7. 不使用现有 `sync-cloud-records.ts` 做上传：它的方向是云端到本地。
8. 暂停切换期间的写入，完成最后一次备份、迁移与校验后统一切换 Web/API。

## 6. Netlify 配置准备

应用目录下已添加 `netlify.toml`，构建命令为 `npm run build`，发布目录为 `.next`，Node 版本为 22。

从应用目录执行 CLI；如果使用根仓库的远程构建，将站点 Base directory 设置为 `repos/orbits`，再核实实际读取的配置文件。

以下步骤尚未执行：Netlify 账号关联、OpenNext 适配器打包、环境变量配置、上传、域名和线上验证。普通 `next build` 成功不等于 OpenNext 打包成功。特别检查现有 `proxy.ts -> auth.ts` 的认证依赖是否满足平台 Middleware 限制。

需要在平台密钥管理中配置数据库连接、workspace、独立 `AUTH_SECRET`、Google OAuth、AI 密钥及模型、worker secret，以及精确的公开域名和 CORS origin。仅 iOS 的 API base URL 可以放入 `EXPO_PUBLIC_*`。

私有组织仓库的免费连接权限应在账号中实际验证；必要时使用 CLI 手动部署，不更改仓库公开性。

## 7. 免费服务与功能边界

- 目标架构沿用已选方案：Netlify Web/API + Supabase PostgreSQL + 现有 DeepSeek。
- 账号创建时再次核实免费额度、地区、休眠、服务条款和备份能力；本文件不把免费服务视为有 SLA 的正式生产资源。
- 无限循环 Worker 不直接部署为 Serverless Function。调度改造完成前，界面不能承诺尚未启用的自动提醒或自动执行。
- iOS 的公网测试依赖生产 API；外部分发和推送还需要对应的 Apple/Expo 配置。

参考：[Next.js 自定义 TypeScript 配置](https://nextjs.org/docs/app/api-reference/config/typescript#custom-tsconfig-path)、[Netlify Next.js 支持与限制](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)。
