// 条款与隐私政策的版本（发布日期）。改了正文（Web：app/(app)/app/orbit-2026/copy/legal.ts；App 是同一份文字）就在末尾加一个新日期；
// 旧版本不删：有人同意的是那一版。正文与版本的对应由 tests/legal-version.test.ts 用正文的哈希核对。
export const PUBLISHED_TERMS_VERSIONS = ["2026-11-25"] as const;
export const PUBLISHED_PRIVACY_VERSIONS = ["2026-11-25"] as const;

/** 现在页面上显示的版本：注册请求和 Google 首次建号都记这两个。 */
export const LEGAL_VERSIONS = {
  terms: PUBLISHED_TERMS_VERSIONS[PUBLISHED_TERMS_VERSIONS.length - 1],
  privacy: PUBLISHED_PRIVACY_VERSIONS[PUBLISHED_PRIVACY_VERSIONS.length - 1],
} as const;

export function isPublishedLegalConsent(terms: unknown, privacy: unknown): boolean {
  return (PUBLISHED_TERMS_VERSIONS as readonly unknown[]).includes(terms) && (PUBLISHED_PRIVACY_VERSIONS as readonly unknown[]).includes(privacy);
}
