/** @type {import('next').NextConfig} */
const BACKEND_URL = (process.env.NEXT_PUBLIC_SIGNAL_URL || "").trim();

const nextConfig = {
  reactStrictMode: true,
  optimizeFonts: false,
  async redirects() {
    return [
      { source: "/about", destination: "/docs#what", permanent: false },
      { source: "/mandate", destination: "/docs#mandate", permanent: false },
      { source: "/proof", destination: "/docs#proof", permanent: false },
    ];
  },
  async rewrites() {
    // Same-origin proxy: set NEXT_PUBLIC_SIGNAL_URL=/api/backend in production
    // to avoid CORS entirely. Only rewrite when the env points at a real host.
    if (!BACKEND_URL || BACKEND_URL.startsWith("/")) return [];
    const dest = BACKEND_URL.replace(/\/$/, "");
    // If env already includes /v1/signal, proxy from its root instead.
    const root = dest.replace(/\/v1\/(signal|receipts|finance.*)?$/, "").replace(/\/v1$/, "");
    return [{ source: "/api/backend/:path*", destination: `${root}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
