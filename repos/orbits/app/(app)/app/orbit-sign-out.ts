/**
 * 退出登录的统一入口：先清掉本机留下的这个账号的东西，再交给 next-auth 退出并整页跳转。
 *
 * - 内存里的读取缓存（orbit-last-answer、首页卡片缓存）；
 * - localStorage 里带个人内容的项：最近搜索词、iOrbit 当前会话、资料引导草稿、受信箱页签记忆。
 *   语言、外观、意味検索开关这类设备偏好保留（不含个人数据，共用电脑上换人也合理沿用）；
 * - sessionStorage 全部（提问草稿交接、滚动位置、计划提示等都是这一次登录的）；
 * - 受付平板的本机名单与离线队列（kiosk-store，原有）。
 * 服务端在退出响应里另发 `Clear-Site-Data: "cache"`（app/api/auth/[...nextauth]/route.ts），浏览器 HTTP 缓存
 * 同时清空；页面响应是 no-store（proxy.ts），退出后按「后退」不会看到上一个人的页面。
 */
"use client";

import { signOut } from "next-auth/react";

import { clearAnswers } from "./orbit-last-answer";
import { clearHomeResources } from "./orbit-2026/home/use-home-resource";
import { clearKioskDevice } from "./orbit-2026/host/kiosk-store";

const PERSONAL_KEYS = ["orbit.search.recent", "orbit-agent-chat-active-session-v1"];
const PERSONAL_PREFIXES = ["orbit.onboarding.v1:", "orbit:inbox:tab:"];

export function forgetThisAccountOnDevice(): void {
  clearAnswers();
  clearHomeResources();
  try {
    for (const key of PERSONAL_KEYS) window.localStorage.removeItem(key);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && PERSONAL_PREFIXES.some((prefix) => key.startsWith(prefix))) window.localStorage.removeItem(key);
    }
  } catch { /* storage may be unavailable */ }
  try { window.sessionStorage.clear(); } catch { /* storage may be unavailable */ }
}

/** Every sign-out button: forget this account on the device, then sign out. */
export async function signOutAndForget(callbackUrl: string): Promise<void> {
  forgetThisAccountOnDevice();
  await clearKioskDevice().catch(() => undefined);
  await signOut({ callbackUrl });
}
