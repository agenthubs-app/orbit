import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { resolveRequestOrbitLanguage } from "../../../(app)/app/orbit-language-core";
import { isCellId } from "../cell-ids";
import { ComponentCell } from "../cells";

const LEGACY_CSS = "/orbit-reference/orbit-reference.generated.css";

export const metadata = { title: "Component cell · Orbit showcase", robots: { index: false } };

// R31b（U02）：一个 01-system 规格格一个小节 /showcase/components/<小节 id>-<格>，画在 (0, 0)、整数坐标、固定宽度，
// 供 compare-redesign.mjs --section / --cell 逐件对照。?theme=light|dark 固定主题；?env=legacy 加载旧页面的
// 全局样式（旧页面都会加载的 /orbit-reference/orbit-reference.generated.css：未加作用域的 .btn 等；OrbitReferenceStyles
// 里另外内联的规则都限定在 [data-orbit-real-page] 里，碰不到新作用域），对照新组件在「旧页面 + 新壳」里是否被带歪（SC-R31b-03）。
export default async function ComponentCellPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ lang?: string; theme?: string; env?: string }> }) {
  const { section } = await params;
  if (!isCellId(section)) notFound();
  const { lang, theme, env } = await searchParams;
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const language = resolveRequestOrbitLanguage({
    header: lang ?? requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return (
    <>
      {env === "legacy" ? <link href={LEGACY_CSS} rel="stylesheet" /> : null}
      <ComponentCell id={section} language={language} theme={theme === "dark" ? "dark" : theme === "light" ? "light" : null} />
    </>
  );
}
