// Node test runner only: Next.js resolves `import "./x.css"` in layouts at
// build time, but plain Node cannot load a stylesheet. Tests that import such
// a module (e.g. app/layout.tsx, which loads the generated design tokens since
// R01) get an empty module instead. Production builds never load this file.
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    return nextLoad(url, context);
  },
});
