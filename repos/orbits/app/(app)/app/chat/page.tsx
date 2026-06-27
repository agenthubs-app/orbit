/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
import { AppChatCommandCenter } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-command-center";

export const metadata = {
  title: "Private reply review | Orbit",
  description:
    "Review one relationship conversation, confirm privacy posture, and stage the next local reply in Orbit.",
};

type AppChatSearchParams = Record<string, string | string[] | undefined>;

interface ChatPageProps {
  searchParams?: AppChatSearchParams | Promise<AppChatSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function renderChatPage(searchParams: AppChatSearchParams | undefined) {
  return <AppChatCommandCenter searchParams={searchParams} />;
}

function LegacyChatStateBoundary() {
  return (
    <StateView
      description={bilingualText(
        "在消息具备同意和来源记录后，对话页会帮助总结对话上下文。",
        "Chat will help summarize conversation context after messages have consent and source records.",
      )}
      emptyState={bilingualText(
        "还没有加载转写、同意标记、摘要或提取出的关系线索。",
        "No transcript, consent marker, summary, or extracted relationship clue is loaded.",
      )}
      evidence={[
        bilingualText("还没有加载对话转写。", "No chat transcript is loaded."),
        bilingualText("写作辅助尚未连接。", "Writing help is not connected."),
      ]}
      eyebrow={bilingualText("对话", "Chat")}
      guardrail={bilingualText(
        "对话页可以预留复核空间，但不能总结私人消息。",
        "Chat can reserve the review space, but it cannot summarize private messages.",
      )}
      nextStep={bilingualText(
        "请求摘要前，先连接已批准的对话证据。",
        "Connect approved conversation evidence before asking for a summary.",
      )}
      purpose={bilingualText(
        "只根据已批准的证据总结对话。",
        "Summarize conversations only from approved evidence.",
      )}
      title={bilingualText("对话", "Chat")}
    />
  );
}

export default function ChatPage({ searchParams }: ChatPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyChatStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderChatPage(resolvedSearchParams),
    );
  }

  return renderChatPage(searchParams);
}
