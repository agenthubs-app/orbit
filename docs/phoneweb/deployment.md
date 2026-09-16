# Phoneweb 本地运行与 Vercel 交接

本轮按用户要求只在本地测试。公网由用户稍后部署；下面是配置交接，不表示已部署或已通过公网验收。实际本地结果及限制见 [runtime](runtime.md)，业务入口结果见 [route-inventory](route-inventory.md)。

## 两个运行单元

| 单元 | 仓库根目录 | 职责 |
| --- | --- | --- |
| 手机浏览器前端 | `repos/orbit-app` | Expo App 的浏览器构建；生产文件在 `dist` |
| 既有 Web/API | `repos/orbits` | Next.js、Auth.js、业务 API、持久存储与服务端配置 |

投资人打开前端域名。浏览器的 `/api/**` 以及 `/orbit-covers/**`、`/orbit-demo-assets/**` 由同一域名转发到后端；不让投资人在设置中填写服务器地址。用户原有桌面 Web 可继续保留自己的入口。

## 本地入口

在集成工作树的 `repos/orbit-app` 内执行；先确认32110空闲，32100为本项目持有的API：

```sh
env -u EXPO_PUBLIC_ORBIT_API_BASE_URL OPENAI_API_KEY= DEEPSEEK_API_KEY= GOOGLE_API_KEY= GEMINI_API_KEY= ANTHROPIC_API_KEY= npm exec --yes --package=node@22 -- npm run web:export
PHONEWEB_UPSTREAM=http://127.0.0.1:32100 PHONEWEB_HOST=127.0.0.1 PHONEWEB_PORT=32110 npm exec --yes --package=node@22 -- npm run phoneweb:serve
```

浏览器入口为 `http://127.0.0.1:32110`。后端由协调线持有，不要重复启动或停止他线服务。登录凭据从本地受限文件获取，不能提交进源码。手机连同一 Wi-Fi 时可显式把前端 `PHONEWEB_HOST` 改为 `0.0.0.0`，使用这台电脑的局域网地址；此时相机等安全上下文能力仍需 HTTPS 环境验证，局域网 HTTP 不是公网验收。

## 后续 Vercel 配置

前端项目选择 `repos/orbit-app`，Node22，构建 `npm run web:export`，输出 `dist`，Framework 选择 Other。Expo 官方支持导出后托管到 Vercel；静态路由和动态详情的回退必须同时配置。[Expo 发布说明](https://docs.expo.dev/guides/publishing-websites/)

以下只是前端配置模板；`https://orbit-api.example.invalid` 必须替换为用户实际部署并验证的后端 HTTPS origin，不能指向本机32100。API和媒体规则放在客户端路由回退前，API失败不得被改写为HTML成功页。Vercel支持向外部源站转发请求。[Vercel rewrites](https://vercel.com/docs/routing/rewrites)

```json
{
  "framework": null,
  "buildCommand": "npm run web:export",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://orbit-api.example.invalid/api/:path*" },
    { "source": "/orbit-covers/:path*", "destination": "https://orbit-api.example.invalid/orbit-covers/:path*" },
    { "source": "/orbit-demo-assets/:path*", "destination": "https://orbit-api.example.invalid/orbit-demo-assets/:path*" },
    { "source": "/:path*", "destination": "/" }
  ]
}
```

前端不需要设置 `EXPO_PUBLIC_ORBIT_API_BASE_URL`，这样预览域名、正式域名都从当前网页 origin 访问 API；若显式设置，必须与打开页面的 origin 完全一致。不要向 Expo 的公开变量放数据库地址、Auth.js secret、模型密钥或固定密码。

后端若也使用 Vercel，应作为 `repos/orbits` 的 Next.js 项目单独配置。服务端需要自己的持久数据库、workspace、认证 secret 和明确的前端 `AUTH_URL`；公网 Cookie、HTTPS、代理可信来源与回调按最终域名核验。当前本机 PostgreSQL 和临时账号不会随前端静态文件上线。后台任务/外部 provider 是否运行必须按已有后端交接核对，不能从页面可加载推断成功。

## 部署后验收

使用最终 HTTPS 域名核对登录、错误密码、刷新恢复、退出、无权限访问；直接打开真实联系人/笔记动态链接并刷新。检查 Cookie 未暴露到前端日志、API响应不是HTML、媒体资源可加载。用同一对象完成写入和刷新回读，再用实体 iPhone Safari、Android Chrome 检查输入、键盘、返回、上传。部署前记录前后端固定SHA及环境；出现问题回退同一对已验证版本，数据库迁移按已有后端流程处理。

AI/OCR、原生离线与原生Push的当前差异仍以实际验收记录为准，不因上架静态前端而自动完成。
