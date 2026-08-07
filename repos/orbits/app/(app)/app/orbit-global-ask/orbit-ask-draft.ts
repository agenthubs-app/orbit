/**
 * 全局提问输入框的草稿存储。
 *
 * 用 sessionStorage 而不是 URL 或 localStorage，是两个刻意的选择：
 *
 * - 不进 URL：用户敲进去的是自己的原话，可能带人名、公司、私事。塞进 query
 *   string 就会落进服务端访问日志和浏览器历史，而这两处我们都清不掉。跨页
 *   提问因此走 sessionStorage 暂存 + 干净跳转。
 * - 不用 localStorage：需求是「登录期间保留，关掉页面之前」。sessionStorage
 *   正好是标签页生命周期，关掉即消失，不会在共用电脑上留下上一个人的问题。
 *
 * 所有读写都吞掉异常：Safari 无痕模式下 sessionStorage 会直接抛，草稿丢了是
 * 小事，把整个 layout 崩掉是大事。
 */

const DRAFT_KEY = "orbit.ask.draft";
const PENDING_KEY = "orbit.ask.pending";

/** 跨页提问的交接单：在来源页写入，落到 iOrbit 页后取出并立即清除。 */
export interface OrbitPendingAsk {
  /** 用户的原话。 */
  query: string;
  /** 发起提问时所在的路由，供 iOrbit 页说明这轮对话从哪来。 */
  from: string | null;
  /** 用户当时看到并认可的上下文标签；用户划掉 chip 时为 null。 */
  context: string | null;
}

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readAskDraft(): string {
  try {
    return session()?.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeAskDraft(value: string): void {
  try {
    const store = session();

    if (!store) return;
    if (value) store.setItem(DRAFT_KEY, value);
    else store.removeItem(DRAFT_KEY);
  } catch {
    // 存不下就算了，输入框里的内容仍然在 React state 里。
  }
}

export function clearAskDraft(): void {
  writeAskDraft("");
}

export function stashPendingAsk(pending: OrbitPendingAsk): void {
  try {
    session()?.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // 交接失败时 iOrbit 页会停在 dashboard，用户可以重问；不做静默重试。
  }
}

/** 读取并立即清除待办提问——同一句话只应该被发起一次。 */
export function takePendingAsk(): OrbitPendingAsk | null {
  try {
    const store = session();
    const raw = store?.getItem(PENDING_KEY);

    if (!raw) return null;
    store?.removeItem(PENDING_KEY);

    const parsed = JSON.parse(raw) as Partial<OrbitPendingAsk> | null;
    const query = typeof parsed?.query === "string" ? parsed.query.trim() : "";

    if (!query) return null;

    return {
      context: typeof parsed?.context === "string" ? parsed.context : null,
      from: typeof parsed?.from === "string" ? parsed.from : null,
      query,
    };
  } catch {
    return null;
  }
}

/** 登出时清干净：草稿和待办提问都属于上一个登录态。 */
export function clearOrbitAskSession(): void {
  try {
    const store = session();

    store?.removeItem(DRAFT_KEY);
    store?.removeItem(PENDING_KEY);
  } catch {
    // 同上：清理失败不值得中断登出流程。
  }
}
