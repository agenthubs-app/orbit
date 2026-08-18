import { agentHrefForPrompt } from "./orbit-product-href";

export interface StarfieldPromptPreview {
  defaultPrompt: string;
  fallbackPlaceholder: string;
  progress: number;
  visible: boolean;
}

function promptNodes(host: HTMLElement) {
  return {
    input: host.querySelector<HTMLInputElement>("#skPromptInput"),
    scope: host.querySelector<HTMLElement>("#skPromptScope"),
  };
}

export function updateStarfieldPromptScope(host: HTMLElement): void {
  const { input, scope } = promptNodes(host);
  if (!input || !scope) return;

  const language = host.getAttribute("data-lang") === "en" ? "en" : "zh";
  scope.textContent = input.value.trim()
    ? language === "zh"
      ? "将读取你已授权的人脉、活动与跟进记录；点击发送后才开始，不会自动发送消息或写入日历。"
      : "Uses only contacts, events, and follow-ups you authorized. Nothing starts until you send; no messages or calendar writes happen automatically."
    : language === "zh"
      ? "示例只会填入输入框，不会自动执行。"
      : "Examples only fill the input. They never run automatically.";
}

export function fillStarfieldPromptFromExample(host: HTMLElement, candidate: string): void {
  const { input } = promptNodes(host);
  if (!input) return;

  input.value = candidate.trim();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  updateStarfieldPromptScope(host);
  input.focus();
}

export function submitStarfieldPrompt(host: HTMLElement): void {
  const { input } = promptNodes(host);
  if (!input) return;

  const language = host.getAttribute("data-lang") === "en" ? "en" : "zh";
  const fallback = language === "en"
    ? "Who are the three people I should contact now?"
    : "现在最值得联系的 3 位是谁？";
  window.location.assign(agentHrefForPrompt(input.value.trim() || fallback));
}

export function updateStarfieldPromptPreview(
  input: HTMLInputElement | null,
  preview: StarfieldPromptPreview,
): void {
  if (!input || input.value || input.ownerDocument.activeElement === input) {
    return;
  }

  const length = Math.round(
    Math.min(1, Math.max(0, preview.progress)) * preview.defaultPrompt.length,
  );
  const animatedPrompt = preview.visible
    ? preview.defaultPrompt.slice(0, length)
    : "";

  input.placeholder = animatedPrompt || preview.fallbackPlaceholder;
}

export function bindStarfieldAgentPrompt(
  host: HTMLElement,
  getDefaultPrompt: () => string,
): () => void {
  const input = host.querySelector<HTMLInputElement>("#skPromptInput");
  const submitButton = host.querySelector<HTMLButtonElement>("#skEnter");

  if (!input || !submitButton) {
    return () => undefined;
  }

  const submit = (candidate: string) => {
    const prompt = candidate.trim() || getDefaultPrompt().trim();

    if (prompt) {
      window.location.assign(agentHrefForPrompt(prompt));
    }
  };
  const submitInput = () => {
    const currentInput = host.querySelector<HTMLInputElement>("#skPromptInput");
    submit(currentInput?.value ?? "");
  };
  const fillFromExample = (candidate: string) => {
    fillStarfieldPromptFromExample(host, candidate);
  };
  const onHostKeyDown = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.id !== "skPromptInput") return;
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      submitInput();
    }
  };
  const onHostInput = (event: Event) => {
    if (event.target instanceof HTMLInputElement && event.target.id === "skPromptInput") {
      updateStarfieldPromptScope(host);
    }
  };
  const onHostClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const chip = event.target.closest<HTMLButtonElement>(".sk-chip");
    if (chip && host.contains(chip)) {
      fillFromExample(chip.textContent ?? "");
      return;
    }
    const submitTarget = event.target.closest<HTMLButtonElement>("#skEnter");
    if (submitTarget && host.contains(submitTarget)) submitInput();
  };

  host.addEventListener("keydown", onHostKeyDown);
  host.addEventListener("input", onHostInput);
  host.addEventListener("click", onHostClick);

  return () => {
    host.removeEventListener("keydown", onHostKeyDown);
    host.removeEventListener("input", onHostInput);
    host.removeEventListener("click", onHostClick);
  };
}
