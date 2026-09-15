"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="orbit-agent-markdown" style={{ marginBottom: -6 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" style={{ color: "var(--accent)" }} target="_blank">{children}</a>
          ),
          code: ({ children }) => (
            <code className="mono" style={{ background: "var(--surface-2)", borderRadius: "var(--r-xs)", fontSize: 13, padding: "1px 5px" }}>{children}</code>
          ),
          li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
          ol: ({ children }) => <ol style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ol>,
          p: ({ children }) => <p style={{ margin: "0 0 6px" }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          ul: ({ children }) => <ul style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ul>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
