export function passwordResetTokenFromFragment(fragment: string | undefined): string | null {
  if (!fragment) return null;
  const params = new URLSearchParams(fragment.startsWith("#") ? fragment.slice(1) : fragment);
  const tokens = params.getAll("token");
  const token = tokens[0];
  return tokens.length === 1 && token !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(token) ? token : null;
}

export function passwordResetTokenFromLink(link: string, baseUrl: string): string | null {
  try {
    const url = new URL(link.trim());
    const base = new URL(baseUrl);
    const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
    const secure = url.protocol === "https:" || (
      url.protocol === "http:" && base.protocol === "http:" && loopback(url.hostname) && loopback(base.hostname)
    );
    // URL.search is empty even for a bare '?'; preserve that rejection via href.
    const withoutFragment = new URL(url.href);
    withoutFragment.hash = "";
    if (!secure || url.origin !== base.origin || url.username || url.password ||
        withoutFragment.href.includes("?") || url.pathname !== "/app/account/reset-password") return null;
    return passwordResetTokenFromFragment(url.hash);
  } catch {
    return null;
  }
}

export function passwordResetValidation(password: string, confirmation: string): string | null {
  if (password.length < 8) return "新密码至少 8 位。";
  if (new TextEncoder().encode(password).byteLength > 72) return "新密码不能超过 72 个 UTF-8 字节。";
  if (password !== confirmation) return "两次输入的密码不一致。";
  return null;
}
