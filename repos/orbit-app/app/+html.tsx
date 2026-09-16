import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const responsiveRoot = `
html, body, #root {
  margin: 0;
  min-height: 100%;
  width: 100%;
}

#root {
  display: flex;
  flex-direction: column;
  height: 100%;
}

@supports (height: 100dvh) {
  html, body, #root {
    height: 100dvh;
    min-height: 100dvh;
  }
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
          name="viewport"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveRoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
