# UI 基准恢复（导航统一 + 四项丢失回归）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ui/orbit-html-reference-replacement` 基准中被 chat-agent 丢失的能力恢复回来：桌面顶部导航恢复与星空首页一致的 3 段式骨架、移动端汉堡菜单、`<html lang>` 语言同步、`OrbitResponsiveA11y` 与桌面字体管线、admin/register 封面图；同时修复 `productHref` 双实现分裂、MobileBar 硬编码浅色、Today/All actions 移动端布局与失效的 smoke 测试。

**Architecture:** 关键事实（2026-07-25 调查确认）：三次导航统一提交的 **CSS 全部健在**（`orbit-reference-styles.tsx:802-886, 1971-1996, 2043-2119`），回归全在 `OrbitTopNav` 的 JSX——当前是 5 个 flex 子节点（品牌/agent 胶囊/links/spacer/actions），统一 CSS 假设的是 3 段式（`.orbit-nav-lead` / `.orbit-nav-links` 含 iOrbit / `.orbit-top-actions`）+ `justify-content:space-between`。恢复 = 重建 JSX 骨架并把新功能（Today 链接、会话账号控件、收件箱入口、三语切换）安放进骨架内。

**Tech Stack:** Next.js 16、TypeScript、`node --test` + tsx。新增文案继续走中文纯字符串 + `localizeOrbitTree`。

## Global Constraints

- **保留全部新功能**：Today 导航项、`OrbitNavAccountControl`（会话头像/登录注册）、`RelationshipInboxTrigger`（经 `rightExtra`）、中/EN/日三语、主题系统（`themeInitScript`、`OrbitThemeStyles/Toggle`）。恢复的是布局骨架与丢失行为，不是回滚功能。
- **iOrbit 命名与 `/app/agent` 界面不动。**
- `links` 数组（`const links = [` … `] as const;`）的**形状与内容不得改变**——`tests/ui/orbit-top-nav-links.test.ts` 靠源码解析它，期望恰好 `["/today","/events","/schedule","/contacts"]`。iOrbit 像 ui 基准那样作为 `.orbit-nav-links` 里第一个字面量 `<a>`，不进数组。
- 恢复的 DOM 必须使用**既有 CSS 类**（`.orbit-nav-lead`、`.orbit-brand-word`、`.orbit-nav-page-title`、`.orbit-lang-toggle`、`.orbit-nav-iorbit-icon`、`.orbit-nav-menu-btn/-layer/-scrim/-panel/-item`、`.orbit-top-actions`），不得新写平行样式；`.orbit-top-actions` 上的内联 flex 样式必须删除（CSS 类已提供）。
- `<html lang>` 三语映射：`en→"en"`、`ja→"ja"`、其余（zh）→`"zh-CN"`。
- 每个任务提交前 `(cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit)`；commit 尾注 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 工作目录 `/Users/li/work/orbit/repos/orbits`，分支 `chat-agent` 上新建 `ui-baseline-restoration` 执行。
- 全套件基线：**946 测试 / 65 失败**（Task 7 修 smoke 后应降为 64）。不得新增失败。
- dev server 已在 3000 端口运行时不要自行起停（由控制器管理）。

---

## File Structure

```
app/(app)/app/orbit-product-href.ts        # [modify] 收编 shell 版语义，成为唯一实现
app/(app)/app/orbit-public-shell.tsx       # [modify] 重建 3 段式导航 + 汉堡；productHref 改 re-export
app/(app)/app/orbit-language-core.ts       # [modify] 新增 orbitHtmlLang()
app/layout.tsx                             # [modify] async 语言解析 + <html lang>
app/(app)/app/orbit-language-context.tsx   # [modify] lang 同步 useEffect
app/(app)/app/layout.tsx                   # [modify] 挂回 OrbitResponsiveA11y + 桌面字体 link
app/(app)/app/admin/orbit-real-admin.tsx   # [modify] 恢复封面图（2 处）
app/(app)/app/register/orbit-real-register.tsx  # [modify] 恢复封面图（2 处）
app/(app)/app/orbit-account-shell.tsx      # [modify] MobileBar 主题 token 化
app/(app)/app/today/page.tsx               # [modify] 移动端单列
app/(app)/app/contacts/all-actions/page.tsx # [modify] 移动端单列
tests/smoke.test.tsx                       # [modify] 断言现实（星空首页）
tests/ui/orbit-product-href.test.ts        # 新增
tests/ui/orbit-top-nav-structure.test.ts   # 新增
tests/ui/orbit-html-lang.test.ts           # 新增
tests/ui/orbit-a11y-runtime-mounted.test.ts # 新增
tests/pages/orbit-cover-photo-usage.test.ts # 新增
package.json                               # [modify] lint 列表追加
```

---

### Task 1: `productHref` 单一实现

**Files:**
- Modify: `app/(app)/app/orbit-product-href.ts`
- Modify: `app/(app)/app/orbit-public-shell.tsx`（删本地定义，改 re-export）
- Test: `tests/ui/orbit-product-href.test.ts`

**Interfaces:**
- Produces: `orbit-product-href.ts` 导出唯一的 `productHref`；`orbit-public-shell.tsx` 含 `export { productHref } from "./orbit-product-href";`。语义以 shell 版为准（`"/"→"/"`、`/app*` 原样透传），这是被导航/品牌链接实际依赖的行为。

**已核实的分歧（不要重新推导）：** shell 版比共享版多 `/app*` 透传分支，且 `"/"` 返回 `"/"`（共享版返回 `"/app"`）。其余映射两版完全相同。

- [ ] **Step 1: 枚举共享版调用方的字面量入参**

Run: `grep -rn "productHref(" app --include="*.tsx" --include="*.ts" | grep -v "orbit-product-href\|orbit-public-shell\|function productHref" | head -30`
确认没有调用方以字面量 `"/"` 调用共享版（`accountHref` 里 `"/home"` 等前缀映射不受影响）。若发现有 `"/"` 字面量调用共享版的场景，停下报 BLOCKED。

- [ ] **Step 2: Write the failing test**

创建 `tests/ui/orbit-product-href.test.ts`：

```ts
/**
 * productHref 单一实现测试。
 *
 * 历史上 shell 内联版与共享模块版语义分裂（"/" 与 /app* 透传）。
 * 本测试锁定统一后的语义，并确认 shell 只 re-export 不再自带实现。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { productHref } from "../../app/(app)/app/orbit-product-href";
import { productHref as shellProductHref } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("app-prefixed hrefs pass through untouched", () => {
  assert.equal(productHref("/app"), "/app");
  assert.equal(productHref("/app/agent"), "/app/agent");
  assert.equal(productHref("/app?x=1"), "/app?x=1");
});

test("root stays root (the starfield home lives at /)", () => {
  assert.equal(productHref("/"), "/");
});

test("prototype mappings survive the unification", () => {
  assert.equal(productHref("/explore"), "/app/events");
  assert.equal(productHref("/home/cards"), "/app/contacts");
  assert.equal(productHref("/home/schedule"), "/app/followups");
  assert.equal(productHref("/today"), "/app/today");
});

test("the shell re-exports the shared implementation", () => {
  assert.equal(shellProductHref, productHref);
  const shellSource = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
    "utf8",
  );
  assert.ok(shellSource.includes('export { productHref } from "./orbit-product-href"'));
  assert.ok(!/export function productHref/.test(shellSource));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --import tsx tests/ui/orbit-product-href.test.ts`
Expected: FAIL——`productHref("/")` 得 `"/app"`、`shellProductHref !== productHref`。

- [ ] **Step 4: Unify**

把 `orbit-product-href.ts` 的函数体替换为 shell 当前版本的完整逻辑（含 `/app*` 透传与 `"/"→"/"`，其余映射保持）；在 `orbit-public-shell.tsx` 删除本地 `export function productHref` 全函数，在其位置加：

```ts
export { productHref } from "./orbit-product-href";
import { productHref } from "./orbit-product-href";
```

（re-export 供外部消费者，import 供本文件内部使用。）

- [ ] **Step 5: Run tests**

Run: `node --test --import tsx tests/ui/orbit-product-href.test.ts tests/ui/orbit-top-nav-links.test.ts`
Expected: 全部 PASS（导航死链闸门必须继续绿）。

- [ ] **Step 6: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/orbit-product-href.ts" "app/(app)/app/orbit-public-shell.tsx" tests/ui/orbit-product-href.test.ts
git commit -m "fix(nav): unify productHref into the shared server-safe module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 导航 3 段式骨架恢复 + 移动端汉堡菜单

**Files:**
- Modify: `app/(app)/app/orbit-public-shell.tsx`（重写 `OrbitTopNav` 的 JSX；`OrbitNavAccountControl`、`PublicTopNav` 等其余不动）
- Test: `tests/ui/orbit-top-nav-structure.test.ts`

**Interfaces:**
- Consumes: 既有 CSS 类（见 Global Constraints）、Task 1 的 `productHref`、`OrbitNavAccountControl`、`useOrbitLanguage`。
- Produces: 桌面端 3 段式（`.orbit-nav-lead` / `.orbit-nav-links` / `.orbit-top-actions`）；移动端（≤640px，由既有 CSS 控制显隐）品牌+页面标题 + iOrbit 图标 + 语言切换 + 汉堡按钮 + 全屏菜单。`links` 数组原样保留。

- [ ] **Step 1: Write the failing test**

创建 `tests/ui/orbit-top-nav-structure.test.ts`：

```ts
/**
 * 顶部导航结构测试：3 段式骨架 + 移动端汉堡（ui 基准布局统一的回归闸门）。
 *
 * CSS（orbit-reference-styles）一直健在；丢的是 DOM 结构。本测试锁定 DOM 端。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const shell = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
  "utf8",
);

test("the nav renders the unified three-segment skeleton", () => {
  assert.ok(shell.includes('"orbit-top-nav orbit-nav-menu"'), "orbit-nav-menu class");
  assert.ok(shell.includes("orbit-nav-lead"), "brand segment");
  assert.ok(shell.includes("orbit-brand-word"), "visible brand word");
  assert.ok(shell.includes("orbit-nav-page-title"), "mobile page title");
});

test("the agent pill and the flex spacer are gone", () => {
  assert.ok(!shell.includes("orbit-agent-btn"));
  assert.ok(!shell.includes('<div style={{ flex: 1 }} />'));
});

test("iOrbit is the first nav link, outside the links array", () => {
  const navsStart = shell.indexOf('className="orbit-nav-links"');
  const mapStart = shell.indexOf("links.map", navsStart);
  const between = shell.slice(navsStart, mapStart);
  assert.ok(between.includes("iOrbit"), "iOrbit literal link precedes links.map");
});

test("top actions rely on the CSS class, not inline flex styles", () => {
  const actionsIdx = shell.indexOf('className="orbit-top-actions"');
  assert.ok(actionsIdx > 0);
  const snippet = shell.slice(actionsIdx, actionsIdx + 120);
  assert.ok(!snippet.includes("style={{"), "no inline style on .orbit-top-actions");
});

test("the language toggle uses discrete buttons in .orbit-lang-toggle", () => {
  assert.ok(shell.includes("orbit-lang-toggle"));
  assert.ok(!shell.includes("orbit-lang-button"), "cycling button retired");
});

test("the mobile hamburger and menu layer are back, with Today in the menu", () => {
  for (const cls of [
    "orbit-nav-iorbit-icon",
    "orbit-nav-menu-btn",
    "orbit-nav-menu-layer",
    "orbit-nav-menu-scrim",
    "orbit-nav-menu-panel",
    "orbit-nav-menu-item",
  ]) {
    assert.ok(shell.includes(cls), cls);
  }
  const menuIdx = shell.indexOf("const menuItems");
  const menuBlock = shell.slice(menuIdx, shell.indexOf("];", menuIdx));
  assert.ok(menuBlock.includes('"today"'), "Today present in the mobile menu");
  assert.ok(menuBlock.includes('"me"'), "Me present in the mobile menu");
});

test("session account control and inbox extras stay in the actions segment", () => {
  const actionsIdx = shell.indexOf('className="orbit-top-actions"');
  const headerEnd = shell.indexOf("</header>", actionsIdx);
  const actions = shell.slice(actionsIdx, headerEnd);
  assert.ok(actions.includes("OrbitNavAccountControl"));
  assert.ok(actions.includes("{rightExtra}"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/ui/orbit-top-nav-structure.test.ts`
Expected: FAIL（多项断言）。

- [ ] **Step 3: Rewrite `OrbitTopNav`**

把 `OrbitTopNav` 组件整体替换为（文件顶部 import 需含 `useEffect, useState`——已有）：

```tsx
export function OrbitTopNav({
  active = "events",
  agentActive,
  meHref,
  rightExtra,
}: {
  active?: OrbitNavActive;
  agentActive?: boolean;
  meHref: string;
  rightExtra?: ReactNode;
}) {
  const { language, preserveHref, setLanguage, t } = useOrbitLanguage();
  const isAgent = agentActive ?? active === "agent";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const pageLabels: Record<OrbitNavActive, { en: string; zh: string }> = {
    agent: { en: "iOrbit", zh: "iOrbit" },
    cards: { en: "Contacts", zh: "人脉" },
    events: { en: "Events", zh: "活动" },
    home: { en: "Me", zh: "我的" },
    me: { en: "Me", zh: "我的" },
    schedule: { en: "Calendar", zh: "日程" },
    today: { en: "Today", zh: "Today" },
  };
  const links = [
    ["/today", t({ en: "Today", zh: "Today" }), "today"],
    ["/events", t({ en: "Events", zh: "活动" }), "events"],
    ["/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/contacts", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;
  const menuItems = [
    { active: active === "today", href: productHref("/today"), icon: "target", key: "today", label: t({ en: "Today", zh: "Today" }) },
    { active: active === "events", href: productHref("/events"), icon: "calendar", key: "events", label: t({ en: "Events", zh: "活动" }) },
    { active: active === "schedule", href: productHref("/schedule"), icon: "clock", key: "schedule", label: t({ en: "Calendar", zh: "日程" }) },
    { active: active === "cards", href: productHref("/contacts"), icon: "users", key: "cards", label: t({ en: "Contacts", zh: "人脉" }) },
    { active: active === "me" || active === "home", href: meHref, icon: "user", key: "me", label: t({ en: "Me", zh: "我的" }) },
  ];

  const langButtons: readonly { code: "zh" | "en" | "ja"; label: string; aria: { en: string; zh: string } }[] = [
    { aria: { en: "Switch to Chinese", zh: "切换到中文" }, code: "zh", label: "中" },
    { aria: { en: "Switch to English", zh: "切换到英文" }, code: "en", label: "EN" },
    { aria: { en: "Switch to Japanese", zh: "切换到日文" }, code: "ja", label: "日" },
  ];

  return (
    <>
      <header className="orbit-top-nav orbit-nav-menu">
        <div className="orbit-nav-lead">
          <a aria-label="Orbit" className={`orbit-brand-link hit-44${active === "home" ? " is-active" : ""}`} href={preserveHref("/")} style={{ textDecoration: "none" }}>
            <Logo size={24} withText={false} />
            <span className="orbit-brand-word">
              <span className="orbit-brand-name">Orbit</span>
              <span className="orbit-brand-sub mono">{t({ en: "Powered by the iOrbit matching engine", zh: "由 iOrbit 智能匹配引擎驱动" })}</span>
            </span>
          </a>
          <span className="orbit-nav-page-title">{t(pageLabels[active])}</span>
        </div>

        <nav aria-label={t({ en: "Primary", zh: "主导航" })} className="orbit-nav-links">
          <a aria-current={isAgent ? "page" : undefined} className={`orbit-nav-link${isAgent ? " is-active" : ""}`} href={preserveHref("/app/agent")}>iOrbit</a>
          {links.map(([href, label, key]) => (
            <a
              aria-current={active === key ? "page" : undefined}
              className={`orbit-nav-link${active === key ? " is-active" : ""}`}
              key={href}
              href={preserveHref(productHref(href))}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="orbit-top-actions">
          <span className="orbit-lang-toggle mono">
            {langButtons.map((entry, index) => (
              <span key={entry.code} style={{ display: "contents" }}>
                {index > 0 ? (
                  <span aria-hidden="true" className="orbit-lang-sep">/</span>
                ) : null}
                <button
                  aria-label={t(entry.aria)}
                  aria-pressed={language === entry.code}
                  className={language === entry.code ? "is-active" : ""}
                  onClick={() => setLanguage(entry.code)}
                  type="button"
                >
                  {entry.label}
                </button>
              </span>
            ))}
          </span>
          {rightExtra}
          <OrbitNavAccountControl meHref={meHref} />
          <a aria-label="iOrbit" className={`orbit-nav-iorbit-icon hit-44${isAgent ? " is-active" : ""}`} href={preserveHref("/app/agent")}>
            <Icon name="sparkle" size={18} />
          </a>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t({ en: "Close menu", zh: "关闭菜单" }) : t({ en: "Open menu", zh: "打开菜单" })}
            className="orbit-nav-menu-btn hit-44"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <Icon name={menuOpen ? "x" : "menu"} size={20} />
          </button>
        </div>
      </header>
      {menuOpen ? (
        <div className="orbit-nav-menu-layer">
          <button aria-label={t({ en: "Close menu", zh: "关闭菜单" })} className="orbit-nav-menu-scrim" onClick={() => setMenuOpen(false)} type="button" />
          <nav aria-label={t({ en: "Primary", zh: "主导航" })} className="orbit-nav-menu-panel">
            {menuItems.map((item) => (
              <a
                aria-current={item.active ? "page" : undefined}
                className={`orbit-nav-menu-item${item.active ? " is-active" : ""}`}
                href={preserveHref(item.href)}
                key={item.key}
              >
                <Icon name={item.icon} size={20} />
                <span>{item.label}</span>
                <Icon name="chevR" size={16} style={{ marginLeft: "auto", opacity: 0.5 }} />
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `node --test --import tsx tests/ui/orbit-top-nav-structure.test.ts tests/ui/orbit-top-nav-links.test.ts tests/ui/orbit-product-href.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 浏览器验证（控制器执行）**

桌面 1280px：`/app/today` 顶栏应为 品牌词可见 + 链接组居中（iOrbit/Today/活动/日程/人脉）+ 右侧 语言/收件箱/账号。移动 375px：品牌+「Today」页标题 + iOrbit 图标 + 汉堡；点开汉堡出全屏菜单五项。实现者只需 curl 200 验证。

- [ ] **Step 6: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/orbit-public-shell.tsx" tests/ui/orbit-top-nav-structure.test.ts
git commit -m "fix(nav): restore the unified three-segment nav skeleton and mobile menu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `<html lang>` 恢复（三语）

**Files:**
- Modify: `app/(app)/app/orbit-language-core.ts`（新增 `orbitHtmlLang`）
- Modify: `app/layout.tsx`（async 语言解析）
- Modify: `app/(app)/app/orbit-language-context.tsx`（同步 effect）
- Test: `tests/ui/orbit-html-lang.test.ts`

**Interfaces:**
- Produces: `orbitHtmlLang(language: OrbitLanguage): "en" | "ja" | "zh-CN"`（纯函数，两处消费）。根 layout 保持 `metadata`、`globalStyles`、`themeInitScript`、`suppressHydrationWarning` 全部不变，仅 lang 动态化。

- [ ] **Step 1: Write the failing test**

创建 `tests/ui/orbit-html-lang.test.ts`：

```ts
/**
 * <html lang> 恢复测试。
 *
 * ui 基准在服务端解析语言写入 <html lang>，客户端切换时同步 documentElement.lang；
 * chat-agent 曾把它硬编码为 "en"（EN 衬线字体规则对中/日文永远命中）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { orbitHtmlLang } from "../../app/(app)/app/orbit-language-core";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("orbitHtmlLang maps all three languages", () => {
  assert.equal(orbitHtmlLang("en"), "en");
  assert.equal(orbitHtmlLang("ja"), "ja");
  assert.equal(orbitHtmlLang("zh"), "zh-CN");
});

test("the root layout resolves lang per request instead of hardcoding en", () => {
  const layout = readFileSync(join(projectRoot, "app/layout.tsx"), "utf8");
  assert.ok(layout.includes("orbitHtmlLang"));
  assert.ok(!layout.includes('<html lang="en"'));
  assert.ok(layout.includes("suppressHydrationWarning"), "theme init behavior preserved");
  assert.ok(layout.includes("themeInitScript"), "theme script preserved");
});

test("the language context syncs documentElement.lang on switch", () => {
  const context = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-language-context.tsx"),
    "utf8",
  );
  assert.ok(context.includes("document.documentElement.lang = orbitHtmlLang("));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/ui/orbit-html-lang.test.ts`
Expected: FAIL——`orbitHtmlLang` 不存在。

- [ ] **Step 3: Implement**

`orbit-language-core.ts` 末尾追加：

```ts
// <html lang> 值：屏幕阅读器与 html[lang="en"] 的衬线字体规则都依赖它。
export function orbitHtmlLang(language: OrbitLanguage): "en" | "ja" | "zh-CN" {
  if (language === "en") return "en";
  if (language === "ja") return "ja";
  return "zh-CN";
}
```

`app/layout.tsx`：函数签名改 `export default async function RootLayout({ children }) {`，函数体开头加（镜像 ui 基准的 try/catch 动态 import 模式，保证非请求环境不炸）：

```tsx
  let rawLanguage: string | undefined;
  try {
    const { cookies, headers } = await import("next/headers");
    const requestHeaders = await headers();
    const cookieStore = await cookies();
    rawLanguage =
      requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value ?? undefined;
  } catch {
    rawLanguage = undefined;
  }
  const htmlLang = orbitHtmlLang(normalizeOrbitLanguage(rawLanguage));
```

`<html lang="en" suppressHydrationWarning>` 改为 `<html lang={htmlLang} suppressHydrationWarning>`。文件顶部加：

```ts
import { normalizeOrbitLanguage, orbitHtmlLang } from "./(app)/app/orbit-language-core";
```

`orbit-language-context.tsx`：import 区把 `orbitHtmlLang` 加进来自 `./orbit-language-core` 的既有 import（并确保 `useEffect` 已 import），provider 内部加：

```ts
  useEffect(() => {
    document.documentElement.lang = orbitHtmlLang(language);
  }, [language]);
```

- [ ] **Step 4: Run tests**

Run: `node --test --import tsx tests/ui/orbit-html-lang.test.ts tests/ui/theme.test.ts`
Expected: PASS（theme 测试防主题脚本被误伤）。

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/layout.tsx" "app/(app)/app/orbit-language-core.ts" "app/(app)/app/orbit-language-context.tsx" tests/ui/orbit-html-lang.test.ts
git commit -m "fix(i18n): restore request-resolved html lang with ja support

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 挂回 `OrbitResponsiveA11y` + 桌面字体管线

**Files:**
- Modify: `app/(app)/app/layout.tsx`
- Test: `tests/ui/orbit-a11y-runtime-mounted.test.ts`

**背景（已核实）：** 组件文件与 ui 基准逐字节相同，只是不再被挂载；随之丢失的还有 `<link href="/iorbit-starfield/fonts/desktop.css">`——所有 `/app` 内页因此拿不到 Noto Sans SC 字体包（静默回退系统 CJK 字体）。

- [ ] **Step 1: Write the failing test**

创建 `tests/ui/orbit-a11y-runtime-mounted.test.ts`：

```ts
/**
 * OrbitResponsiveA11y 挂载测试。
 *
 * 13 个页面依赖它给 orbit-desktop-only/orbit-mobile-only 双树打 inert/aria-hidden；
 * 桌面字体 link 也在同一处丢失过。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const layout = readFileSync(
  join(projectRoot, "app/(app)/app/layout.tsx"),
  "utf8",
);

test("the app layout mounts the responsive a11y runtime", () => {
  assert.ok(layout.includes("OrbitResponsiveA11y"));
});

test("the app layout links the desktop font bundle", () => {
  assert.ok(layout.includes("/iorbit-starfield/fonts/desktop.css"));
});

test("the theme system stays mounted", () => {
  assert.ok(layout.includes("OrbitThemeStyles"));
  assert.ok(layout.includes("OrbitThemeToggle"));
});
```

- [ ] **Step 2: Run test to verify it fails** — `node --test --import tsx tests/ui/orbit-a11y-runtime-mounted.test.ts`

- [ ] **Step 3: Implement**

`app/(app)/app/layout.tsx` import 区加 `import { OrbitResponsiveA11y } from "./orbit-responsive-a11y";`，return 改为：

```tsx
  return (
    <OrbitLanguageProvider initialLanguage={language}>
      <link href="/iorbit-starfield/fonts/desktop.css" rel="stylesheet" />
      <OrbitResponsiveA11y />
      <OrbitThemeStyles />
      {children}
      <OrbitThemeToggle />
    </OrbitLanguageProvider>
  );
```

- [ ] **Step 4: Run tests** — 该测试 + `tests/pages/app-today-route-view-model.test.ts`（抽查内页不受影响）。Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/layout.tsx" tests/ui/orbit-a11y-runtime-mounted.test.ts
git commit -m "fix(a11y): remount OrbitResponsiveA11y and the desktop font bundle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 恢复 admin / register 封面图

**Files:**
- Modify: `app/(app)/app/admin/orbit-real-admin.tsx`（约 :112、:162 两处 `Cover`）
- Modify: `app/(app)/app/register/orbit-real-register.tsx`（约 :206、:214 两处 `Cover`）
- Test: `tests/pages/orbit-cover-photo-usage.test.ts`

**恢复模式（照抄 `agent/orbit-real-agent.tsx:1084` 的既有在用调用）：** 两文件各加 `import { eventCoverPhoto } from "../orbit-landing-route-view-model";`，每个 `Cover` 调用点加 `imageAlt={event.name} imageUrl={eventCoverPhoto(event.code)}`，并把原 `monogram={...}` 改为 `monogram={eventCoverPhoto(event.code) ? null : {...原值}}`（有真实图时不显示字母占位）。具体 event 变量名以各调用点局部作用域为准（admin 里是 `event`，register 的 PassTicket 里以 ui 基准 `git show ui/orbit-html-reference-replacement:repos/orbits/app/\(app\)/app/register/orbit-real-register.tsx` 第 207/215 行为准照抄）。

- [ ] **Step 1: Write the failing test**

创建 `tests/pages/orbit-cover-photo-usage.test.ts`：

```ts
/**
 * 封面图使用回归测试：admin 与 register 必须像 events/home/agent 一样
 * 通过 eventCoverPhoto 渲染真实封面，而不是永远的字母占位图。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

for (const file of [
  "app/(app)/app/admin/orbit-real-admin.tsx",
  "app/(app)/app/register/orbit-real-register.tsx",
]) {
  test(`${file} renders real event covers`, () => {
    const source = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(source.includes("eventCoverPhoto"), "imports/uses eventCoverPhoto");
    assert.ok(
      (source.match(/imageUrl=\{eventCoverPhoto\(/g) ?? []).length >= 2,
      "both Cover call sites pass imageUrl",
    );
  });
}
```

- [ ] **Step 2: Run to verify FAIL**，**Step 3: Implement**（按上面的恢复模式，逐调用点比照 ui 基准原文），**Step 4: Run to verify PASS**。再跑 `node --test --import tsx tests/pages/app-today-decision-panel.test.tsx` 抽查无收敛破坏。

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/admin/orbit-real-admin.tsx" "app/(app)/app/register/orbit-real-register.tsx" tests/pages/orbit-cover-photo-usage.test.ts
git commit -m "fix(ui): restore real event cover photos on admin and register

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: MobileBar 主题 token 化 + Today/All actions 移动端单列

**Files:**
- Modify: `app/(app)/app/orbit-account-shell.tsx`（MobileBar，约 :79-93）
- Modify: `app/(app)/app/today/page.tsx`
- Modify: `app/(app)/app/contacts/all-actions/page.tsx`
- Test: 在 `tests/ui/orbit-sidebar-width-constant.test.ts` 追加 2 条断言（同文件主题贴合）

**MobileBar：** 把 `background: transparent ? "transparent" : "rgba(255,255,255,0.86)"` 的硬编码浅色改为主题变量：`background: transparent ? "transparent" : "var(--glass-bar, rgba(255,255,255,0.86))"`（保留原值为回退），其余不动。

**Today 移动端：** `page.tsx` 里两栏 grid 的 `<div style={{...gridTemplateColumns...}}>` 改为 `<div className="orbit-today-columns">`，并在该 div 前插入：

```tsx
      <style>{`
        .orbit-today-columns { align-items: start; display: grid; gap: 28px; grid-template-columns: minmax(0, 1fr) minmax(0, 380px); }
        @media (max-width: 760px) { .orbit-today-columns { grid-template-columns: 1fr; } }
      `}</style>
```

**All actions 移动端：** 同法，把 `gridTemplateColumns: \`${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr\`` 的容器换成 `className="orbit-all-actions-columns"` + 样式块：

```tsx
      <style>{`
        .orbit-all-actions-columns { display: grid; grid-template-columns: ${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr; height: calc(100dvh - 64px); min-height: 0; }
        @media (max-width: 760px) { .orbit-all-actions-columns { grid-template-columns: 1fr; height: auto; } .orbit-all-actions-columns > aside { display: none; } }
      `}</style>
```

**测试追加**（`tests/ui/orbit-sidebar-width-constant.test.ts` 末尾）：

```ts
test("the two ledger pages collapse to one column on mobile", () => {
  for (const file of [
    "app/(app)/app/today/page.tsx",
    "app/(app)/app/contacts/all-actions/page.tsx",
  ]) {
    const pageSource = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(pageSource.includes("@media (max-width: 760px)"), file);
  }
});

test("the mobile bar uses a theme token, not hardcoded light glass", () => {
  const shellSource = source("app/(app)/app/orbit-account-shell.tsx");
  assert.ok(shellSource.includes("var(--glass-bar"));
});
```

- [ ] **Step 1-4:** 照常 RED → 实现 → GREEN（跑 `tests/ui/orbit-sidebar-width-constant.test.ts` 7 条全过 + `tests/pages/app-all-actions-settings.test.tsx`）。curl 两页 200。

- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/orbit-account-shell.tsx" "app/(app)/app/today/page.tsx" "app/(app)/app/contacts/all-actions/page.tsx" tests/ui/orbit-sidebar-width-constant.test.ts
git commit -m "fix(ui): theme-token the mobile bar and collapse ledger pages on mobile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: smoke 测试对齐现实 + lint 列表

**Files:**
- Modify: `tests/smoke.test.tsx`
- Modify: `package.json`（lint 列表追加本计划新测试）

**背景（已核实）：** smoke 测试断言 `data-orbit-agent-hero="root"` 等标记，但根路由实际渲染 `OrbitStarfieldHome`（输出 `data-orbit-real-page="starfield-home"`，见 `orbit-starfield-home.tsx:33`）。`orbit-agent-hero.tsx`/`orbit-real-landing-page.tsx` 是未接线的死代码（不删——可能是并行会话的进行中工作），只把测试断言改为现实。

- [ ] **Step 1:** 读 `tests/smoke.test.tsx` 全文，把失败断言组（`data-orbit-agent-hero`、`data-orbit-activity-overview`、`data-orbit-event-context` 等）替换为对现实的断言：渲染根路由组件后 `assert.match(html, /data-orbit-real-page="starfield-home"/)`。保持测试的整体结构（渲染入口、其余通过的断言）不变，只改失效断言；若整测试就是围绕旧首页写的，重写为"根路由渲染星空首页"的最小冒烟断言。
- [ ] **Step 2:** Run `node --test --import tsx tests/smoke.test.tsx` — Expected: PASS（此前 FAIL）。
- [ ] **Step 3:** package.json lint 列表末尾追加：`"tests/ui/orbit-product-href.test.ts" "tests/ui/orbit-top-nav-structure.test.ts" "tests/ui/orbit-html-lang.test.ts" "tests/ui/orbit-a11y-runtime-mounted.test.ts" "tests/pages/orbit-cover-photo-usage.test.ts"`，run `npm run lint`（新文件零错误；既有无关错误如实记录不修）。
- [ ] **Step 4:** Run `npm test` — Expected: 失败数 **64**（较基线 65 减 1，因 smoke 修复；零新增失败）。如实记录实际数字。
- [ ] **Step 5: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add tests/smoke.test.tsx package.json
git commit -m "test(smoke): assert the starfield root instead of the unwired landing page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Follow-up（本计划不做）

1. `orbit-agent-hero.tsx` / `orbit-real-landing-page.tsx` 死代码去留——疑似并行会话进行中工作，需人工确认后再删或接线。
2. followups/schedule 默认折叠的信息密度取舍——产品决定，非回归。
3. `ce976016`/`3bd2a20b`（星空收尾场景/标语单行）建议抽查 diff 复核（低风险，未逐行验证）。
4. docs/designs 的 14 个设计文档文件仍缺——是否搬运由用户决定（纯文档）。
