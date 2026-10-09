const React = require("react");

function Svg({
  accessibilityElementsHidden,
  accessibilityLabel,
  accessibilityRole,
  accessible,
  children,
  importantForAccessibility,
  pointerEvents,
  ...props
}) {
  return React.createElement("svg", props, children);
}

function Path({ accessible, onPress, ...props }) {
  return React.createElement("path", { ...props, onClick: onPress });
}

function Circle({ accessible, ...props }) {
  return React.createElement("circle", props);
}

function Rect({ accessible, ...props }) {
  return React.createElement("rect", props);
}

module.exports = { Circle, Path, Rect, default: Svg, __esModule: true };
