"use client";

/**
 * 登录 / 注册入口的回跳地址：当前页面的路径加查询参数（不含 `#` 片段），经与登录页同一个
 * `normalizeProfileOnboardingNext` 校验；当前页不能当目标（流程页、站外）时用调用方给的 fallback。
 *
 * 首帧（含服务端渲染）用 fallback，挂载后才读 `window.location`，避免 hydration 不一致。
 */
import { useEffect, useState, type ReactNode } from "react";

import { normalizeProfileOnboardingNext } from "../../profile/profile-onboarding-navigation";
import { authRoutePath } from "./auth-model";

export function currentReturnPath(fallback: string): string {
  const safeFallback = normalizeProfileOnboardingNext(fallback);
  if (typeof window === "undefined") return safeFallback;
  return normalizeProfileOnboardingNext(`${window.location.pathname}${window.location.search}`, safeFallback);
}

export function useCurrentReturnPath(fallback: string): string {
  const [path, setPath] = useState(() => normalizeProfileOnboardingNext(fallback));
  useEffect(() => {
    setPath(currentReturnPath(fallback));
  }, [fallback]);
  return path;
}

/** 服务端组件（404 页顶栏）里的「ログイン」链接：只换 href，DOM 与原来的 `<a>` 相同。 */
export function CurrentPageLoginLink({ className, children, fallback = "/app/home" }: { className?: string; children: ReactNode; fallback?: string }) {
  const next = useCurrentReturnPath(fallback);
  return <a className={className} href={authRoutePath("login", next)}>{children}</a>;
}
