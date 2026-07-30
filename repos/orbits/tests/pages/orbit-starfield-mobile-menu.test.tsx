import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OrbitStarfieldMobile } from "../../app/(app)/app/orbit-starfield-mobile";
import { bindStarfieldMobileMenu } from "../../app/(app)/app/orbit-starfield-mobile-menu";

class FakeElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly links: FakeElement[] = [];
  readonly style = { display: "" };
  focusCount = 0;
  hidden = false;

  contains(target: EventTarget | null): boolean {
    return target === this || this.links.includes(target as FakeElement);
  }

  focus(): void {
    this.focusCount += 1;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return selector === "a[href]" ? this.links : [];
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeHost extends FakeElement {
  constructor(
    private readonly button: FakeElement,
    private readonly navigation: FakeElement,
  ) {
    super();
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "#skBurger") return this.button;
    if (selector === "#skMenu") return this.navigation;
    return null;
  }
}

function click(target: EventTarget): void {
  target.dispatchEvent(new Event("click", { bubbles: true }));
}

function keydown(target: EventTarget, key: string): Event {
  const event = new Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "key", { value: key });
  target.dispatchEvent(event);
  return event;
}

function menuHarness() {
  const button = new FakeElement();
  const navigation = new FakeElement();
  const firstLink = new FakeElement();
  navigation.links.push(firstLink);
  const host = new FakeHost(button, navigation);
  const documentTarget = new EventTarget();
  const cleanup = bindStarfieldMobileMenu(
    host as unknown as HTMLElement,
    documentTarget as unknown as Document,
  );

  return {
    button,
    cleanup,
    documentTarget,
    firstLink,
    navigation,
  };
}

test("mobile starfield renders a named, initially hidden navigation disclosure", () => {
  const html = renderToStaticMarkup(
    <OrbitStarfieldMobile active={false} authenticated={false} />,
  );

  assert.match(
    html,
    /<button id="skBurger"[^>]*aria-controls="skMenu"[^>]*aria-expanded="false"/,
  );
  assert.match(
    html,
    /<nav id="skMenu" aria-label="移动端导航 \/ Mobile navigation" hidden=""/,
  );
});

test("mobile menu keeps disclosure state, visibility, and hidden focusability in sync", () => {
  const { button, cleanup, navigation } = menuHarness();

  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(navigation.hidden, true);
  assert.equal(navigation.style.display, "none");
  assert.equal(navigation.getAttribute("inert"), "");

  click(button);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(navigation.hidden, false);
  assert.equal(navigation.style.display, "flex");
  assert.equal(navigation.getAttribute("inert"), null);

  click(button);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(navigation.hidden, true);
  assert.equal(navigation.getAttribute("inert"), "");

  cleanup();
});

test("Escape dismisses the open mobile menu and returns focus to its button", () => {
  const { button, cleanup, documentTarget, navigation } = menuHarness();

  click(button);
  const escape = keydown(documentTarget, "Escape");

  assert.equal(escape.defaultPrevented, true);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(navigation.hidden, true);
  assert.equal(button.focusCount, 1);

  cleanup();
});

test("outside and navigation-link clicks dismiss without stealing focus", () => {
  const {
    button,
    cleanup,
    documentTarget,
    firstLink,
    navigation,
  } = menuHarness();

  click(button);
  click(documentTarget);
  assert.equal(navigation.hidden, true);
  assert.equal(button.focusCount, 0);

  click(button);
  click(firstLink);
  assert.equal(navigation.hidden, true);
  assert.equal(button.focusCount, 0);

  cleanup();
});

test("cleanup removes disclosure listeners", () => {
  const { button, cleanup, documentTarget, navigation } = menuHarness();

  cleanup();
  click(button);
  keydown(documentTarget, "Escape");

  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(navigation.hidden, true);
  assert.equal(button.focusCount, 0);
});
