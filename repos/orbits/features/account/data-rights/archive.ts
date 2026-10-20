import { strToU8, zipSync } from "fflate";

import type { AccountContactsFormat, AccountExportMode, AccountExportScope } from "../../../shared/contract/account";

const ALL_SCOPES: AccountExportScope[] = ["contacts", "notes", "plans", "tasks", "events"];
const FIELDS: Record<AccountExportScope, string[]> = {
  contacts: ["id", "displayName", "email", "phone", "organization", "createdAt", "updatedAt"],
  notes: ["id", "title", "body", "createdAt", "updatedAt"],
  plans: ["id", "title", "description", "status", "createdAt", "updatedAt"],
  tasks: ["id", "title", "description", "status", "dueAt", "createdAt", "updatedAt"],
  events: ["id", "title", "kind", "startsAt", "status", "createdAt", "updatedAt"],
};

export interface ExportImage {
  name: string;
  bytes: Buffer;
}

export interface AccountExportArchiveInput {
  scope: readonly AccountExportScope[];
  mode: AccountExportMode;
  contactsFormat: AccountContactsFormat;
  generatedAt: string;
  read(scope: AccountExportScope): Promise<Record<string, unknown>[] | null>;
  readImages?(): Promise<ExportImage[] | null>;
  maxBytes?: number;
  onProgress?(completedItems: number, totalItems: number): Promise<void> | void;
}

function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : typeof value === "string" ? value : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(scope: AccountExportScope, rows: Record<string, unknown>[]): Uint8Array {
  const fields = FIELDS[scope];
  return strToU8(`\uFEFF${fields.map(cell).join(",")}\r\n${rows.map(row => fields.map(field => cell(row[field])).join(",")).join("\r\n")}${rows.length ? "\r\n" : ""}`);
}

function vcardValue(value: unknown): string {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\r\n", "\n").replaceAll("\n", "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
}

function vcards(rows: Record<string, unknown>[]): Uint8Array {
  return strToU8(rows.map(row => [
    "BEGIN:VCARD", "VERSION:4.0", `UID:${vcardValue(row.id)}`, `FN:${vcardValue(row.displayName)}`,
    ...(row.email ? [`EMAIL:${vcardValue(row.email)}`] : []),
    ...(row.phone ? [`TEL:${vcardValue(row.phone)}`] : []),
    ...(row.organization ? [`ORG:${vcardValue(row.organization)}`] : []), "END:VCARD",
  ].join("\r\n")).join("\r\n") + (rows.length ? "\r\n" : ""));
}

export async function buildAccountExportArchive(input: AccountExportArchiveInput): Promise<Buffer> {
  const scopes = input.mode === "all-json" ? ALL_SCOPES : [...new Set(input.scope)];
  if (!scopes.length) throw new Error("Export scope required");
  const maxBytes = input.maxBytes ?? 50 * 1024 * 1024;
  const files: Record<string, Uint8Array> = {};
  const manifestFiles: { path: string; count: number }[] = [];
  let accumulated = 0;
  const add = (path: string, bytes: Uint8Array, count: number) => {
    accumulated += bytes.byteLength;
    if (accumulated > maxBytes) throw new Error("Export exceeds size limit");
    files[path] = bytes;
    manifestFiles.push({ path, count });
  };
  for (const [index, scope] of scopes.entries()) {
    const rows = await input.read(scope);
    if (rows === null) throw new Error(`Export domain unavailable: ${scope}`);
    const json = input.mode === "all-json";
    const name = json ? `${scope}.json` : scope === "contacts" && input.contactsFormat === "vcard" ? "contacts.vcf" : `${scope}.csv`;
    const bytes = json ? strToU8(JSON.stringify(rows, null, 2)) : scope === "contacts" && input.contactsFormat === "vcard" ? vcards(rows) : csv(scope, rows);
    add(name, bytes, rows.length);
    await input.onProgress?.(index + 1, scopes.length);
  }
  if (input.mode === "all-json" && input.readImages) {
    const images = await input.readImages();
    if (images === null) throw new Error("Export domain unavailable: business-card-images");
    for (const image of images) {
      if (!/^[a-zA-Z0-9._-]{1,128}\.(jpe?g|png|webp)$/.test(image.name)) throw new Error("Invalid export image name");
      add(`business-card-images/${image.name}`, image.bytes, 1);
    }
  }
  files["manifest.json"] = strToU8(JSON.stringify({ version: 1, generatedAt: input.generatedAt, mode: input.mode, files: manifestFiles }, null, 2));
  accumulated += files["manifest.json"].byteLength;
  if (accumulated > maxBytes) throw new Error("Export exceeds size limit");
  const compressed = Buffer.from(zipSync(files, { level: 6 }));
  if (compressed.length > maxBytes) throw new Error("Export exceeds size limit");
  return compressed;
}
