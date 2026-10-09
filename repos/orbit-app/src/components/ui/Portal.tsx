import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

// R04: overlays (dialog, sheets, drawer, toast) render here, above every screen,
// instead of each screen opening its own RN <Modal>. Mount <UiPortalHost> once at
// the root (app/_layout.tsx). Later portals stack on top of earlier ones.
type PortalApi = { mount: (key: number, node: ReactNode) => void; unmount: (key: number) => void };
const PortalContext = createContext<PortalApi | null>(null);
let nextKey = 1;

export function UiPortalHost({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<[number, ReactNode][]>([]);
  const api = useMemo<PortalApi>(() => ({
    mount: (key, node) => setNodes((current) => {
      const index = current.findIndex(([existing]) => existing === key);
      if (index === -1) return [...current, [key, node]];
      const next = [...current];
      next[index] = [key, node];
      return next;
    }),
    unmount: (key) => setNodes((current) => current.filter(([existing]) => existing !== key)),
  }), []);
  return (
    <PortalContext.Provider value={api}>
      {children}
      {nodes.length ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {nodes.map(([key, node]) => <View key={key} pointerEvents="box-none" style={StyleSheet.absoluteFill}>{node}</View>)}
        </View>
      ) : null}
    </PortalContext.Provider>
  );
}

/** Renders children in the root host; without a host (tests, showcase cells) renders in place. */
export function UiPortal({ children }: { children: ReactNode }) {
  const api = useContext(PortalContext);
  const key = useRef(nextKey++).current;
  useEffect(() => {
    if (!api) return;
    api.mount(key, children);
  });
  useEffect(() => () => api?.unmount(key), [api, key]);
  return api ? null : <>{children}</>;
}
