import { loadEnvConfig } from "@next/env";
import { createConfiguredPasswordResetRuntime } from "../features/auth/password-reset-factory";
import { deliverPasswordResetMail } from "../features/auth/password-reset-service";

loadEnvConfig(process.cwd());

async function main() {
  const runtime = createConfiguredPasswordResetRuntime();
  if (!runtime) throw new Error("Configure the live database, AUTH_SECRET, ORBIT_PUBLIC_ORIGIN, ORBIT_AUTH_RESEND_API_KEY and ORBIT_AUTH_MAIL_FROM.");
  let stopped = false;
  process.once("SIGTERM", () => { stopped = true; });
  process.once("SIGINT", () => { stopped = true; });
  console.info("Password reset worker ready");
  while (!stopped) {
    try {
      const result = await deliverPasswordResetMail(runtime);
      if (result !== "idle") console.info(JSON.stringify({ worker: "password-reset", result }));
      if (result === "sent") continue;
    } catch {
      console.error("Password reset worker database operation failed; retrying");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().then(() => process.exit(0)).catch(() => {
  console.error("Password reset worker could not start. Check required configuration.");
  process.exit(1);
});
