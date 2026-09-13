import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { MainTab } from "../view-models/app-navigation";

// Original geometry from the approved 2026-09-12 handoff's TabBar.dc.html.
// Only SVG element names/attributes are translated for the native renderer.
export function OrbitNavigationIcon({ name, size = 22, color }: {
  name: MainTab | "ai";
  size?: number;
  color: string;
}) {
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {name === "home" ? <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> : null}
      {name === "contacts" ? <><Circle cx={9} cy={8} r={3.5} /><Path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><Circle cx={17} cy={9} r={2.5} /><Path d="M16 15.5a5 5 0 0 1 5.5 4.5" /></> : null}
      {name === "ai" ? <><Circle cx={12} cy={12} r={5} /><Path d="M3.5 9.5c-1.5 3 3 8 10 8 6 0 9.5-3 7-6.5" /><Circle cx={19} cy={6} r={1.2} fill={color} stroke="none" /></> : null}
      {name === "events" ? <><Rect x={3} y={5} width={18} height={16} rx={3} /><Path d="M3 10h18M8 3v4M16 3v4" /></> : null}
      {name === "profile" ? <><Circle cx={12} cy={8} r={4} /><Path d="M4 21a8 8 0 0 1 16 0" /></> : null}
    </Svg>
  );
}
