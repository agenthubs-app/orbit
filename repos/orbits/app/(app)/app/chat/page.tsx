/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
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
      description="Chat will help summarize conversation context after messages have consent and source records."
      emptyState="No transcript, consent marker, summary, or extracted relationship clue is loaded."
      evidence={[
        "No chat transcript is loaded.",
        "Writing help is not connected.",
      ]}
      eyebrow="Chat"
      guardrail="Chat can reserve the review space, but it cannot summarize private messages."
      nextStep="Connect approved conversation evidence before asking for a summary."
      purpose="Summarize conversations only from approved evidence."
      title="Chat"
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
