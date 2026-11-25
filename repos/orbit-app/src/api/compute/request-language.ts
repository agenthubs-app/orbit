/**
 * 请求带来的界面语言（原始写法，未归一）：`?lang=` → App / Web 调用带的 `x-orbit-lang` → Web 的 `orbit-lang` cookie。
 * 都没有时返回 null，由调用方决定缺省（events / plans 缺省 ja）。events 运营（text-language.ts）与 plans requestContext 共用这一个顺序。
 */
export function orbitLanguageCookie(request: Request): string | null {
  return /(?:^|;\s*)orbit-lang=([a-z]{2})/u.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
}

export function requestLanguageTag(request: Request): string | null {
  return new URL(request.url).searchParams.get("lang") ?? request.headers.get("x-orbit-lang") ?? orbitLanguageCookie(request);
}
