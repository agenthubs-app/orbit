import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ContextType } from "react";
import { SessionContext } from "next-auth/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { OrbitTopNav } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("proxy protects personal routes with the same NextAuth session used by the UI", () => {
  const proxySource = source("proxy.ts");

  assert.match(proxySource, /export const proxy = auth/);
  assert.match(proxySource, /isOrbitPrivateAppPath/);
  assert.match(proxySource, /request\.auth\?\.user\?\.id/);
  assert.match(proxySource, /\/app\/account\/login/);
});

test("settings is a protected personal route", () => {
  const routingSource = source("features/auth/app-auth-routing.ts");
  assert.match(routingSource, /"\/app\/settings"/);
});

test("/app layout injects the server session and the shared nav reads it without refetching", () => {
  const layoutSource = source("app/(app)/app/layout.tsx");
  const navSource = source("app/(app)/app/orbit-public-shell.tsx");

  assert.match(layoutSource, /const session = await auth\(\)/);
  assert.match(layoutSource, /<SessionProvider[^>]*session=\{session\}/);
  assert.match(navSource, /useContext\(SessionContext\)/);
  assert.match(navSource, /status: "unauthenticated"/);
  assert.doesNotMatch(navSource, /useSession\(\)/);
  assert.doesNotMatch(navSource, /fetch\("\/api\/auth\/session"\)/);
});

test("starfield homepage uses account signup for guests and the personal home for members", () => {
  const homeSource = source("app/(app)/app/orbit-starfield-home.tsx");
  const desktopSource = source("app/(app)/app/orbit-starfield-desktop.tsx");
  const mobileSource = source("app/(app)/app/orbit-starfield-mobile.tsx");

  assert.match(homeSource, /authenticated=\{authenticated\}/);
  for (const starfieldSource of [desktopSource, mobileSource]) {
    assert.match(starfieldSource, /authenticated \? "\/app\/home"/);
    assert.match(starfieldSource, /\/app\/account\/signup\?next=%2Fapp%2Fhome/);
    assert.doesNotMatch(starfieldSource, /href="\/app\/register"/);
    assert.match(starfieldSource, /enterStarfield/);
  }
});

test("mobile navigation follows session transitions and closes with Escape", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const listeners = new Set<(event: { key: string }) => void>();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: (event: { key: string }) => void) => {
        if (type === "keydown") listeners.add(listener);
      },
      removeEventListener: (type: string, listener: (event: { key: string }) => void) => {
        if (type === "keydown") listeners.delete(listener);
      },
    },
  });
  type NavSession = Exclude<ContextType<typeof SessionContext>, undefined>;
  const signedIn: NavSession = {
    data: { user: { id: "nav-test-user", name: "Nav tester", email: "nav@example.test" }, expires: "2099-01-01" },
    status: "authenticated", update: async () => null,
  };
  const signedOut: NavSession = { data: null, status: "unauthenticated", update: async () => null };
  const loading: NavSession = { data: null, status: "loading", update: async () => null };
  const tree = (session: NavSession) => createElement(SessionContext.Provider, { value: session },
    createElement(OrbitTopNav, { active: "settings", meHref: "/app/profile", authenticatedFallback: true }));
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(tree(signedIn)); });
    const menuButton = () => renderer.root.findByProps({ className: "orbit-nav-menu-btn hit-44" });
    assert.equal(menuButton().props["aria-expanded"], false);
    await act(async () => menuButton().props.onClick());
    const panel = () => renderer.root.findByProps({ className: "orbit-nav-menu-panel" });
    const hrefs = () => panel().findAllByType("a").map((link) => link.props.href as string);
    assert.ok(hrefs().includes("/app/profile"));
    assert.ok(hrefs().includes("/app/settings"));
    assert.equal(panel().findByProps({ href: "/app/settings" }).props["aria-current"], "page");
    assert.equal(hrefs().some((href) => href.includes("/account/")), false);

    // A real provider remains authoritative even when a stale SSR fallback says signed in.
    await act(async () => renderer.update(tree(signedOut)));
    assert.equal(hrefs().includes("/app/profile"), false);
    assert.equal(hrefs().includes("/app/settings"), false);
    for (const route of ["login", "signup"]) {
      const href = hrefs().find((href) => href.startsWith(`/app/account/${route}?`));
      assert.ok(href);
      assert.equal(new URL(href, "https://orbit.example").searchParams.get("next"), "/app");
    }

    await act(async () => renderer.update(tree(loading)));
    assert.equal(panel().findByProps({ role: "status" }).children.join(""), "正在确认登录状态…");
    assert.equal(hrefs().some((href) => href.includes("/account/") || href === "/app/settings"), false);
    await act(async () => renderer.update(tree(signedIn)));
    assert.ok(hrefs().includes("/app/settings"));
    await act(async () => { for (const listener of listeners) listener({ key: "Escape" }); });
    assert.equal(menuButton().props["aria-expanded"], false);
    assert.equal(renderer.root.findAllByProps({ className: "orbit-nav-menu-panel" }).length, 0);
    assert.equal(listeners.size, 0);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("all home-page sign-out controls clear the NextAuth session", () => {
  const homeSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.equal((homeSource.match(/signOut\(\{ callbackUrl: "\/app" \}\)/g) ?? []).length, 2);
  assert.doesNotMatch(homeSource, /onClick=\{\(\) => orbitNavigate\("\/"\)\}/);
});
