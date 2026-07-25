// 服务端返回 401 时，本地保存的会话已经没用了。
//
// 发现这件事的地方（API client）拿不到 React context，也不能导航；
// 能处理这件事的地方（AuthSessionProvider）又不参与每一次请求。
// 这个模块只做中间那一层通知，不含任何策略——要不要登出、要不要跳转，
// 由订阅方决定。

type SessionExpiryListener = () => void;

const listeners = new Set<SessionExpiryListener>();

export function onSessionExpired(listener: SessionExpiryListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function notifySessionExpired(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      // 一个订阅方出错不应该影响其他订阅方，也不应该让触发它的那次请求失败。
      console.warn("Orbit 会话过期处理失败", error);
    }
  });
}
