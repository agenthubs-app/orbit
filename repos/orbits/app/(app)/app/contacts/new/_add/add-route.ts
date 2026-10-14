/**
 * R12 `/app/contacts/new` 的地址解析（DESIGN §7 旧链接）：
 *   - `?job=<v2 批次 id>` → `/app/contacts/new/scan/<id>`（旧全站提醒、导入记录、收件箱旧链接）；
 *   - `?method=scan` → `/app/contacts/new/scan`；
 *   - `?method=csv|contacts|event|linkedin` → `/app/contacts/new/import?method=…`（R16 取り込み）；`?import=<id>` → `/app/contacts/new/import/<id>`；
 *   - 其余 → 「人脈を追加」门卡页，`?add=manual` 打开手入力抽屉，`?add=invite` 打开招待コード弹窗（R15）。
 * `?lang=` 跟着 redirect 走。纯函数。
 */
export type AddContactRoute =
  | { kind: "redirect"; href: string }
  | { kind: "doors"; manual: boolean; invite: boolean };

export type AddContactSearchParams = Record<string, string | string[] | undefined>;

function read(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const IMPORT_METHODS = ["csv", "contacts", "event", "linkedin"] as const;

function withLang(path: string, params: AddContactSearchParams, query: Record<string, string> = {}): string {
  const lang = read(params.lang);
  const search = new URLSearchParams({ ...query, ...(lang ? { lang } : {}) }).toString();
  return search ? `${path}?${search}` : path;
}

export function resolveAddContactRoute(params: AddContactSearchParams = {}): AddContactRoute {
  const job = read(params.job);
  const method = read(params.method);
  const importId = read(params.import);
  if (job) return { kind: "redirect", href: withLang(`/app/contacts/new/scan/${encodeURIComponent(job)}`, params) };
  if (method === "scan") return { kind: "redirect", href: withLang("/app/contacts/new/scan", params) };
  // 旧「导入记录」里的链接带 import（有时也带 method）：直接打开那一批；批次页按记录自己的类型显示。
  if (importId) return { kind: "redirect", href: withLang(`/app/contacts/new/import/${encodeURIComponent(importId)}`, params) };
  const imported = IMPORT_METHODS.find((entry) => entry === method);
  if (imported) return { kind: "redirect", href: withLang("/app/contacts/new/import", params, { method: imported }) };
  const add = read(params.add);
  return { kind: "doors", manual: add === "manual", invite: add === "invite" };
}
