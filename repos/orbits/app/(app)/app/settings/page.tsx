import { AccountTopNav } from "../orbit-account-shell";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitSettingsContent } from "./orbit-settings-content";

export const dynamic = "force-dynamic";

export default function AppSettingsPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <main
        data-orbit-real-page="settings"
        style={{ minHeight: "100dvh" }}
      >
        <AccountTopNav active="settings" />
        <div style={{ margin: "0 auto", maxWidth: 760, padding: "32px 24px 96px" }}>
          <OrbitSettingsContent />
        </div>
        <style>{`
          /* Orbit_0918 批次 2b：设置页整体换肤。变量在页作用域内重定义，
             五个设置模块零改动继承 0918 靛蓝体系（沿用批次 3d 的无引号选择器约定）。 */
          [data-orbit-real-page=settings]{
            color-scheme:light;
            --ink:#0E1225;--text:#0E1225;--text-2:#3B3F7A;--text-3:#6B6F99;--text-4:#9FA3C4;
            --bg:#FBFBFE;--bg-soft:#F7F7FD;--bg-sunken:#F1F1FA;
            --surface:#FFFFFF;--surface-2:#F7F7FD;--surface-3:#ECEEFB;
            --border:#E8E9F6;--border-2:#DDDEFA;--border-strong:#B9BCEB;--hairline:#F1F1FA;
            --accent:#4B4FC7;--accent-hover:#2E3270;--accent-soft:#ECEEFB;--accent-ring:#B9BCEB;
            --on-accent:#FFFFFF;
            background:#FBFBFE;color:#0E1225;
          }
          [data-orbit-real-page=settings] .eyebrow{color:#6B6F99}
          [data-orbit-real-page=settings] .settings-head h1{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;letter-spacing:-0.02em;color:#0E1225}
          [data-orbit-real-page=settings] .card{background:#FFFFFF;border:1px solid #E8E9F6;border-radius:18px;box-shadow:none}
          [data-orbit-real-page=settings] .card h2{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;letter-spacing:-0.02em}
          [data-orbit-real-page=settings] .btn-primary{background:#0E1225;border-color:#0E1225;box-shadow:none;color:#FFFFFF}
          [data-orbit-real-page=settings] .btn-primary:hover{background:#2E3270;border-color:#2E3270}
          [data-orbit-real-page=settings] .btn-ghost{background:#FFFFFF;border-color:#DDDEFA;color:#3B3F7A}
          [data-orbit-real-page=settings] .btn-ghost:hover{border-color:#B9BCEB;color:#2E3270}
          [data-orbit-real-page=settings] .chip{border-color:#DDDEFA;color:#3B3F7A;background:#FFFFFF}
        `}</style>
      </main>
    </>
  );
}
