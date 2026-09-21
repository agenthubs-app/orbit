import { AccountTopNav } from "../orbit-account-shell";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { loadProfileEditorPage } from "../profile/profile-0918/load-profile-editor-page";
import { ProfileScreens } from "../profile/profile-0918/profile-screens";

export const dynamic = "force-dynamic";

// iOrbit 设置与个人资料同壳同页签（Orbit_0918 个人中心）；既有五个设置模块经 ProfileLegacySettings 挂载。
export default async function AppSettingsPage() {
  const page = await loadProfileEditorPage("/app/settings");

  if (page.ok === false) {
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        {page.boundary}
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-real-page="profile-0918" data-orbit-route="app-settings-route">
        <AccountTopNav active="settings" />
        <ProfileScreens view="settings" viewModel={page.viewModel} />
      </div>
    </>
  );
}
