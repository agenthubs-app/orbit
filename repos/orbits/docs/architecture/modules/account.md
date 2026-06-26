# Account 模块

## 模块定位

Account 负责当前操作者的会话状态、演示登录、退出登录和需要账号上下文的基础守卫。它是产品进入业务模块前的身份上下文入口。

## 期望行为

模块应提供稳定的 session API，返回当前用户、登录状态和可恢复的错误 envelope。实际业务实现可以接入真实账号系统，但不能改变调用方看到的服务接口。

## Mock 行为

Mock 服务返回确定性的演示账号、待登录状态、退出状态和受控失败场景，不访问真实账号、设备、网络或数据库。

## 热拔插边界

调用方必须通过 `features/account/service-factory.ts` 获取 `AccountSessionService`。未来替换真实账号实现时，只在 factory 中注册 live/hybrid constructor，API route 不直接引用 mock 文件。
