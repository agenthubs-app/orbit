/**
 * R12 `/app/contacts/new` 的地址解析（DESIGN §7 旧链接）：
 *   - `?job=<v2 批次 id>` → `/app/contacts/new/scan/<id>`（旧全站提醒、导入记录、收件箱旧链接）；
 *   - `?method=scan` → `/app/contacts/new/scan`；
 *   - `?method=csv|contacts|event` 与 `?import=<id>` → 仍渲染旧 NetworkImport（その他 的临时落点，R16 改 redirect）；
 *   - 其余 → 「人脈を追加」门卡页，`?add=manual` 打开手入力抽屉，`?add=invite` 打开招待コード弹窗（R15）。
 * `?lang=` 跟着 redirect 走。纯函数。
 */
import type { NetworkImportMethod } from "../../network-0918/network-import";

export type AddContactRoute =
  | { kind: "redirect"; href: string }
  | { kind: "legacy"; method: Exclude<NetworkImportMethod, "scan">; importId?: string }
  | { kind: "doors"; manual: boolean; invite: boolean };

export type AddContactSearchParams = Record<string, string | string[] | undefined>;

function read(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const LEGACY_METHODS = ["csv", "contacts", "event"] as const;

function withLang(path: string, params: AddContactSearchParams): string {
  const lang = read(params.lang);
  return lang ? `${path}?${new URLSearchParams({ lang })}` : path;
}

export function resolveAddContactRoute(params: AddContactSearchParams = {}): AddContactRoute {
  const job = read(params.job);
  const method = read(params.method);
  const importId = read(params.import);
  if (job) return { kind: "redirect", href: withLang(`/app/contacts/new/scan/${encodeURIComponent(job)}`, params) };
  if (method === "scan") return { kind: "redirect", href: withLang("/app/contacts/new/scan", params) };
  const legacy = LEGACY_METHODS.find((entry) => entry === method);
  if (legacy) return { kind: "legacy", method: legacy, ...(importId ? { importId } : {}) };
  // 旧「导入记录」里的文件导入链接都带 method；只带 import 的按 CSV 打开（vCard / 活动导入的批次面板会按记录自己恢复）。
  if (importId) return { kind: "legacy", method: "csv", importId };
  const add = read(params.add);
  return { kind: "doors", manual: add === "manual", invite: add === "invite" };
}
