/**
 * R26 像素门禁的开发时钟：设计稿示例 fixture 生效时为画板的「今天」，否则 null（用真实时间）。
 * 只在非生产读 globalThis；生产构建里永远返回 null（dev 路由不收录，没有人会设这个值）。
 */
const holder = globalThis as typeof globalThis & { __orbitR26FixtureNow?: string | null };

export function setDesignFixtureNow(iso: string | null): void {
  holder.__orbitR26FixtureNow = iso;
}

export function designFixtureNow(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return holder.__orbitR26FixtureNow ?? null;
}
