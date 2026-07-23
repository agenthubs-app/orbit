// NextAuth 的 catch-all(登录/回调/会话/CSRF 全在这里)。
// 配置在项目根 auth.ts;route 保持薄壳,与参考实现一致。
import { handlers } from "../../../../auth";

export const { GET, POST } = handlers;
