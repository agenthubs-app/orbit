// MockStateStore 是所有 mock capability 共享的内存状态容器。
// 它刻意不做持久化：每个测试或开发请求都可以用确定性 seed 重建状态，
// 避免 mock 数据在浏览器/服务端之间产生隐式全局副作用。
export interface MockStateStore<TState extends object> {
  getInitialState: () => TState;
  getState: () => TState;
  replaceState: (nextState: TState) => TState;
  reset: (nextInitialState?: TState) => TState;
  updateState: (updater: (draft: TState) => TState | void) => TState;
}

export function cloneMockState<TState>(value: TState): TState {
  // 所有读写都返回 clone，防止调用方拿到引用后绕过 updateState 修改内部状态。
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TState;
}

export function createMockStateStore<TState extends object>(
  initialState: TState,
): MockStateStore<TState> {
  // initialSnapshot 是 reset 的基线；currentState 是当前可变快照。
  // 二者都 clone，确保传入的 initialState 后续被外部修改也不会影响 store。
  let initialSnapshot = cloneMockState(initialState);
  let currentState = cloneMockState(initialSnapshot);

  return {
    getInitialState() {
      return cloneMockState(initialSnapshot);
    },
    getState() {
      return cloneMockState(currentState);
    },
    replaceState(nextState) {
      // replaceState 用于 scenario/reset 这类整体切换，而不是细粒度 patch。
      currentState = cloneMockState(nextState);
      return cloneMockState(currentState);
    },
    reset(nextInitialState) {
      if (nextInitialState !== undefined) {
        initialSnapshot = cloneMockState(nextInitialState);
      }

      currentState = cloneMockState(initialSnapshot);
      return cloneMockState(currentState);
    },
    updateState(updater) {
      // updater 拿到的是 draft clone；返回值为空时使用被原地修改的 draft。
      const draft = cloneMockState(currentState);
      const updatedState = updater(draft);
      const nextState =
        updatedState === undefined ? draft : (updatedState as TState);
      currentState = cloneMockState(nextState);
      return cloneMockState(currentState);
    },
  };
}
