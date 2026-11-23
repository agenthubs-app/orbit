/**
 * agent-design AG12（设计稿附录 E「联系人」行、§4「版本与既有调用方」）：联系人的修改次数记号。
 *
 * 联系人 payload 的 `version` 原是「关系生命周期」的版本（关系初始化时与关系一起加一）。从 AG12 起它是联系人
 * 每次写入都加一的版本：写 `contacts` 集合的每个模块都经这里取下一版，SQL 写入方用同一段片段。
 *
 * - 没有版本的旧记录（以及不是正整数的值）在版本标记里读作 0，第一次写成 1；不做回填（回填属 AG18）。
 * - 写入值永远是正整数（各读取器遇到非正整数会抛 `Invalid contact lifecycle version`）。
 * - 生命周期的变化：一位旧联系人被写过一次后带上了版本，`initialization.ts` 的 `legacyPending`（要求没有版本）不再成立，
 *   与那里的注释「被编辑过的关系不重新初始化」一致。
 * - 期望版本：Agent 的执行与字段写入接口可带 `expectedVersion`，读到的版本标记与它不同就是冲突，不覆盖。
 */

/** The contact's version marker: a positive safe integer as stored, otherwise 0 (an old record without one). */
export function contactVersionOf(payload: Readonly<Record<string, unknown>> | null | undefined): number {
  const value = payload?.version;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : 0;
}

/** The version the next write of this contact stores (a new contact: 1). */
export function nextContactVersion(previous: Readonly<Record<string, unknown>> | null | undefined): number {
  return contactVersionOf(previous) + 1;
}

/**
 * The payload of a write, stamped with the next version after `previous` (the stored payload; null for a new contact).
 * A new contact that already carries a valid version (an acquisition writes 1) keeps it.
 */
export function withNextContactVersion<T extends Record<string, unknown>>(previous: Readonly<Record<string, unknown>> | null | undefined, next: T): T & { version: number } {
  const version = previous ? nextContactVersion(previous) : Math.max(1, contactVersionOf(next));
  return { ...next, version };
}

/** A write against an expected version: the stored marker must be exactly it. */
export function contactVersionMatches(payload: Readonly<Record<string, unknown>> | null | undefined, expectedVersion: number): boolean {
  return contactVersionOf(payload) === expectedVersion;
}

/**
 * SQL writers: the jsonb object `{"version": <next>}` computed from the row's stored payload, to merge with `||`
 * (`set payload = <column> || CONTACT_NEXT_VERSION_SQL(...)`). The same rule as contactVersionOf: a non-integer or a
 * value below 1 reads as 0.
 */
export function contactNextVersionSql(payloadColumn = "orbit_records.payload"): string {
  const raw = `(${payloadColumn}->>'version')`;
  return `jsonb_build_object('version', (case when jsonb_typeof(${payloadColumn}->'version') = 'number' and ${raw}::numeric >= 1 and ${raw}::numeric = trunc(${raw}::numeric) and ${raw}::numeric <= 9007199254740991 then ${raw}::bigint else 0 end) + 1)`;
}
