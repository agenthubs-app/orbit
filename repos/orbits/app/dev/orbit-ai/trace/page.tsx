/**
 * Orbit AI trace 调试页。
 *
 * 这里只挂载 trace debugger 组件，用来查看 Agent/AI 执行链的调试信息。
 */
import "../../../globals.css";
import { OrbitAiTraceDebugger } from "./orbit-ai-trace-debugger";

export default function OrbitAiTraceDebugPage() {
  return <OrbitAiTraceDebugger />;
}
