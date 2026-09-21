"use client";

import { useState } from "react";

export function OrbitCopyDraftButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <button
      className="btn btn-quiet"
      onClick={() => void copy()}
      type="button"
    >
      {copied ? "已复制" : "复制草稿"}
    </button>
  );
}
