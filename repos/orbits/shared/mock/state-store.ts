export interface MockStateStore<TState extends object> {
  getInitialState: () => TState;
  getState: () => TState;
  replaceState: (nextState: TState) => TState;
  reset: (nextInitialState?: TState) => TState;
  updateState: (updater: (draft: TState) => TState | void) => TState;
}

export function cloneMockState<TState>(value: TState): TState {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TState;
}

export function createMockStateStore<TState extends object>(
  initialState: TState,
): MockStateStore<TState> {
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
      const draft = cloneMockState(currentState);
      const updatedState = updater(draft);
      const nextState =
        updatedState === undefined ? draft : (updatedState as TState);
      currentState = cloneMockState(nextState);
      return cloneMockState(currentState);
    },
  };
}
