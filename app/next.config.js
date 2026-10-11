/** @type {import('next').NextConfig} */
// The default build is the PUBLIC demo (test ledger in the browser, no chain), so a host
// that deploys with no settings gets the safe build. NEXT_PUBLIC_VARANASI_MODE=local
// (scripts/app-demo.sh) builds the local chain demo into .next. Off Vercel the public
// build goes to .next-public so it never overwrites the local chain build.
const isPublic = process.env.NEXT_PUBLIC_VARANASI_MODE !== "local";
module.exports = {
  reactStrictMode: true,
  distDir: isPublic && !process.env.VERCEL ? ".next-public" : ".next",
  poweredByHeader: false,
};
