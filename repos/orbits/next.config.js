/**
 * Next.js 应用配置。
 *
 * 当前只关闭 `X-Powered-By` 响应头，避免在响应里暴露框架指纹。
 */
/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
};

module.exports = nextConfig;
