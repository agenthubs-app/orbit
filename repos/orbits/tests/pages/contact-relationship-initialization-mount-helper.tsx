import { type TestContext } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";

export async function mountOrbitRealCardConnection(
  t: TestContext,
  options: {
    contactId: string;
    language: "zh" | "en";
    viewModel: OrbitContactsViewModel;
    fetcher: typeof fetch;
  },
): Promise<ReactTestRenderer> {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement: null,
      documentElement: { lang: "" },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://localhost/app/contacts/one" },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  t.mock.method(globalThis, "fetch", async (input, init) => {
    // The detail shell also mounts account/inbox readers. Keep those incidental
    // reads local and let the caller own the relationship readback assertion.
    if (String(input).endsWith("/relationship-initialization")) return options.fetcher(input, init);
    return new Response(null, { status: 404 });
  });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(createElement(
      OrbitLanguageProvider,
      {
        initialLanguage: options.language,
        children: createElement(OrbitRealCardConnection, {
          contactId: options.contactId,
          viewModel: options.viewModel,
        }),
      },
    ));
  });
  t.after(() => {
    act(() => root.unmount());
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return root;
}

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : textContent(child)).join("");
}

export function relationshipProgressLinkLabels(root: ReactTestRenderer): string[] {
  return root.root
    .findAll((node) => node.type === "a" && node.props.href === "/app/contacts/pipeline")
    .map(textContent);
}
