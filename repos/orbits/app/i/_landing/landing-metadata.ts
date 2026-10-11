/**
 * R15 `/i`、`/i/<code>` 的页面头（DESIGN add-and-invite §2.5 第 8 条、§6 第 8 条）：
 *   - `<title>` 与 OG / Twitter 只写「Orbit への招待」（按浏览器语言三语），**不带邀请人名字**——
 *     LINE / Slack / iMessage 抓取链接预览时看不到是谁发的；
 *   - `robots: noindex, nofollow`（不被搜索引擎收录）；
 *   - `referrer: no-referrer`（页面内 `<meta name="referrer">`；响应头另由 next.config.js 的 `/i/:path*` 给出），
 *     离开页面时 Referer 不带码。
 * 纯函数，供两个页面的 `generateMetadata` 用（测试直接调用）。
 */
import type { Metadata } from "next";

import { inviteLandingCopy } from "../../(app)/app/orbit-2026/copy/invite";
import { pickCopy } from "../../(app)/app/orbit-2026/copy/types";
import type { OrbitLanguage } from "../../../shared/contract/language";

export function inviteLandingMetadata(language: OrbitLanguage): Metadata {
  const title = pickCopy(inviteLandingCopy.documentTitle, language);
  const description = pickCopy(inviteLandingCopy.documentDescription, language);
  return {
    title,
    description,
    referrer: "no-referrer",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title, description, siteName: "Orbit", type: "website" },
    twitter: { card: "summary", title, description },
  };
}
