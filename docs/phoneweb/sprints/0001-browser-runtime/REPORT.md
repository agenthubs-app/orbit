# PW-0001 浏览器运行与会话报告

## 交付定位

- Owner：`phoneweb-A`
- Run：`run-01`
- 起始 HEAD：`decd5005c9d88a02b59e7dd28403788886534172`
- Planner SHA-256：`1875e2226db1f18ecfb24ad4a513854e33794ff094090695b5066332a698e3a1`
- A 代码固定 SHA：`6b238ff8d2923946d85be709fb2f5e1865daf867`
- 组合验证使用 B 固定提交：`a1b13641447dbccbf045798eed3c9577a68c6a25`；主线已经包含 B，整合 A 时只需取 A 代码提交。

## Code delivered

1. Expo Web 改为 static export，并新增 `web:export` 与 `phoneweb:serve` 脚本。浏览器 API origin 默认取当前页面同源；显式配置无效或跨源时直接报错，不回退到 `localhost:3000`。
2. 浏览器账号登录改走标准 Auth.js CSRF、credentials callback 和 session cookie 流程，不调用 `/api/auth/mobile/credentials`，也不把原生 cookie envelope 带进浏览器。
3. 浏览器登录会核对提交邮箱与最终 session 身份，避免旧会话把失败的账号切换误判为成功；Google 原生 broker 不在 Web 暴露。
4. 新增固定 upstream 的本地同源服务器，只代理 `/api/**`、GET/HEAD `/orbit-covers/**` 和 `/orbit-demo-assets/**`。服务器支持 Cookie、Origin、重定向改写、JSON 502、路径遍历防护、静态 MIME、静态路由和动态模板路由；缺失 JS 等静态文件保持 404，不会被 catch-all HTML 吞掉。
5. Web 的服务器设置页改为只读当前网站地址，不向公开访问者展示或编辑内部开发地址。
6. 新增 Web 推送设备存储 adapter，避免 `expo-secure-store` 在浏览器注销/设置流程中抛错；原生实现不变。
7. 修复静态导出与浏览器设备语言不同导致的 hydration mismatch：Web 首帧使用静态 HTML 的中文基准，hydration 后再读取设备语言；原生仍在初始化时读取设备语言。

## SC completed

| SC | 本线结果 | 证据与边界 |
| --- | --- | --- |
| 01 | 本地完成 | Node 22.23.2 production export 成功，生成 89 条静态路由；A+B 组合的真实浏览器整链 `pageErrorCount=0`。 |
| 02 | 本地完成 | origin 与 browser auth 测试通过；真实登录中 `/api/auth/mobile/credentials` 请求数为 0；导出产物未发现 `localhost:3000` 或 provider API key 名。 |
| 03 | 本地完成 | 服务器黑盒测试覆盖静态路由、带点号动态 ID、catch-all、缺失静态资源 404、API 原样错误、upstream 502、Cookie/Origin/redirect、资产白名单、405 与路径遍历。真实静态和联系人动态深链刷新均为 200 且无 pageerror。 |
| 04 | 本地完成，公网未验 | 隔离 live API 上完成登录、刷新恢复、真实联系人详情刷新、退出与未授权入口；过期/401 由定向测试覆盖。没有等待真实会话自然过期，也没有做公网域名验证。 |
| 05 | 本线定向完成，主线集成待验 | A 影响范围回归 81/81、typecheck 通过；按主协调要求未重复启动第三套全量 App，最终完整回归由主线在 A+B+路由基线修复合并树执行。 |

## Verification

- `tsc --noEmit`：通过。
- A 影响范围回归：`81/81` 通过。`session-expiry` 中的 `boom` 是测试故意验证坏订阅者隔离的日志，退出码为 0。
- `expo export --platform web --output-dir dist --clear`：通过；最终无清缓存复验也通过，共 89 条静态路由。
- 真实 Chromium：登录成功、Cookie 刷新恢复成功、`/contacts/list` 刷新成功、真实联系人动态详情刷新成功、退出成功、API health 与 SVG 资产同源读取成功；pageerror 0，mobile credential 请求 0。
- 构建产物检查：未发现 `http://localhost:3000` 或 `OPENAI_API_KEY`、`DEEPSEEK_API_KEY`、`GOOGLE_API_KEY`、`GEMINI_API_KEY`、`ANTHROPIC_API_KEY` 字样。
- 所有 build/live 命令都显式清除了上述 provider key，没有调用付费模型供应商。

## 本地运行

在 `repos/orbit-app` 下使用 Node 22：

```sh
npm run web:export
PHONEWEB_HOST=127.0.0.1 \
PHONEWEB_PORT=32111 \
PHONEWEB_UPSTREAM=http://127.0.0.1:32100 \
npm run phoneweb:serve
```

主协调入口可把 `PHONEWEB_PORT` 改为 `32110`。`PHONEWEB_UPSTREAM` 必须是明确的 HTTP(S) origin；脚本不会猜测或回退到本机默认地址。

## 已知边界与交接

- 本次只交付本地服务，没有部署或发布。未来 Vercel 必须让 Web HTML/静态资源、`/api/**` 与两个资产前缀保持同源，并同步生产 Auth.js URL、可信 host、HTTPS Cookie 与动态路由 rewrite；这些远端设置尚未验证。
- live 页面读取到少量既有可选业务接口 404（通知偏好、关系沟通/分析能力）；页面按现有失败态处理且没有运行时崩溃，但业务完整性应由主线场景验收继续确认。
- 实机 iPhone Safari、Android Chrome、软键盘和地址栏变化由 B/主线组合 QA 完成，本线没有把桌面 Chromium 当作实机证据。
- GitNexus 已在修改前完成符号 impact：共享 URL normalize 为 CRITICAL，因此未修改；原生推送撤销链为 HIGH，因此只增加 `.web.ts`；实际修改的认证 Provider、设置和语言 Provider为 LOW。临时 Codex worktree无法注册到 `detect_changes`，主线须在已注册整合树运行最终 `detect_changes` 后再提交整合结果。
- QA 账号窗口已释放；临时凭据没有写入仓库、命令输出或本报告。
