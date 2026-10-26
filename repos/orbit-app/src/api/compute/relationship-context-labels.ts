// QA-C4: attendee and draft relationship context is built and stored in English
// ("Event: … Looking for: … Can offer: …"). Read routes swap those three labels for
// the reader's language (x-orbit-lang); the values themselves are left as written. Pure.
type ContextLanguage = "en" | "zh" | "ja";

const LABELS: Record<Exclude<ContextLanguage, "en">, Record<string, string>> = {
  zh: { "Event": "活动：", "Looking for": "想找：", "Can offer": "能提供：" },
  ja: { "Event": "イベント：", "Looking for": "探しているもの：", "Can offer": "提供できるもの：" },
};

const LABEL_AT_START = /^(Event|Looking for|Can offer):\s+/u;
const NEXT_LABEL = /\.\s+(?=(?:Event|Looking for|Can offer):\s)/u;

/** The builders write `Label: value.` parts joined by spaces, then free text; only leading labelled parts change. */
export function localizeRelationshipContext(text: string, language: string | null | undefined): string {
  if (language !== "zh" && language !== "ja") return text;
  const labels = LABELS[language];
  const parts: string[] = [];
  let rest = text.trim();
  for (let label = LABEL_AT_START.exec(rest); label; label = LABEL_AT_START.exec(rest)) {
    rest = rest.slice(label[0].length);
    const next = NEXT_LABEL.exec(rest);
    // Without a following label the value runs to the first ". " (free text follows) or the closing ".".
    const stop = next ? next.index : rest.search(/\.(?:\s|$)/u);
    const value = (stop < 0 ? rest : rest.slice(0, stop)).trim();
    rest = stop < 0 ? "" : rest.slice(stop + 1).trimStart();
    parts.push(`${labels[label[1]!]}${value.replace(/;\s*/gu, "、")}。`);
  }
  return parts.length ? [parts.join(""), rest].filter(Boolean).join(" ") : text;
}

/** Every `relationshipContext` string inside a response body, localized; other values untouched. */
export function localizeRelationshipContextFields<T>(value: T, language: string | null | undefined): T {
  if (language !== "zh" && language !== "ja") return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([key, item]) =>
      [key, key === "relationshipContext" && typeof item === "string" ? localizeRelationshipContext(item, language) : walk(item)]));
  };
  return walk(value) as T;
}

/** The reader's language for a route: the App's `x-orbit-lang`, else the web's `orbit-lang` cookie. */
export function relationshipContextLanguage(request: Request): string | null {
  return request.headers.get("x-orbit-lang") ?? /(?:^|;\s*)orbit-lang=([a-z]{2})/u.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
}
