/**
 * 运营台子页的门禁 / 服务不可用边界页（任务 7：从 admission / check-in / experience 三个 page.tsx 抽成一份）。
 * 结构与文案口径不变：PublicTopNav + eyebrow + h-display 标题 + 说明 + 「重试」（回本页）/ 「返回运营活动中心」。
 * `page` = 各页既有的 `data-orbit-real-page` 标记（测试与审计按此定位），三页各自保留原值。
 */
import { PublicTopNav } from "../../orbit-public-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";

export function OpsBoundary({
  description,
  eyebrow,
  page,
  retryHref,
  title,
}: {
  description: string;
  eyebrow: string;
  page: string;
  retryHref: string;
  title: string;
}) {
  return (
    <>
      <OrbitReferenceStyles />
      <PublicTopNav active="events" />
      <main data-orbit-real-page={page} style={{ margin: "0 auto", maxWidth: 760, padding: 40 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="h-display">{title}</h1>
        <p style={{ color: "var(--text-2)" }}>{description}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a className="btn btn-primary" href={retryHref}>重试</a>
          <a className="btn btn-ghost" href="/app/events/center">返回运营活动中心</a>
        </div>
      </main>
    </>
  );
}
