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
        style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}
      >
        <AccountTopNav active="settings" />
        <div style={{ margin: "0 auto", maxWidth: 760, padding: "32px 24px 96px" }}>
          <OrbitSettingsContent />
        </div>
      </main>
    </>
  );
}
