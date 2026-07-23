// OAuth provider 门控:ID 与 SECRET 两个 env 都在才启用(照抄参考实现
// seiki-world 的单一事实源模式)。启用列表在服务端计算后作为 props 传给
// 客户端按钮,env 值永不进 bundle。半配置时告警,便于发现漏配。
export const ORBIT_OAUTH_PROVIDER_IDS = ["google"] as const;

export type OrbitOAuthProviderId = (typeof ORBIT_OAUTH_PROVIDER_IDS)[number];

const PROVIDER_ENV_KEYS: Record<
  OrbitOAuthProviderId,
  { id: string; secret: string }
> = {
  google: { id: "AUTH_GOOGLE_ID", secret: "AUTH_GOOGLE_SECRET" },
};

function readEnv(key: string): string | null {
  const value = process.env[key]?.trim();

  return value ? value : null;
}

export function enabledOAuthProviders(): readonly OrbitOAuthProviderId[] {
  return ORBIT_OAUTH_PROVIDER_IDS.filter((providerId) => {
    const keys = PROVIDER_ENV_KEYS[providerId];
    const hasId = readEnv(keys.id) !== null;
    const hasSecret = readEnv(keys.secret) !== null;

    if (hasId !== hasSecret) {
      console.warn(
        `[auth] OAuth provider "${providerId}" is half-configured: set both ${keys.id} and ${keys.secret} to enable it.`,
      );
    }

    return hasId && hasSecret;
  });
}
