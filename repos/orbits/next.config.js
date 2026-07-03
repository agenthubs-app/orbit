/**
 * Next.js 应用配置。
 *
 * 这里关闭 `X-Powered-By` 响应头，避免在响应里暴露框架指纹。
 * `/api` 允许 Expo web/mobile dev clients 跨端口读取 API；不启用 credentials。
 */
/** @type {import("next").NextConfig} */
const apiCorsOrigin = process.env.ORBIT_API_CORS_ORIGIN ?? "*";

const nextConfig = {
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
};

module.exports = nextConfig;
