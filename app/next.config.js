/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Server routes read contract ABIs and the local deployment at runtime.
  experimental: { serverComponentsExternalPackages: [] },
};
