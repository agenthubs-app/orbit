/**
 * W0021：把 next-auth 会话里的登录用户 id 同步给浏览器端读取共享（`orbit-shared-read.ts`）。
 */
"use client";

import { useContext } from "react";
import { SessionContext } from "next-auth/react";

import { getSharedReadAccount, setSharedReadAccount } from "./orbit-shared-read";

/**
 * 在读取前同步账号：从 next-auth 的 SessionContext 取登录用户 id（没有 SessionProvider 时什么都不做）。
 * 在组件渲染时调用（幂等），这样同一组件后面的 effect 发请求时账号已经就位。
 */
export function useSharedReadAccount(): string | null {
  const session = useContext(SessionContext);
  if (session && session.status !== "loading") {
    setSharedReadAccount(session.status === "authenticated" ? session.data?.user?.id ?? null : null);
  }
  return getSharedReadAccount();
}

