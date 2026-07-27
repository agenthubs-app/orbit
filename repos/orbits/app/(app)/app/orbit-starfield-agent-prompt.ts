import { agentHrefForPrompt } from "./orbit-product-href";

export interface StarfieldPromptPreview {
  defaultPrompt: string;
  fallbackPlaceholder: string;
  progress: number;
  visible: boolean;
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
  const chips = Array.from(
    host.querySelectorAll<HTMLButtonElement>(".sk-chip"),
  );

  if (!input || !submitButton) {
    return () => undefined;
  }

  const submit = (candidate: string) => {
    const prompt = candidate.trim() || getDefaultPrompt().trim();

    if (prompt) {
      window.location.assign(agentHrefForPrompt(prompt));
    }
  };
  const submitInput = () => submit(input.value);
  const onInputKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      submitInput();
    }
  };
  const chipHandlers = chips.map((chip) => {
    const handler = () => submit(chip.textContent ?? "");
    chip.addEventListener("click", handler);
    return { chip, handler };
  });

  input.addEventListener("keydown", onInputKeyDown);
  submitButton.addEventListener("click", submitInput);

  return () => {
    input.removeEventListener("keydown", onInputKeyDown);
    submitButton.removeEventListener("click", submitInput);
    chipHandlers.forEach(({ chip, handler }) =>
      chip.removeEventListener("click", handler),
    );
  };
}
