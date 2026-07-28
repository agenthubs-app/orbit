import { createAppBootstrapGetHandler } from "./handler";

// App bootstrap route 提供客户端启动时需要的初始状态。
// 它只做 HTTP 参数解析和 envelope 包装；启动数据由 bootstrap service 生成。
export const dynamic = "force-dynamic";

export const GET = createAppBootstrapGetHandler();
