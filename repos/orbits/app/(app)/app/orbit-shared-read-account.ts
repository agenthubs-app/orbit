/**
 * W0021：把 next-auth 会话里的登录用户 id 同步给浏览器端读取共享（`orbit-shared-read.ts`）。
 */
"use client";

import { useContext } from "react";
import { SessionContext } from "next-auth/react";

import { getSharedReadAccount, setSharedReadAccount } from "./orbit-shared-read";

export interface SharedReadAccountState {
  /** 登录用户 id；未登录或没有 SessionProvider 时为 null。 */
  account: string | null;
  /**
   * 会话是否已定：有 SessionProvider 且还在 loading 时为 false——这时账号未知，按账号分 key 的读取（进行中批次
   * 登记表）要等它变 true 再读，否则会读到旧全局 key。没有 SessionProvider 的环境恒为 true。
   */
  ready: boolean;
}

/**
 * 在读取前同步账号：从 next-auth 的 SessionContext 取登录用户 id。在组件渲染时调用（幂等），这样同一组件
 * 后面的 effect 发请求时账号已经就位。返回值是响应式的（会话变化时组件重渲染）：按账号读取的 effect 把
 * `account`／`ready` 放进依赖，loading → authenticated 时会重新读取（W0021 review P1）。
 */
export function useSharedReadAccount(): SharedReadAccountState {
  const session = useContext(SessionContext);
  if (!session) return { account: getSharedReadAccount(), ready: true };
  if (session.status === "loading") return { account: null, ready: false };
  const account = session.status === "authenticated" ? session.data?.user?.id?.trim() || null : null;
  setSharedReadAccount(account);
  return { account, ready: true };
}
