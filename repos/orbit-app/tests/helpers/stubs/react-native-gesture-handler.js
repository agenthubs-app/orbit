// Test stub: gestures are inert; GestureDetector renders its child. Gesture logic
// lives in pure functions (swipe-logic.ts, sheet-logic.ts) with their own tests.
// Sprint 0147: a pan that activates after a long press is emulated with pointer
// events (hold, move, release), so a browser harness can drive the home widget drag.
const React = require("react");
const { View } = require("react-native-web");

function chain() {
  const config = {};
  const gesture = { __config: config };
  for (const name of ["activeOffsetX", "activeOffsetY", "failOffsetX", "failOffsetY", "onBegin", "onStart", "onUpdate", "onChange", "onEnd", "onFinalize", "enabled", "minDistance", "activateAfterLongPress"]) {
    gesture[name] = (value) => { config[name] = value; return gesture; };
  }
  return gesture;
}

function startLongPressPan(latest, down) {
  const x0 = down.clientX, y0 = down.clientY;
  let active = false, done = false;
  const call = (name, ...args) => latest.current?.[name]?.(...args);
  const event = (pointer) => ({ translationX: pointer.clientX - x0, translationY: pointer.clientY - y0, absoluteX: pointer.clientX, absoluteY: pointer.clientY });
  const finish = (pointer, success) => {
    if (done) return;
    done = true; clearTimeout(timer);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
    if (active) call("onEnd", event(pointer), success);
    call("onFinalize", event(pointer), success);
  };
  const move = (pointer) => {
    if (active) call("onUpdate", event(pointer));
    else if (Math.hypot(pointer.clientX - x0, pointer.clientY - y0) > 10) finish(pointer, false);
  };
  const up = (pointer) => finish(pointer, active);
  const cancel = (pointer) => finish(pointer, false);
  const timer = setTimeout(() => { active = true; call("onStart", event(down)); }, latest.current.activateAfterLongPress);
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
}

function GestureDetector({ gesture, children }) {
  const latest = React.useRef(null);
  latest.current = gesture?.__config ?? null;
  const config = latest.current;
  if (!config || config.activateAfterLongPress === undefined || config.enabled === false) return children;
  return React.cloneElement(children, { onPointerDown: (down) => { if (latest.current?.enabled !== false) startLongPressPan(latest, { clientX: down.clientX, clientY: down.clientY }); } });
}

module.exports = {
  __esModule: true,
  Gesture: { Pan: chain, Tap: chain },
  GestureDetector,
  GestureHandlerRootView: (props) => React.createElement(View, props),
};
