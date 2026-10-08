/**
 * Next.js 应用配置。
 *
 * 这里关闭 `X-Powered-By` 响应头，避免在响应里暴露框架指纹。
 * `/api` 允许 Expo web/mobile dev clients 跨端口读取 API。
 * 浏览器会话只在配置了明确 origin 时启用 credentials，绝不和通配符混用。
 */
/** @type {import("next").NextConfig} */
const apiCorsOrigin = process.env.ORBIT_API_CORS_ORIGIN ?? "*";

// W0057（SC-05）：构建时间戳写进 bundle（`process.env.ORBIT_BUILD_AT`），心跳链按「构建更新者接管」跟随新部署。
// 可由环境变量显式指定（同一构建多实例一致）；否则取本次构建开始时刻。
const orbitBuildAt = process.env.ORBIT_BUILD_AT || new Date().toISOString();

const nextConfig = {
  env: {
    ORBIT_BUILD_AT: orbitBuildAt,
  },
  // W0016：同一目录跑第二个 dev server（验收 server，端口 3001）时用独立构建目录，
  // 避免与 3000 端口 server 争用 `.next`。不设环境变量时仍是 `.next`，行为不变。
  distDir: process.env.ORBIT_NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: __dirname,
  typescript: {
    tsconfigPath:
      process.env.NODE_ENV === "production" ? "tsconfig.build.json" : "tsconfig.json",
  },
  // dev 模式经 zrok 隧道(orbit.shares.zrok.io)对外演示时，Next 16 的跨
  // origin 防护会静默拒绝 hydration 与 HMR websocket；显式放行该域名。
  // 仅影响 dev server，生产构建忽略此项。
  allowedDevOrigins: ["orbit.shares.zrok.io", "127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: apiCorsOrigin,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          ...(apiCorsOrigin === "*"
            ? []
            : [
                {
                  key: "Access-Control-Allow-Credentials",
                  value: "true",
                },
              ]),
          {
            key: "Access-Control-Expose-Headers",
            value:
              "X-Orbit-Feature-Mode, X-Orbit-Privacy, X-Orbit-Runtime-Boundary",
          },
        ],
      },
    ];
  },
  poweredByHeader: false,
  // 批量名片导入的 PDF 拆页/HEIC 转码依赖原生二进制；必须留在 Node 运行时
  // 由 require 加载，不能进 webpack bundle。
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "heic-convert", "sharp"],
  // pdf.js imports its Node worker through a computed path. Next's static
  // tracing includes pdf.mjs but cannot discover this runtime dependency.
  outputFileTracingIncludes: {
    "/api/queues/business-card": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/contact-drafts/business-card/batches": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

module.exports = nextConfig;
