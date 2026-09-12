/** @type {import('next').NextConfig} */
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
};

module.exports = nextConfig;
