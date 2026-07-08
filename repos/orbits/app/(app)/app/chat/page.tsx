/**
 * Chat 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 async correspondence view model 转给页面组件。
 */
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppAsyncChatCommandCenterViewModel,
  type AppChatSearchParams,
} from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { ChatCommandCenter } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-command-center";

export default async function AppChatPage({
  searchParams,
}: {
  searchParams?: Promise<AppChatSearchParams>;
} = {}) {
  const viewModel = await loadAppAsyncChatCommandCenterViewModel(
    await searchParams,
  );

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-route="app-chat-route">
        <ChatCommandCenter model={viewModel} />
      </div>
    </>
  );
}
