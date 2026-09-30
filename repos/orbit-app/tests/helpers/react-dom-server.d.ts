// The App has no @types/react-dom. Typecheck only needs the one server
// renderer the static render helper uses (reached from .ts tests since 8b57aac7b).
declare module "react-dom/server" {
  import type { ReactElement } from "react";
  export function renderToStaticMarkup(element: ReactElement): string;
}
