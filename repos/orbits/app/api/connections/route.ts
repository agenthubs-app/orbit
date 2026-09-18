import { createConnectionsGetHandler } from "./handler";

export const dynamic = "force-dynamic";

// connections list route 返回关系证据链列表；逻辑在 handler.ts 以便注入 actor 与条件读取依赖。
export const GET = createConnectionsGetHandler();
