/**
 * W0053：把文件里写出的国家（两位代码，或中／英／日国家名）换成 ISO alpha-2。
 * 名称表用 Intl.DisplayNames 现场生成（与 shared/domain/regions.ts 一致，不手抄表）；认不出返回 null。
 */
import { isValidCountryCode } from "../../../../shared/domain/regions";

let nameIndex: Map<string, string> | null = null;

function key(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s.'’()（）-]/g, "");
}

const EXTRA_ALIASES: Record<string, string> = {
  uk: "GB",
  usa: "US",
  unitedstatesofamerica: "US",
  中国大陆: "CN",
  中華人民共和国: "CN",
  中华人民共和国: "CN",
  日本国: "JP",
  korea: "KR",
  韓国: "KR",
};

function buildIndex(): Map<string, string> {
  const index = new Map<string, string>();
  const locales = ["en", "ja", "zh-Hans", "zh-Hant"];
  const displays = locales.flatMap((locale) => {
    try {
      return [new Intl.DisplayNames([locale], { type: "region" })];
    } catch {
      return [];
    }
  });
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      if (!isValidCountryCode(code)) continue;
      for (const display of displays) {
        const name = display.of(code);
        if (name && name !== code) index.set(key(name), code);
      }
    }
  }
  for (const [alias, code] of Object.entries(EXTRA_ALIASES)) index.set(key(alias), code);
  return index;
}

export function countryCodeFromText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && isValidCountryCode(upper)) return upper;
  nameIndex ??= buildIndex();
  return nameIndex.get(key(trimmed)) ?? null;
}
